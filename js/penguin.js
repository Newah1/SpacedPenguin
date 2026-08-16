// Penguin class with real sprite animations
import plog from './penguinLogger.js';
import { integratePlanetGravity, LEGACY_PHYSICS_FPS } from './simulation.js';
import { LEVEL_DEFAULTS, SIMULATION_CONFIG, WORLD_CONFIG } from './config/gameConfig.js';
import { RENDER_CONFIG } from './config/renderConfig.js';
import { penguinAnimationAssetPath } from './config/assetConfig.js';
import { AudioCue, getAudioCue } from './config/audioConfig.js';

// All Penguin instances use the same animation assets. Keep one bounded set of
// processed frames so the menu and live game do not repeat pixel conversion.
const colorKeyedFrameCache = new Map();

function createColorKeyedFrames(spriteSheet, metadata) {
    const source = spriteSheet.currentSrc || spriteSheet.src || metadata.name;
    const tolerance = RENDER_CONFIG.penguin.colorKeyTolerance;
    const cacheKey = `${source}:${metadata.frame_width}x${metadata.frame_height}:${tolerance}`;
    const cached = colorKeyedFrameCache.get(cacheKey);
    if (cached) return cached;

    const frameCount = metadata.frame_count ?? metadata.registration_points?.length ?? 0;
    const frameWidth = metadata.frame_width;
    const frameHeight = metadata.frame_height;
    const frames = Array.from({ length: frameCount }, (_, frameIndex) => {
        const canvas = document.createElement('canvas');
        canvas.width = frameWidth;
        canvas.height = frameHeight;
        const context = canvas.getContext('2d');
        context.drawImage(
            spriteSheet,
            frameIndex * frameWidth,
            0,
            frameWidth,
            frameHeight,
            0,
            0,
            frameWidth,
            frameHeight
        );

        const imageData = context.getImageData(0, 0, frameWidth, frameHeight);
        const pixels = imageData.data;
        const isColorKey = (x, y) => {
            const index = (y * frameWidth + x) * 4;
            return pixels[index + 3] > 0 &&
                pixels[index] > 255 - tolerance &&
                pixels[index + 1] > 255 - tolerance &&
                pixels[index + 2] > 255 - tolerance;
        };
        const isTransparent = (x, y) => pixels[(y * frameWidth + x) * 4 + 3] === 0;

        // Existing transparent pixels are known background, including transparent
        // areas that do not reach the rectangular frame boundary. Expand that
        // background into adjacent key-colored pixels while colored sprite pixels
        // continue to protect the enclosed white plumage.
        const visited = new Uint8Array(frameWidth * frameHeight);
        const queue = [];
        const enqueue = (x, y) => {
            const offset = y * frameWidth + x;
            if (visited[offset] || (!isTransparent(x, y) && !isColorKey(x, y))) return;
            visited[offset] = 1;
            queue.push(offset);
        };

        for (let y = 0; y < frameHeight; y++) {
            for (let x = 0; x < frameWidth; x++) {
                if (isTransparent(x, y)) enqueue(x, y);
            }
        }
        for (let x = 0; x < frameWidth; x++) {
            enqueue(x, 0);
            enqueue(x, frameHeight - 1);
        }
        for (let y = 1; y < frameHeight - 1; y++) {
            enqueue(0, y);
            enqueue(frameWidth - 1, y);
        }

        for (let cursor = 0; cursor < queue.length; cursor++) {
            const offset = queue[cursor];
            const x = offset % frameWidth;
            const y = Math.floor(offset / frameWidth);
            for (let yOffset = -1; yOffset <= 1; yOffset++) {
                for (let xOffset = -1; xOffset <= 1; xOffset++) {
                    if (xOffset === 0 && yOffset === 0) continue;
                    const neighborX = x + xOffset;
                    const neighborY = y + yOffset;
                    if (
                        neighborX >= 0 && neighborX < frameWidth &&
                        neighborY >= 0 && neighborY < frameHeight
                    ) {
                        enqueue(neighborX, neighborY);
                    }
                }
            }
        }

        for (let index = 0; index < pixels.length; index += 4) {
            if (visited[index / 4] && pixels[index + 3] > 0) pixels[index + 3] = 0;
        }
        context.putImageData(imageData, 0, 0);
        return canvas;
    });

    colorKeyedFrameCache.set(cacheKey, frames);
    return frames;
}

