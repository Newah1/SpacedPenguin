// Penguin class with real sprite animations
import plog from './penguinLogger.js';

export class Penguin {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
        this.currentAnimation = null;
        this.animations = {};
        
        // Render order (higher number = rendered later/on top)
        this.renderOrder = 5; // Render penguin on top of everything
        
        // Physics properties
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.radius = 16;
        this.mass = 1;
        this.launched = false;
        this.trail = [];
        this.maxTrailLength = 20;
        
        // Animation state (matching old GPS script)
        this.currentAnimationType = 'xc';
        this.isSpinning = false;
        this.initialized = false;
        
        // Animation frame control (from old GPS script)
        this.aniFrame = 0;
        this.aniDir = 1;
        this.aniMax = 11;
        this.aniMin = 0;
        this.aniSwap = 0; // Controls when to advance frames (0 = update this frame)
        
        // Game state (required for slingshot interaction)
        this.state = 'idle';
        this.crashedTimer = 0;
        this.crashedDuration = 2.0; // seconds
        
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
            
            // Load XC animation
            const xcImage = new Image();
            xcImage.onload = () => {
                this.spriteSheets.xc = xcImage;
                plog.debug('XC sprite sheet loaded');
                this.loadMetadata();
            };
            xcImage.src = 'assets/animations/penguin_spin_xc_sheet.png';
            
            // Load YC animation
            const ycImage = new Image();
            ycImage.onload = () => {
                this.spriteSheets.yc = ycImage;
                plog.debug('YC sprite sheet loaded');
                this.loadMetadata();
            };
            ycImage.src = 'assets/animations/penguin_spin_yc_sheet.png';
            
            // Load ZC animation
            const zcImage = new Image();
            zcImage.onload = () => {
                this.spriteSheets.zc = zcImage;
                plog.debug('ZC sprite sheet loaded');
                this.loadMetadata();
            };
            zcImage.src = 'assets/animations/penguin_spin_zc_sheet.png';
            
        } catch (error) {
            console.error('Failed to load real penguin sprites:', error);
        }
    }
    
    async loadMetadata() {
        if (this.spriteSheets.xc && this.spriteSheets.yc && this.spriteSheets.zc) {
            try {
                const [xcMeta, ycMeta, zcMeta] = await Promise.all([
                    fetch('assets/animations/penguin_spin_xc_metadata.json').then(r => r.json()),
                    fetch('assets/animations/penguin_spin_yc_metadata.json').then(r => r.json()),
                    fetch('assets/animations/penguin_spin_zc_metadata.json').then(r => r.json())
                ]);
                
                this.metadata = { xc: xcMeta, yc: ycMeta, zc: zcMeta };
                
                plog.success('All metadata loaded:', this.metadata);
                this.realSpritesLoaded = true;
                this.setAnimation('xc');
                
            } catch (error) {
                console.error('Failed to load metadata:', error);
            }
        }
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
            this.aniMax = 11; // 12 frames (0-11)
            this.aniMin = 0;
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
        this.aniMax = 11; // 12 frames (0-11)
        this.aniMin = 0;
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
        this.trail.push({ x: this.x, y: this.y });
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
        
        // Apply gravitational forces from all planets (matching old GPS script)
        for (const planet of planets) {
            const changeLoc = { x: planet.x - this.x, y: planet.y - this.y };
            const distanceSquared = (changeLoc.x * changeLoc.x) + (changeLoc.y * changeLoc.y);
            const distance = Math.sqrt(distanceSquared);
            
            // Only apply gravity if within gravitational reach
            if (distance < planet.gravitationalReach) {
                let gravitationalForce = 0;
                if (distanceSquared > 0) {
                    gravitationalForce = planet.mass * gravitationalConstant / distanceSquared;
                }
                
                // Apply gravitational acceleration (F = ma, a = F/m, but we're treating penguin mass as 1)
                this.vx += gravitationalForce * changeLoc.x;
                this.vy += gravitationalForce * changeLoc.y;
                
                plog.physics(`Applied gravity from planet at (${planet.x}, ${planet.y}): force=${gravitationalForce.toFixed(4)}, vx=${this.vx.toFixed(2)}, vy=${this.vy.toFixed(2)}`);
            }
        }
        
        // Update position (RESTORE deltaTime multiplication!)
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.position = { x: this.x, y: this.y };
        
        // Update trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        // Update animation
        this.updateAnimationFrames();
        

        
        plog.physics(`Penguin position updated to: (${this.x.toFixed(2)}, ${this.y.toFixed(2)}), velocity: (${this.vx.toFixed(2)}, ${this.vy.toFixed(2)})`);
    }
    
    // Crash the penguin against a planet (matching old GPS script setUpCrashed)
    crashIntoPlanet(planet) {
        this.state = 'crashed';
        this.crashedFrameCount = 150; // Original GPS script duration
        this.hitPlanet = planet;
        
        // Set bounce off planet (original GPS script logic)
        this.setBounceOffPlanet(planet);
        
        // Set up spinning animation
        this.setUpAnimation();
        
        plog.crash(`Penguin crashed into planet with ${this.crashedFrameCount} frame countdown`);
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
        this.vx *= 0.8;
        this.vy *= 0.8;
        
        // Calculate velocity magnitude after bounce
        const velocityMagnitudeAfter = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        
        // If velocity is too small after bounce, give it a minimum push away from planet
        const minVelocity = 50; // Minimum velocity to ensure penguin moves away
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
        const stageRect = window.game ? window.game.stageRect : { x: 0, y: 0, width: 800, height: 600 };
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
                        window.game.playSound('20_snd_HitPlanet');
                    }
                    
                    plog.crash('Penguin bounced off planet during crash');
                    break;
                }
            }
        }
        
        // Update animation frames (spinning during crash) - slowed down
        if (this.crashedFrameCount % 4 === 0) { // Only update every 4th frame
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
            this.aniSwap = (this.aniSwap + 1) % 8;
            
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
            this.currentAnimation.animationSpeed = Math.max(0.1, Math.min(0.3, speed / 1000));
        }
        
        // Switch animation type based on movement direction
        let newType = this.currentAnimationType;
        
        if (Math.abs(this.vx) > Math.abs(this.vy) * 1.5) {
            newType = 'xc'; // Horizontal movement
        } else if (this.vy > Math.abs(this.vx) * 0.5) {
            newType = 'yc'; // Downward movement
        } else if (this.vy < -Math.abs(this.vx) * 0.5) {
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
        const spriteSheet = this.spriteSheets[this.currentAnimationType];
        const metadata = this.metadata[this.currentAnimationType];
        
        if (!spriteSheet || !metadata) {
            this.drawFallbackSprite(ctx);
            return;
        }
        
        // Calculate frame position in sprite sheet
        const frameX = this.aniFrame * metadata.frame_width;
        const frameY = 0;
        
        // Get registration point for this frame
        const regPoint = metadata.registration_points[this.aniFrame] || metadata.registration_points[0];
        
        // Set up pixel-perfect rendering
        ctx.save();
        ctx.imageSmoothingEnabled = false; // Disable anti-aliasing for crisp pixels
        ctx.translate(this.x, this.y);
        
        // Apply registration point offset
        ctx.translate(-regPoint[0], -regPoint[1]);
        
        // Scale up the sprite slightly (1.5x for better visibility)
        const scale = 1.2;
        ctx.scale(scale, scale);
        
        // Create a temporary canvas for color keying
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = metadata.frame_width;
        tempCanvas.height = metadata.frame_height;
        
        // Draw the original frame to temp canvas
        tempCtx.drawImage(
            spriteSheet,
            frameX, frameY, metadata.frame_width, metadata.frame_height,
            0, 0, metadata.frame_width, metadata.frame_height
        );
        
        // Get image data for color keying
        const imageData = tempCtx.getImageData(0, 0, metadata.frame_width, metadata.frame_height);
        const data = imageData.data;
        
        // Color key: replace white (RGB:255) with transparent
        // Use a tolerance for slight color variations
        const tolerance = 30;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // Check if pixel is close to white
            if (r > (255 - tolerance) && g > (255 - tolerance) && b > (255 - tolerance)) {
                data[i + 3] = 0; // Set alpha to 0 (transparent)
            }
        }
        
        // Put the processed image data back
        tempCtx.putImageData(imageData, 0, 0);
        
        // Draw the processed sprite with transparency
        ctx.drawImage(tempCanvas, 0, 0);
        
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
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        
        for (let i = 1; i < this.trail.length; i++) {
            const alpha = i / this.trail.length;
            ctx.globalAlpha = alpha * 0.5;
            ctx.beginPath();
            ctx.moveTo(this.trail[i-1].x, this.trail[i-1].y);
            ctx.lineTo(this.trail[i].x, this.trail[i].y);
            ctx.stroke();
        }
        
        ctx.restore();
    }

    drawTrail(graphics) {
        if (this.trail.length < 2) return;
        
        graphics.lineStyle(2, 0xFFFFFF, 0.5);
        graphics.moveTo(this.trail[0].x, this.trail[0].y);
        
        for (let i = 1; i < this.trail.length; i++) {
            const alpha = i / this.trail.length;
            graphics.lineStyle(2, 0xFFFFFF, alpha * 0.5);
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