export class Penguin {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
        this.currentAnimation = null;
        this.animations = {};
        
        // Render order (higher number = rendered later/on top)
        this.renderOrder = RENDER_CONFIG.layers.penguin;
        
        // Physics properties
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = LEVEL_DEFAULTS.penguin.radius;
        this.mass = LEVEL_DEFAULTS.penguin.mass;
        this.launched = false;
        this.trail = [];
        this.maxTrailLength = RENDER_CONFIG.penguin.trailLength;
        
        // Animation state (matching old GPS script)
        this.currentAnimationType = 'xc';
        this.isSpinning = false;
        this.initialized = false;
        
        // Animation frame control (from old GPS script)
        this.aniFrame = 0;
        this.aniDir = 1;
        this.aniMax = RENDER_CONFIG.penguin.animationFrameMaximum;
        this.aniMin = RENDER_CONFIG.penguin.animationFrameMinimum;
        this.aniSwap = 0; // Controls when to advance frames (0 = update this frame)
        
        // Game state (required for slingshot interaction)
        this.state = 'idle';
        this.crashedTimer = 0;
        this.crashedDuration = RENDER_CONFIG.penguin.crashedDurationSeconds;
        
        // Planet collision state (matching old GPS script)
        this.crashedFrameCount = 0;
        this.hitPlanet = null;
        
        this.initSync();
    }
    
    // Getter for position compatibility with Arrow class
    get position() {
        return { x: this.x, y: this.y };
    }
    
    // Setter for position compatibility
    set position(pos) {
        this.x = pos.x;
        this.y = pos.y;
    }

    initSync() {
        this.loadRealSprites();
        this.initialized = true;
        plog.waddle('Penguin initialized (loading real sprites in background)');
    }
    
    async loadRealSprites() {
        try {
            plog.waddle('Starting to load real penguin sprites...');
            
            this.spriteSheets = {};

            // AssetLoader owns the long-lived image resources. Level changes
            // replace this gameplay object, but must not reload its sprites.
            if (this.assetLoader?.getAnimationSpriteSheet) {
                for (const type of ['xc', 'yc', 'zc']) {
                    const spriteSheet = this.assetLoader.getAnimationSpriteSheet(type);
                    if (spriteSheet) this.spriteSheets[type] = spriteSheet;
                }

                if (Object.keys(this.spriteSheets).length === 3) {
                    await this.loadMetadata();
                }

                // Do not fall back to new network-backed Image objects when
                // the shared loader has a failed/missing optional animation.
                // The renderer will use its normal penguin fallback instead.
                return;
            }

            // Keep the standalone fallback for editor/manual callers that
            // construct a Penguin without the shared asset service.
            
            // Load XC animation
            const xcImage = new Image();
            xcImage.onload = () => {
                this.spriteSheets.xc = xcImage;
                plog.debug('XC sprite sheet loaded');
                this.loadMetadata();
            };
            xcImage.src = penguinAnimationAssetPath('xc');
            
            // Load YC animation
            const ycImage = new Image();
            ycImage.onload = () => {
                this.spriteSheets.yc = ycImage;
                plog.debug('YC sprite sheet loaded');
                this.loadMetadata();
            };
            ycImage.src = penguinAnimationAssetPath('yc');
            
            // Load ZC animation
            const zcImage = new Image();
            zcImage.onload = () => {
                this.spriteSheets.zc = zcImage;
                plog.debug('ZC sprite sheet loaded');
                this.loadMetadata();
            };
            zcImage.src = penguinAnimationAssetPath('zc');
            
        } catch (error) {
            console.error('Failed to load real penguin sprites:', error);
        }
    }
    
    async loadMetadata() {
        if (this.metadataPromise) return this.metadataPromise;

        this.metadataPromise = (async () => {
        if (this.spriteSheets.xc && this.spriteSheets.yc && this.spriteSheets.zc) {
            try {
                const metadata = this.assetLoader?.getAnimationMetadata
                    ? await Promise.all(['xc', 'yc', 'zc'].map(type => this.assetLoader.getAnimationMetadata(type)))
                    : await Promise.all([
                        fetch(penguinAnimationAssetPath('xc', 'metadata')).then(r => r.json()),
                        fetch(penguinAnimationAssetPath('yc', 'metadata')).then(r => r.json()),
                        fetch(penguinAnimationAssetPath('zc', 'metadata')).then(r => r.json())
                    ]);
                const [xcMeta, ycMeta, zcMeta] = metadata;
                
                this.metadata = { xc: xcMeta, yc: ycMeta, zc: zcMeta };
                this.processedSpriteFrames = Object.fromEntries(
                    Object.entries(this.metadata).map(([type, metadata]) => [
                        type,
                        createColorKeyedFrames(this.spriteSheets[type], metadata)
                    ])
                );
                
                plog.success('All metadata loaded:', this.metadata);
                this.realSpritesLoaded = true;
                this.setAnimation('xc');
                
            } catch (error) {
                console.error('Failed to load metadata:', error);
            }
        }
        })();

        return this.metadataPromise;
    }
    
    async init() {
        this.animations.xc = await this.assetLoader.createPenguinAnimation('xc');
        this.animations.yc = await this.assetLoader.createPenguinAnimation('yc');
        this.animations.zc = await this.assetLoader.createPenguinAnimation('zc');
        
        this.setAnimation('xc');
        

        
        this.initialized = true;
        plog.success('Penguin initialized with real sprites');
    }
    
    setAnimation(type) {
        plog.debug(`setAnimation called with type: ${type}`);
        
        if (this.spriteSheets && this.spriteSheets[type]) {
            this.currentAnimationType = type;
            
            // Initialize animation frame control (matching old GPS script)
            this.aniFrame = 0;
            this.aniMax = RENDER_CONFIG.penguin.animationFrameMaximum;
            this.aniMin = RENDER_CONFIG.penguin.animationFrameMinimum;
            this.aniDir = Math.random() < 0.5 ? 1 : -1; // Random direction like old script
            this.aniSwap = 1;
            
            plog.debug(`Animation set to ${type} with direction ${this.aniDir}`);
        } else {
            plog.warn(`Animation ${type} not available yet`);
        }
    }
    
    startSpinning() {
        this.isSpinning = true;
        this.setUpAnimation();
        plog.waddle('Penguin started spinning - isSpinning:', this.isSpinning, 'aniFrame:', this.aniFrame, 'aniDir:', this.aniDir);
    }
    
    setUpAnimation() {
        // Match the old GPS script's setUpAnimation logic
        this.aniSwap = 0; // Start at 0 so first frame updates immediately
        this.aniFrame = 0;
        this.aniMax = RENDER_CONFIG.penguin.animationFrameMaximum;
        this.aniMin = RENDER_CONFIG.penguin.animationFrameMinimum;
        this.aniDir = Math.random() < 0.5 ? 1 : -1;
        plog.debug(`Animation setup: frame ${this.aniFrame}, direction ${this.aniDir}`);
    }
    
    stopSpinning() {
        this.isSpinning = false;
        plog.waddle('Penguin stopped spinning');
    }
    
    // Property for position (required by Game class)
    get position() {
        return { x: this.x, y: this.y };
    }
    
    set position(pos) {
        this.x = pos.x;
        this.y = pos.y;
    }
    
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }
    
    // Property for velocity (required by Game class)
    get velocity() {
        return { x: this.vx, y: this.vy };
    }
    
    set velocity(vel) {
        this.vx = vel.x;
        this.vy = vel.y;
    }
    
    launch(vx, vy) {
        plog.soar('Penguin launch called with velocity:', vx, vy);
        this.vx = vx;
        this.vy = vy;
        this.launched = true;
        this.startSpinning();
        
        // Choose animation based on velocity direction
        const speed = Math.sqrt(vx * vx + vy * vy);
        const angle = Math.atan2(vy, vx);
        
        // Simple logic to choose animation type based on direction
        if (Math.abs(vx) > Math.abs(vy)) {
            this.setAnimation('xc'); // Horizontal movement
        } else if (vy > 0) {
            this.setAnimation('yc'); // Downward movement
        } else {
            this.setAnimation('zc'); // Upward movement
        }
    }
    
    update(deltaTime, updatePhysics = true) {
        if (!this.launched) return;
        
        // Update physics only if requested (to avoid conflicts with external physics)
        if (updatePhysics) {
            // Apply gravity
            //this.vy += 500 * deltaTime; // Gravity
            
            // Update position
            this.x += this.vx * deltaTime;
            this.y += this.vy * deltaTime;

            // Update container position
        }
        
        // Update trail
        if(this.state != "crashed" && this.state != "hitTarget") {
            this.trail.push({ x: this.x, y: this.y });
        }
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        // Update animation frames (moved from drawRealSprite)
        this.updateAnimationFrames();
        
        // Update animation based on velocity
        this.updateAnimationBasedOnVelocity();
        
        // Rotate sprite based on velocity direction
        if (this.currentAnimation) {
            const angle = Math.atan2(this.vy, this.vx);
            this.currentAnimation.rotation = angle;
        }
    }
    
    // New method to update physics with planet gravity (matching old GPS script)
    updateWithPlanetGravity(planets, gravitationalConstant, deltaTime) {
        if (!this.launched || this.state !== 'soaring') return;
        
        plog.physics('Penguin updateWithPlanetGravity called, state:', this.state);
        
        const result = integratePlanetGravity(
            { x: this.x, y: this.y },
            { x: this.vx, y: this.vy },
            planets,
            gravitationalConstant,
            deltaTime
        );

        this.x = result.position.x;
        this.y = result.position.y;
        this.vx = result.velocity.x;
        this.vy = result.velocity.y;
        
        // Update trail
        if(this.state != "crashed" && this.state != "hitTarget") {
            this.trail.push({ x: this.x, y: this.y });
        }
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        // Update animation
        this.updateAnimationFrames();
        this.updateAnimationBasedOnVelocity();
        if (this.currentAnimation) {
            this.currentAnimation.rotation = Math.atan2(this.vy, this.vx);
        }

        plog.physics(`Penguin position updated to: (${this.x.toFixed(2)}, ${this.y.toFixed(2)}), velocity: (${this.vx.toFixed(2)}, ${this.vy.toFixed(2)})`);
    }
    
    // Crash the penguin against a planet (matching old GPS script setUpCrashed)
    crashIntoPlanet(planet) {
        this.beginCrash(planet, true);
    }

    beginCrash(planet, applyBounce = true) {
        this.state = 'crashed';
        this.crashedFrameCount = SIMULATION_CONFIG.collision.planetCrashFrames;
        this.hitPlanet = planet;
        
        // The shared simulation core may already have applied the bounce.
        if (applyBounce) this.setBounceOffPlanet(planet);
        
        // Set up spinning animation
        this.setUpAnimation();
        
        plog.crash(`Penguin crashed into planet with ${this.crashedFrameCount} frame countdown`);
    }

    createCrashCopy() {
        const copy = Object.create(Penguin.prototype);
        Object.assign(copy, this, {
            animations: { ...this.animations },
            trail: [],
            state: 'crashed',
            launched: true
        });
        return copy;
    }

    updateDetachedCrash(deltaTime, planets, stageRect) {
        this.crashedFrameCount -= deltaTime * LEGACY_PHYSICS_FPS;
        const insideStage = this.x >= stageRect.x && this.x <= stageRect.x + stageRect.width &&
            this.y >= stageRect.y && this.y <= stageRect.y + stageRect.height;
        if (!insideStage || this.crashedFrameCount <= 0) return false;

        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        for (const planet of planets) {
            const dx = this.x - planet.position.x;
            const dy = this.y - planet.position.y;
            const distance = Math.hypot(dx, dy);
            if (distance >= planet.collisionRadius + this.radius) continue;

            const normalLength = distance || 1;
            const nx = distance ? dx / normalLength : 1;
            const ny = distance ? dy / normalLength : 0;
            const dot = this.vx * nx + this.vy * ny;
            this.vx = (this.vx - 2 * dot * nx) * SIMULATION_CONFIG.collision.restitution;
            this.vy = (this.vy - 2 * dot * ny) * SIMULATION_CONFIG.collision.restitution;
            if (Math.hypot(this.vx, this.vy) < SIMULATION_CONFIG.collision.minimumBounceSpeed) {
                this.vx = nx * SIMULATION_CONFIG.collision.minimumBounceSpeed;
                this.vy = ny * SIMULATION_CONFIG.collision.minimumBounceSpeed;
            }
            const safeDistance = planet.collisionRadius + this.radius + SIMULATION_CONFIG.collision.separationPadding;
            this.x = planet.position.x + nx * safeDistance;
            this.y = planet.position.y + ny * safeDistance;
            break;
        }

        this.updateAnimationFrames();
        this.updateAnimationBasedOnVelocity();
        return true;
    }
    
    // New method to handle bounce off planet (matching old GPS setBounceOffPlanet)
    setBounceOffPlanet(planet) {
        // Calculate collision normal (from planet center to penguin)
        const normalX = this.x - planet.x;
        const normalY = this.y - planet.y;
        const normalLength = Math.sqrt(normalX * normalX + normalY * normalY);
        
        // Normalize the normal vector
        const nx = normalX / normalLength;
        const ny = normalY / normalLength;
        
        // Calculate velocity magnitude before bounce
        const velocityMagnitudeBefore = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        
        // Reflect velocity using the collision normal (matching old GPS logic)
        // Formula: v' = v - 2n)n where n is the normalized normal
        const dotProduct = this.vx * nx + this.vy * ny;
        this.vx = this.vx - 2 * dotProduct * nx;
        this.vy = this.vy - 2 * dotProduct * ny;
        
        // Reduce velocity on bounce (matching original behavior)
        this.vx *= SIMULATION_CONFIG.collision.restitution;
        this.vy *= SIMULATION_CONFIG.collision.restitution;
        
        // Calculate velocity magnitude after bounce
        const velocityMagnitudeAfter = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        
        // If velocity is too small after bounce, give it a minimum push away from planet
        const minVelocity = SIMULATION_CONFIG.collision.minimumBounceSpeed;
        if (velocityMagnitudeAfter < minVelocity) {
            // Push the penguin away from the planet with minimum velocity
            this.vx = nx * minVelocity;
            this.vy = ny * minVelocity;
            plog.crash('Bounce applied - Minimum velocity push:', this.vx, this.vy, 'Magnitude:', minVelocity);
        } else {
            plog.crash('Bounce applied - New velocity:', this.vx, this.vy, 'Magnitude:', velocityMagnitudeAfter);
        }
        
        // Ensure penguin is outside planet collision radius to prevent getting stuck
        const distanceToPlanet = Math.sqrt(normalX * normalX + normalY * normalY);
        const minDistance = planet.collisionRadius + 5; // Add small buffer
        if (distanceToPlanet < minDistance) {
            // Move penguin to safe distance from planet
            const pushDistance = minDistance - distanceToPlanet;
            this.x += nx * pushDistance;
            this.y += ny * pushDistance;
            this.position = { x: this.x, y: this.y };
            plog.crash('Penguin repositioned to safe distance from planet');
        }
    }
    
    // Update crashed state (matching old GPS script crashedFrame)
    updateCrashed(deltaTime, planets) {
        // Decrease frame countdown (original GPS script logic)
        this.crashedFrameCount = this.crashedFrameCount - 1;
        plog.crash(`Crash frame countdown: ${this.crashedFrameCount}`);
        
        // Check if penguin is out of stage bounds - if so, stop movement
        const stageRect = window.game
            ? window.game.stageRect
            : { x: 0, y: 0, width: WORLD_CONFIG.stage.width, height: WORLD_CONFIG.stage.height };
        const isOutOfBounds = this.x < stageRect.x || this.x > stageRect.x + stageRect.width ||
                             this.y < stageRect.y || this.y > stageRect.y + stageRect.height;
        
        if (isOutOfBounds) {
            // Stop movement when out of bounds
            this.vx = 0;
            this.vy = 0;
            plog.waddle('Penguin stopped moving - out of stage bounds');
        } else {
            // Apply velocity (continue moving during crash) - RESTORE deltaTime!
            this.x += this.vx * deltaTime;
            this.y += this.vy * deltaTime;
            this.position = { x: this.x, y: this.y };
            
            // Check for additional planet collisions during crash
            for (const planet of planets) {
                const changeLoc = { x: this.x - planet.x, y: this.y - planet.y };
                const distance = Math.sqrt(changeLoc.x * changeLoc.x + changeLoc.y * changeLoc.y);
                
                if (distance < planet.collisionRadius) {
                    this.setBounceOffPlanet(planet);
                    
                    // Play hit planet sound for additional bounces
                    if (window.game && window.game.playSound) {
                        window.game.playSound(getAudioCue(AudioCue.HIT_PLANET).soundId);
                    }
                    
                    plog.crash('Penguin bounced off planet during crash');
                    break;
                }
            }
        }
        
        // Update animation frames (spinning during crash) - slowed down
        if (this.crashedFrameCount % RENDER_CONFIG.penguin.crashAnimationStride === 0) {
            this.aniFrame = this.aniFrame + this.aniDir;
            if (this.aniFrame < this.aniMin) {
                this.aniFrame = this.aniMax;
            }
            if (this.aniFrame > this.aniMax) {
                this.aniFrame = this.aniMin;
            }
        }
        
        // Crash ends when frame count reaches 0 or penguin goes out of stage bounds
        // This will be checked by the game engine - we just continue the crashed animation
    }
    
    updateAnimationFrames() {
        // Update animation frame (matching old GPS script logic)
        if (this.isSpinning) {
            // Slow down animation by only updating every 4th call
            this.aniSwap = (this.aniSwap + 1) % RENDER_CONFIG.penguin.spinAnimationStride;
            
            if (this.aniSwap === 0) {
                this.aniFrame = this.aniFrame + this.aniDir;
                if (this.aniFrame < this.aniMin) {
                    this.aniFrame = this.aniMax;
                }
                if (this.aniFrame > this.aniMax) {
                    this.aniFrame = this.aniMin;
                }
            }
        }
    }
    
    updateAnimationBasedOnVelocity() {
        if (!this.isSpinning) return;
        
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        const angle = Math.atan2(this.vy, this.vx);
        
        // Adjust animation speed based on velocity
        if (this.currentAnimation) {
            const animation = RENDER_CONFIG.penguin.animation;
            this.currentAnimation.animationSpeed = Math.max(
                animation.minimumSpeed,
                Math.min(animation.maximumSpeed, speed / animation.velocityDivisor)
            );
        }
        
        // Switch animation type based on movement direction
        let newType = this.currentAnimationType;
        
        if (Math.abs(this.vx) > Math.abs(this.vy) * RENDER_CONFIG.penguin.animation.horizontalBias) {
            newType = 'xc'; // Horizontal movement
        } else if (this.vy > Math.abs(this.vx) * RENDER_CONFIG.penguin.animation.verticalBias) {
            newType = 'yc'; // Downward movement
        } else if (this.vy < -Math.abs(this.vx) * RENDER_CONFIG.penguin.animation.verticalBias) {
            newType = 'zc'; // Upward movement
        }
        
        if (newType !== this.currentAnimationType) {
            this.setAnimation(newType);
        }
    }
    
    setState(newState) {
        this.state = newState;
        plog.waddle(`Penguin state changed to: ${newState}`);
    }
    
    reset() {
        this.launched = false;
        this.vx = 0;
        this.vy = 0;
        this.trail = [];
        this.stopSpinning();
        this.state = 'idle';
        this.crashedTimer = 0;
        this.crashedFrameCount = 0; // Reset frame counter
        this.hitPlanet = null; // Clear planet reference
        
        // Reset animation state
        this.aniFrame = 0;
        this.aniDir = Math.random() < 0.5 ? 1 : -1;
        this.aniSwap = 0; // Start at 0 so first frame updates immediately
        
        // Reset to default animation
        this.setAnimation('xc');
        if (this.currentAnimation) {
            this.currentAnimation.rotation = 0;
        }
    }
    
    getBounds() {
        return {
            x: this.x - this.radius,
            y: this.y - this.radius,
            width: this.radius * 2,
            height: this.radius * 2
        };
    }
    
    // Check collision with a circle
    checkCollision(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < (this.radius + other.radius);
    }
    
    // Check collision with a rectangle
    checkRectCollision(rect) {
        const bounds = this.getBounds();
        return bounds.x < rect.x + rect.width &&
               bounds.x + bounds.width > rect.x &&
               bounds.y < rect.y + rect.height &&
               bounds.y + bounds.height > rect.y;
    }
    
    // Draw method for canvas 2D context (required by Game class)
    draw(ctx) {
        // A successful target hit consumes the penguin into the ship.
        if (this.state === 'hitTarget') return;

        // Draw trail first
        this.drawTrailCanvas(ctx);
        
        // If real sprites are loaded, draw them
        if (this.realSpritesLoaded && this.spriteSheets && this.spriteSheets[this.currentAnimationType]) {
            this.drawRealSprite(ctx);
        } else {
            // Fallback to simple drawing
            this.drawFallbackSprite(ctx);
        }
    }
    
    drawRealSprite(ctx) {
        const metadata = this.metadata[this.currentAnimationType];
        const frame = this.processedSpriteFrames?.[this.currentAnimationType]?.[this.aniFrame];
        
        if (!frame || !metadata) {
            this.drawFallbackSprite(ctx);
            return;
        }
        
        // Get registration point for this frame
        const regPoint = metadata.registration_points[this.aniFrame] || metadata.registration_points[0];
        
        // Set up pixel-perfect rendering
        ctx.save();
        ctx.imageSmoothingEnabled = false; // Disable anti-aliasing for crisp pixels
        ctx.translate(this.x, this.y);
        
        // Apply registration point offset
        ctx.translate(-regPoint[0], -regPoint[1]);
        
        // Scale up the sprite slightly (1.5x for better visibility)
        const scale = RENDER_CONFIG.penguin.spriteScale;
        ctx.scale(scale, scale);

        ctx.drawImage(frame, 0, 0);
        
        ctx.restore();
    }
    
    drawFallbackSprite(ctx) {
        // Draw penguin body (simple circle for now)
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Draw penguin as a bright blue circle with black outline for visibility
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#0066FF';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Draw eyes (larger and more visible)
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-6, -6, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(6, -6, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw beak (larger and more visible)
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(12, -4);
        ctx.lineTo(12, 4);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
    
    drawTrailCanvas(ctx) {
        if (this.trail.length < 2) return;
        
        ctx.save();
        ctx.strokeStyle = RENDER_CONFIG.penguin.trail.color;
        ctx.lineWidth = RENDER_CONFIG.penguin.trail.lineWidth;
        
        for (let i = 1; i < this.trail.length; i++) {
            const alpha = i / this.trail.length;
            ctx.globalAlpha = alpha * RENDER_CONFIG.penguin.trail.maximumAlpha;
            ctx.beginPath();
            ctx.moveTo(this.trail[i-1].x, this.trail[i-1].y);
            ctx.lineTo(this.trail[i].x, this.trail[i].y);
            ctx.stroke();
        }
        
        ctx.restore();
    }

    drawTrail(graphics) {
        if (this.trail.length < 2) return;
        
        graphics.lineStyle(
            RENDER_CONFIG.penguin.trail.lineWidth,
            Number.parseInt(RENDER_CONFIG.penguin.trail.color.slice(1), 16),
            RENDER_CONFIG.penguin.trail.maximumAlpha
        );
        graphics.moveTo(this.trail[0].x, this.trail[0].y);
        
        for (let i = 1; i < this.trail.length; i++) {
            const alpha = i / this.trail.length;
            graphics.lineStyle(
                RENDER_CONFIG.penguin.trail.lineWidth,
                Number.parseInt(RENDER_CONFIG.penguin.trail.color.slice(1), 16),
                alpha * RENDER_CONFIG.penguin.trail.maximumAlpha
            );
            graphics.lineTo(this.trail[i].x, this.trail[i].y);
        }
    }
    
    destroy() {
        if (this.currentAnimation) {
            this.currentAnimation.destroy();
        }
        this.container.destroy();
    }
}
