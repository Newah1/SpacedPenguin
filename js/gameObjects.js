// Game objects for Spaced Penguin
// Based on the original behavior scripts

import Utils from './utils.js';
import plog from './penguinLogger.js';

// New consolidated orbit system supporting non-circular orbits
class OrbitSystem {
    constructor() {
        this.orbitCenter = null;
        this.orbitRadius = 0;
        this.orbitSpeed = 0;
        this.orbitAngle = 0;
        this.orbitType = 'circular'; // 'circular', 'elliptical', 'figure8', 'custom'
        this.orbitParams = {}; // Additional parameters for complex orbits
    }
    
    // Set up circular orbit (original behavior)
    setCircularOrbit(center, radius, speed) {
        this.orbitCenter = center;
        this.orbitRadius = radius;
        this.orbitSpeed = speed;
        this.orbitType = 'circular';
        this.orbitParams = {};
    }
    
    // Set up elliptical orbit
    setEllipticalOrbit(center, semiMajorAxis, semiMinorAxis, speed, rotation = 0) {
        this.orbitCenter = center;
        this.orbitRadius = semiMajorAxis; // Keep for compatibility
        this.orbitSpeed = speed;
        this.orbitType = 'elliptical';
        this.orbitParams = {
            semiMajorAxis: semiMajorAxis,
            semiMinorAxis: semiMinorAxis,
            rotation: rotation // Rotation of ellipse in radians
        };
    }
    
    // Set up figure-8 orbit (lemniscate)
    setFigure8Orbit(center, size, speed) {
        this.orbitCenter = center;
        this.orbitRadius = size;
        this.orbitSpeed = speed;
        this.orbitType = 'figure8';
        this.orbitParams = {
            size: size
        };
    }
    
    // Set up custom parametric orbit
    setCustomOrbit(center, speed, xFunction, yFunction) {
        this.orbitCenter = center;
        this.orbitSpeed = speed;
        this.orbitType = 'custom';
        this.orbitParams = {
            xFunction: xFunction,
            yFunction: yFunction
        };
    }
    
    // Update orbit position
    update(deltaTime) {
        if (!this.orbitCenter || this.orbitSpeed === 0) {
            return { x: 0, y: 0 };
        }
        
        this.orbitAngle += this.orbitSpeed * deltaTime;
        
        switch (this.orbitType) {
            case 'circular':
                return this.calculateCircularPosition();
            case 'elliptical':
                return this.calculateEllipticalPosition();
            case 'figure8':
                return this.calculateFigure8Position();
            case 'custom':
                return this.calculateCustomPosition();
            default:
                return this.calculateCircularPosition();
        }
    }
    
    calculateCircularPosition() {
        return {
            x: this.orbitCenter.x + Math.cos(this.orbitAngle) * this.orbitRadius,
            y: this.orbitCenter.y + Math.sin(this.orbitAngle) * this.orbitRadius
        };
    }
    
    calculateEllipticalPosition() {
        const { semiMajorAxis, semiMinorAxis, rotation } = this.orbitParams;
        
        // Calculate position on unrotated ellipse
        const x = Math.cos(this.orbitAngle) * semiMajorAxis;
        const y = Math.sin(this.orbitAngle) * semiMinorAxis;
        
        // Apply rotation
        const cosRot = Math.cos(rotation);
        const sinRot = Math.sin(rotation);
        const rotatedX = x * cosRot - y * sinRot;
        const rotatedY = x * sinRot + y * cosRot;
        
        return {
            x: this.orbitCenter.x + rotatedX,
            y: this.orbitCenter.y + rotatedY
        };
    }
    
    calculateFigure8Position() {
        const { size } = this.orbitParams;
        
        // Lemniscate of Bernoulli formula
        const denominator = 1 + Math.sin(this.orbitAngle) * Math.sin(this.orbitAngle);
        const x = size * Math.cos(this.orbitAngle) / denominator;
        const y = size * Math.sin(this.orbitAngle) * Math.cos(this.orbitAngle) / denominator;
        
        return {
            x: this.orbitCenter.x + x,
            y: this.orbitCenter.y + y
        };
    }
    
    calculateCustomPosition() {
        const { xFunction, yFunction } = this.orbitParams;
        
        if (typeof xFunction === 'function' && typeof yFunction === 'function') {
            return {
                x: this.orbitCenter.x + xFunction(this.orbitAngle),
                y: this.orbitCenter.y + yFunction(this.orbitAngle)
            };
        }
        
        // Fallback to circular
        return this.calculateCircularPosition();
    }
    
    // Legacy compatibility method
    setOrbit(center, radius, speed) {
        this.setCircularOrbit(center, radius, speed);
    }
}

class GameObject {
    constructor(x, y, width, height) {
        this.position = { x: x, y: y };
        this.width = width;
        this.height = height;
        this.visible = true;
        this.rotation = 0;
        this.alpha = 1.0;
        this.renderOrder = 0; // Default render order (0 = background, higher = foreground)
    }
    
    update(deltaTime) {
        // Override in subclasses
    }
    
    draw(ctx) {
        if (!this.visible) return;
        
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(Utils.toRadians(this.rotation));
        
        this.drawSprite(ctx);
        
        ctx.restore();
    }
    
    drawSprite(ctx) {
        // Override in subclasses
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
    }
    
    getBounds() {
        return {
            x: this.position.x - this.width/2,
            y: this.position.y - this.height/2,
            width: this.width,
            height: this.height
        };
    }
}

// Penguin class moved to penguin.js

class PenguinOld extends GameObject {
    constructor(x, y) {
        super(x, y, 32, 32);
        this.velocity = { x: 0, y: 0 };
        this.state = 'idle'; // idle, pullback, snapping, soaring, crashed, hitTarget, scoring
        this.animationFrame = 0;
        this.animationSpeed = 0.1;
        this.animationTimer = 0;
        this.trail = [];
        this.maxTrailLength = 50;
        this.color = '#FFFFFF';
        this.crashedTimer = 0;
        this.crashedDuration = 300; // frames
    }
    
    update(deltaTime) {
        this.animationTimer += deltaTime;
        
        if (this.animationTimer >= this.animationSpeed) {
            this.animationFrame = (this.animationFrame + 1) % 4; // 4 animation frames
            this.animationTimer = 0;
        }
        
        // Update trail
        this.trail.push({ x: this.position.x, y: this.position.y });
        if (this.trail.length > this.maxTrailLength) {
            this.trail.shift();
        }
        
        // Update crashed state
        if (this.state === 'crashed') {
            this.crashedTimer++;
            if (this.crashedTimer >= this.crashedDuration) {
                this.state = 'idle';
                this.crashedTimer = 0;
            }
        }
        
        // Update rotation based on velocity
        if (this.state === 'soaring' || this.state === 'crashed') {
            if (Utils.vectorMagnitude(this.velocity) > 0.1) {
                this.rotation = Utils.rotationAngle(this.velocity);
            }
        }
    }
    
    drawSprite(ctx) {
        // Draw penguin body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.width/2, this.height/2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw penguin features
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-5, -5, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw beak
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(12, -2);
        ctx.lineTo(12, 2);
        ctx.closePath();
        ctx.fill();
        
        // Draw wings based on animation frame
        ctx.fillStyle = '#CCCCCC';
        const wingOffset = Math.sin(this.animationFrame * Math.PI / 2) * 2;
        ctx.fillRect(-12, -8 + wingOffset, 8, 6);
        ctx.fillRect(-12, 2 - wingOffset, 8, 6);
    }
    
    setState(newState) {
        this.state = newState;
        if (newState === 'crashed') {
            this.crashedTimer = 0;
        }
    }
    
    reset() {
        this.velocity = { x: 0, y: 0 };
        this.state = 'idle';
        this.rotation = 0;
        this.trail = [];
        this.crashedTimer = 0;
    }
}

class Planet extends GameObject {
    constructor(x, y, radius, mass, gravitationalReach = 0, planetType = null, assetLoader = null) {
        super(x, y, radius * 2, radius * 2);
        this.renderOrder = 2; // Render planets after bonuses (higher number = rendered later)
        this.radius = radius;
        this.mass = mass;
        this.gravitationalReach = gravitationalReach;
        this.collisionRadius = radius + 8; // Matching old GPS script collision radius
        this.color = this.getPlanetColor(mass);
        this.planetType = planetType;
        this.assetLoader = assetLoader;
        this.planetSprite = null;
        
        // Use consolidated orbit system
        this.orbitSystem = new OrbitSystem();
        
        // Initialize sprite if asset loader and planet type are available
        if (this.assetLoader && this.planetType) {
            this.initializeSprite().catch(error => {
                plog.error('Failed to initialize planet sprite:', error);
            });
        }
    }
    
    getPlanetColor(mass) {
        // Color based on mass
        if (mass < 50) return '#00FFFF'; // Cyan
        if (mass < 100) return '#0000FF'; // Blue
        if (mass < 200) return '#FF00FF'; // Magenta
        if (mass < 400) return '#FF0000'; // Red
        if (mass < 600) return '#FFFF00'; // Yellow
        if (mass < 800) return '#00FF00'; // Green
        return '#C8C8C8'; // Gray
    }
    
    async initializeSprite() {
        try {
            if (this.assetLoader && this.planetType) {
                // Get the planet sprite from the asset loader
                const sprite = this.assetLoader.getPlanet(this.planetType);
                if (sprite) {
                    this.planetSprite = sprite;
                    plog.info(`Planet sprite initialized for type: ${this.planetType}`);
                }
            }
        } catch (error) {
            plog.error('Error initializing planet sprite:', error);
        }
    }
    
    // Method to refresh sprite when planetType changes
    refreshSprite() {
        if (this.assetLoader && this.planetType) {
            const sprite = this.assetLoader.getPlanet(this.planetType);
            if (sprite) {
                this.planetSprite = sprite;
                plog.info(`Planet sprite refreshed to type: ${this.planetType}`);
            }
        }
    }
    
    update(deltaTime) {
        // Update orbiting using consolidated system
        const newPosition = this.orbitSystem.update(deltaTime);
        if (newPosition.x !== 0 || newPosition.y !== 0) {
            this.position = newPosition;
        }
    }
    
    drawSprite(ctx) {
        // Draw SVG sprite if available
        if (this.planetSprite && this.planetSprite.complete) {
            // Scale the sprite to match our planet size
            const scaleX = (this.radius * 2) / this.planetSprite.width;
            const scaleY = (this.radius * 2) / this.planetSprite.height;
            const scale = Math.min(scaleX, scaleY);
            
            ctx.save();
            ctx.scale(scale, scale);
            
            // Draw the sprite centered
            ctx.drawImage(
                this.planetSprite,
                -this.planetSprite.width / 2,
                -this.planetSprite.height / 2,
                this.planetSprite.width,
                this.planetSprite.height
            );
            
            ctx.restore();
        } else {
            // Fallback: draw simple planet
            this.drawFallbackPlanet(ctx);
        }
        
        // Draw gravitational reach indicator (if not infinite)
        if (this.gravitationalReach > 0 && this.gravitationalReach < 5000) {
            ctx.strokeStyle = this.color;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + this.gravitationalReach, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }
    
    drawFallbackPlanet(ctx) {
        // Draw planet body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw planet outline
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    // Legacy orbit methods for compatibility
    setOrbit(center, radius, speed) {
        this.orbitSystem.setCircularOrbit(center, radius, speed);
    }
    
    // New orbit methods
    setCircularOrbit(center, radius, speed) {
        this.orbitSystem.setCircularOrbit(center, radius, speed);
    }
    
    setEllipticalOrbit(center, semiMajorAxis, semiMinorAxis, speed, rotation = 0) {
        this.orbitSystem.setEllipticalOrbit(center, semiMajorAxis, semiMinorAxis, speed, rotation);
    }
    
    setFigure8Orbit(center, size, speed) {
        this.orbitSystem.setFigure8Orbit(center, size, speed);
    }
    
    setCustomOrbit(center, speed, xFunction, yFunction) {
        this.orbitSystem.setCustomOrbit(center, speed, xFunction, yFunction);
    }

    static planetTypes = ['planet_grey', 'planet_pink', 'planet_red_gumball', 'planet_saturn', 'planet_sun'];
}

class Bonus extends GameObject {
    constructor(x, y, value, assetLoader = null) {
        super(x, y, 85 / 2, 86 / 2); // Size based on SVG dimensions
        this.renderOrder = 1; // Render bonuses before planets (lower number = rendered first)
        this.value = value;
        this.collected = false;
        this.state = 'notHit'; // notHit, Hit (matching original)
        this.rotationSpeed = 3.0; // Normal rotation speed (matching original)
        this.collectedRotationSpeed = 30.0; // Speed when hit (matching original)
        this.assetLoader = assetLoader;
        this.bonusSprite = null;
        this.bonusHitSprite = null;
        this.currentSprite = null;
        this.pulseTimer = 0;
        this.pulseSpeed = 0.1;
        this.alpha = 1.0;
        
        // Use consolidated orbit system
        this.orbitSystem = new OrbitSystem();
        
        // Initialize sprites if asset loader is available
        if (this.assetLoader) {
            // Initialize sprites asynchronously
            this.initializeSprites().catch(error => {
                console.error('Failed to initialize bonus sprites:', error);
            });
        }
    }
    
    async initializeSprites() {
        try {
            // Load both bonus sprites
            this.bonusSprite = await this.loadSVGSprite('bonus');
            this.bonusHitSprite = await this.loadSVGSprite('bonus_hit');
            
            // Start with normal bonus sprite
            this.currentSprite = this.bonusSprite;
            
            plog.bonus('Bonus sprites initialized');
        } catch (error) {
            plog.error('Error initializing bonus sprites:', error);
        }
    }
    
    async loadSVGSprite(spriteName) {
        try {
            const response = await fetch(`assets/sprites/${spriteName}.svg`);
            const svgText = await response.text();
            
            // Create an image from the SVG
            const img = new Image();
            const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            
            return new Promise((resolve, reject) => {
                img.onload = () => {
                    // Clean up
                    URL.revokeObjectURL(url);
                    resolve(img);
                };
                img.onerror = reject;
                img.src = url;
            });
        } catch (error) {
            plog.error(`Error loading SVG sprite ${spriteName}:`, error);
            return null;
        }
    }
    
    update(deltaTime) {
        // Don't update if collected (bonus disappears)
        if (this.collected) {
            return;
        }
        
        // Update rotation speed (matching original behavior)
        if (this.rotationSpeed > 3.0) {
            this.rotationSpeed -= 0.1 * deltaTime * 60; // Convert to frame-based like original
        } else {
            this.rotationSpeed = 3.0;
        }
        
        // Apply rotation
        this.rotation += this.rotationSpeed * deltaTime;
        
        // Update orbiting using consolidated system
        const newPosition = this.orbitSystem.update(deltaTime);
        if (newPosition.x !== 0 || newPosition.y !== 0) {
            this.position = newPosition;
        }
        
        // Pulse effect
        this.pulseTimer += deltaTime;
        const pulse = Math.sin(this.pulseTimer * this.pulseSpeed) * 0.2 + 0.8;
        this.alpha = pulse;
    }
    
    drawSprite(ctx) {
        // Don't draw if collected (bonus disappears)
        if (this.collected) {
            return;
        }
        
        // Draw SVG sprite if available
        if (this.currentSprite && this.currentSprite.complete) {
            ctx.save();
            ctx.globalAlpha = this.alpha;
            
            // Apply rotation around center
            ctx.translate(0, 0);
            ctx.rotate(this.rotation);
            
            // Draw the sprite centered
            const spriteWidth = this.width * .8;
            const spriteHeight = this.height * .8;
            ctx.drawImage(
                this.currentSprite,
                -spriteWidth / 2,
                -spriteHeight / 2,
                spriteWidth,
                spriteHeight
            );
            
            ctx.restore();
        } else {
            // Fallback: draw simple star shape
            this.drawFallbackStar(ctx);
        }
    }
    
    drawFallbackStar(ctx) {
        // Draw bonus star as fallback
        ctx.fillStyle = this.getBonusColor(this.value);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        
        const spikes = 5;
        const outerRadius = this.width / 2;
        const innerRadius = outerRadius * 0.5;
        
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const angle = (i * Math.PI) / spikes;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw value text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.value.toString(), 0, 4);
    }
    
    getBonusColor(value) {
        if (value < 100) return '#00FF00'; // Green
        if (value < 500) return '#FFFF00'; // Yellow
        if (value < 1000) return '#FF8000'; // Orange
        if (value < 5000) return '#FF0000'; // Red
        return '#FF00FF'; // Magenta
    }
    
    collect() {
        if (this.state === 'notHit') {
            // Switch to hit state (matching original behavior)
            this.state = 'Hit';
            this.rotationSpeed = this.collectedRotationSpeed; // 30.0
            
            // Switch to hit sprite (matching original member switching)
            if (this.bonusHitSprite) {
                this.currentSprite = this.bonusHitSprite;
            }
            
            // Play sound (matching original)
            // Note: Sound will be handled by the game engine
            
            // Return the value (matching original collectBonus function)
            return this.value;
        } else {
            return 0; // Already collected
        }
    }
    
    reset() {
        if (this.state === 'Hit') {
            // Reset to normal state (matching original resetBonus function)
            this.rotationSpeed = 3.0;
            this.state = 'notHit';
            
            // Switch back to normal sprite (matching original member switching)
            if (this.bonusSprite) {
                this.currentSprite = this.bonusSprite;
            }
        }
    }
    
    // Legacy orbit methods for compatibility
    setOrbit(center, radius, speed) {
        this.orbitSystem.setCircularOrbit(center, radius, speed);
    }
    
    // New orbit methods
    setCircularOrbit(center, radius, speed) {
        this.orbitSystem.setCircularOrbit(center, radius, speed);
    }
    
    setEllipticalOrbit(center, semiMajorAxis, semiMinorAxis, speed, rotation = 0) {
        this.orbitSystem.setEllipticalOrbit(center, semiMajorAxis, semiMinorAxis, speed, rotation);
    }
    
    setFigure8Orbit(center, size, speed) {
        this.orbitSystem.setFigure8Orbit(center, size, speed);
    }
    
    setCustomOrbit(center, speed, xFunction, yFunction) {
        this.orbitSystem.setCustomOrbit(center, speed, xFunction, yFunction);
    }
}

class BonusPopup extends GameObject {
    constructor(x, y, value) {
        super(x, y, 100, 30);
        this.renderOrder = 7; // Render bonus popup on top of everything (highest priority)
        this.value = value;
        this.text = `+ ${value}`;
        this.visible = false;
        this.state = 'idle'; // idle, showing
        this.frame = 0;
        this.maxFrames = 45; // Same as original (45 frames)
        this.velocity = { x: 0, y: -1.5 }; // Move up like original but slightly faster
        this.color = this.getBonusColor(value);
        this.fontSize = 20;
        this.alpha = 1.0;
    }
    
    getBonusColor(value) {
        if (value < 100) return '#00FF00'; // Green
        if (value < 500) return '#FFFF00'; // Yellow
        if (value < 1000) return '#FF8000'; // Orange
        if (value < 5000) return '#FF0000'; // Red
        return '#FF00FF'; // Magenta
    }
    
    show(value, location) {
        plog.bonus(`BonusPopup.show called with value: ${value}, location:`, location);
        this.value = value;
        this.text = `+ ${value}`;
        // Start slightly above the bonus location like original
        this.position = { x: location.x, y: location.y - 10 };
        this.visible = true;
        this.state = 'showing';
        this.frame = this.maxFrames;
        this.alpha = 1.0;
        this.color = this.getBonusColor(value);
        plog.bonus(`BonusPopup positioned at:`, this.position, 'color:', this.color);
    }
    
    update(deltaTime) {
        if (this.state === 'showing') {
            this.frame--;
            
            // Move up like original
            this.position.y += this.velocity.y;
            
            // Fade out over time
            this.alpha = this.frame / this.maxFrames;
            
            if (this.frame <= 0) {
                plog.bonus('BonusPopup finished - hiding');
                this.state = 'idle';
                this.visible = false;
            }
        }
    }
    
    drawSprite(ctx) {
        // Draw text with glow effect
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw text background for better visibility
        const textMetrics = ctx.measureText(this.text);
        const textWidth = textMetrics.width;
        const textHeight = this.fontSize;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(-textWidth/2 - 4, -textHeight/2 - 2, textWidth + 8, textHeight + 4);
        
        // Draw text
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, 0, 0);
        
        // Reset shadow
        ctx.shadowBlur = 0;
    }
}

class Target extends GameObject {
    constructor(x, y, width = 60, height = 60, spriteType = 'ship_open', assetLoader = null) {
        super(x, y, width, height);
        this.renderOrder = 4; // Render target after planets but before penguin
        this.assetLoader = assetLoader;
        this.spriteType = spriteType; // Default sprite type
        this.shipState = 'open'; // open by default, closed when hit
        this.shipSprites = null;
        this.currentShipSprite = null;
        this.hitFrameCount = 0;
        this.hitDuration = 30; // frames to show closed ship (like original)
        this.isHit = false;
        
        // Initialize ship sprite if asset loader is available
        if (this.assetLoader) {
            this.initializeShip();
        }
    }
    
    initializeShip() {
        try {
            plog.success('Initializing ship sprites...');
            
            // Create ship sprites using HTML Image elements
            this.shipSprites = {
                closed: new Image(),
                open: new Image()
            };
            
            // Set up error handling for image loading
            this.shipSprites.closed.onerror = () => {
                plog.error('Failed to load ship_closed.png');
            };
            this.shipSprites.open.onerror = () => {
                plog.error('Failed to load ship_open.png');
            };
            
            this.shipSprites.closed.onload = () => {
                plog.success('Ship closed sprite loaded successfully');
            };
            this.shipSprites.open.onload = () => {
                plog.success('Ship open sprite loaded successfully');
            };
            
            // Load the ship images
            this.shipSprites.closed.src = 'assets/sprites/ship_closed.png';
            this.shipSprites.open.src = 'assets/sprites/ship_open.png';
            
            // Set current sprite based on spriteType, fallback to open
            if (this.spriteType === 'ship_closed') {
                this.currentShipSprite = this.shipSprites.closed;
                this.shipState = 'closed';
            } else {
                this.currentShipSprite = this.shipSprites.open;
                this.shipState = 'open';
            }
            
            plog.success(`Ship sprites initialized - starting with ${this.spriteType}`);
            
        } catch (error) {
            plog.error('Error initializing ship sprite:', error);
        }
    }
    
    // Method to refresh sprite when spriteType changes
    refreshSprite() {
        if (!this.shipSprites) return;
        
        if (this.spriteType === 'ship_closed' && this.shipSprites.closed) {
            this.currentShipSprite = this.shipSprites.closed;
            this.shipState = 'closed';
        } else if (this.shipSprites.open) {
            this.currentShipSprite = this.shipSprites.open;
            this.shipState = 'open';
        }
        
        plog.success(`Target sprite refreshed to ${this.spriteType}`);
    }
    
    update(deltaTime) {
        // Handle hit state timing
        if (this.isHit) {
            this.hitFrameCount++;
            if (this.hitFrameCount >= this.hitDuration) {
                // Open the ship after duration (return to default state)
                this.shipState = 'open';
                if (this.shipSprites && this.shipSprites.open) {
                    this.currentShipSprite = this.shipSprites.open;
                }
                this.isHit = false;
                this.hitFrameCount = 0;
            }
        }
    }
    
    drawSprite(ctx) {
        if (this.shipSprites && this.currentShipSprite) {
            // Draw the ship sprite
            const sprite = this.currentShipSprite;
            
            // Check if sprite is loaded
            if (!sprite.complete) {
                plog.warn('Ship sprite not yet loaded, using fallback');
                this.drawFallbackTarget(ctx);
                return;
            }
            
            // Scale the sprite to fit our target size
            const scaleX = this.width / sprite.width;
            const scaleY = this.height / sprite.height;
            const scale = Math.min(scaleX, scaleY);
            
            ctx.save();
            ctx.scale(scale, scale);
            
            // Draw the ship sprite directly (no alpha processing)
            ctx.drawImage(sprite, 
                -sprite.width/2, -sprite.height/2, 
                sprite.width, sprite.height);
            
            ctx.restore();
        } else {
            // Fallback: draw simple target rings if ship sprite not available
            this.drawFallbackTarget(ctx);
        }
    }
    
    drawFallbackTarget(ctx) {
        const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
        ctx.globalAlpha = pulse;
        
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 3;
        
        for (let i = 3; i > 0; i--) {
            const radius = (this.width / 2) * (i / 3);
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
        }
        
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1.0;
    }
    
    checkCollision(penguin) {
        const distance = Utils.distance(this.position, penguin.position);
        return distance < this.width / 2;
    }
    
    // Called when penguin hits the target (like original setUpHitTarget)
    onHit() {
        plog.success('Target hit - closing ship');
        this.isHit = true;
        this.hitFrameCount = 0;
        this.shipState = 'closed';
        
        // Only update sprite if shipSprites are loaded
        if (this.shipSprites && this.shipSprites.closed) {
            this.currentShipSprite = this.shipSprites.closed;
        }
    }
}

class Arrow extends GameObject {
    constructor(x, y) {
        super(x, y, 20, 20); // Initial width is 20, will be adjusted based on distance
        this.renderOrder = 6; // Render arrow on top of everything (highest priority)
        this.visible = false;
        this.color = '#00FFFF'; // Bright cyan color like the original
        this.glowColor = '#0099FF'; // Slightly darker blue for glow effect
        this.stageRect = null; // Will be set from game
        this.flightRect = null; // Will be set from game for proper bounds checking
    }
    
    setStageRect(rect) {
        this.stageRect = rect;
    }
    
    setFlightRect(rect) {
        this.flightRect = rect;
    }
    
    draw(ctx) {
        if (!this.visible) {
            plog.debug('Arrow draw skipped - not visible');
            return;
        }
        
        plog.debug('Arrow draw called - visible:', this.visible, 'position:', this.position);
        
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(Utils.toRadians(this.rotation));
        
        this.drawSprite(ctx);
        
        ctx.restore();
    }
    
    update(penguin) {
        plog.debug('Arrow update called - visible:', this.visible, 'stageRect:', !!this.stageRect, 'flightRect:', !!this.flightRect);
        
        if (!this.stageRect || !this.flightRect) {
            plog.debug('Arrow update skipped - missing rects');
            return;
        }
        
        // console.log('Penguin position:', penguin.position, 'flightRect:', this.flightRect);
        
        // Check if penguin is outside game bounds but inside flight bounds
        const isInsideStage = this.isInside(penguin.position, this.stageRect);
        const isInsideFlight = this.isInside(penguin.position, this.flightRect);
        plog.debug('Penguin inside stage rect:', isInsideStage, 'inside flight rect:', isInsideFlight);
        
        // Show arrow when penguin is outside stage but inside flight bounds
        if (!isInsideStage && isInsideFlight) {
            this.visible = true;
            const clampedPos = this.clampToStage(penguin.position);
            this.position = { x: clampedPos.x, y: clampedPos.y };
            
            // Calculate rotation to point at penguin
            const dx = penguin.position.x - this.position.x;
            const dy = penguin.position.y - this.position.y;
            this.rotation = Utils.rotationAngle({ x: dx, y: dy });
            
            // Scale width based on distance (20 + distance/2) like original
            const distance = Utils.distance(this.position, penguin.position);
            this.width = 20 + (distance / 2);
            this.height = 20; // Keep height constant
            
            plog.debug('Arrow visible - penguin at:', penguin.position, 'arrow at:', this.position, 'distance:', distance, 'rotation:', this.rotation);
        } else {
            this.visible = false;
            plog.debug('Arrow hidden - penguin inside stage bounds or outside flight bounds');
        }
    }
    
    isInside(point, rect) {
        return point.x >= rect.x && 
               point.x <= rect.x + rect.width &&
               point.y >= rect.y && 
               point.y <= rect.y + rect.height;
    }
    
    clampToStage(point) {
        return {
            x: Math.max(this.stageRect.x, Math.min(point.x, this.stageRect.x + this.stageRect.width)),
            y: Math.max(this.stageRect.y, Math.min(point.y, this.stageRect.y + this.stageRect.height))
        };
    }
    
    drawSprite(ctx) {
        plog.debug('Arrow drawSprite called - position:', this.position, 'rotation:', this.rotation, 'width:', this.width);
        
        // Draw arrow with glow effect
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 2;
        
        // Draw arrow body - tip should be at the edge, pointing toward penguin
        const arrowLength = this.width;
        const arrowWidth = 10;
        const headLength = 15;
        const headWidth = 15;
        
        ctx.beginPath();
        // Arrow shaft (from edge toward penguin)
        ctx.moveTo(-arrowLength, -arrowWidth/2);
        ctx.lineTo(-headLength, -arrowWidth/2);
        // Arrow head (tip pointing toward penguin)
        ctx.lineTo(-headLength, -headWidth);
        ctx.lineTo(0, 0); // Tip of arrow at edge (red dot position)
        ctx.lineTo(-headLength, headWidth);
        ctx.lineTo(-headLength, arrowWidth/2);
        ctx.lineTo(-arrowLength, arrowWidth/2);
        ctx.closePath();
        
        ctx.fill();
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
        
    }
}

class Slingshot extends GameObject {
    constructor(x, y, anchorX = null, anchorY = null, stretchLimit = 150) {
        super(x, y, 100, 100);
        this.renderOrder = 3; // Render slingshot after bonuses but before planets
        // Set position to anchor for consistency
        this.position = { x: anchorX !== null ? anchorX : x, y: anchorY !== null ? anchorY : y };
        this.anchor = this.position;
        this.pullback = { x: 0, y: 0 }; // Offset from anchor
        this.maxPullback = stretchLimit; // pStretchLimit from Lingo (increased by 50% for finer control)
        this.minPullback = 10;
        this.isPulling = false;
        // Colors matched from original game screenshot - glowing blue/cyan effect
        this.rubberBandColor = '#FFFF00'; // Bright cyan for rubber bands
        this.hoopColor = '#00FFFF'; // Bright cyan for hoop
        this.glowColor = '#0099FF'; // Slightly darker blue for the glow effect
        this.hoopRadiusX = 16;
        this.hoopRadiusY = 29;
        this.penguin = null; // Reference to penguin object
        this.velocityMultiplier = 10; // Global velocity multiplier (reduced by 25% to compensate for increased pullback range)
        this.rotation = 0; // Hoop rotation (like pSHoopT.rotation)
    }

    setPenguin(penguin) {
        this.penguin = penguin;
    }

    update(deltaTime) {
        // Slingshot doesn't need much update logic
    }

    drawSprite(ctx) {
        // The parent GameObject.draw() method has already translated to the anchor
        // and rotated the context by this.rotation. We just need to draw.

        // Draw outer glow effect
        // ctx.shadowColor = this.glowColor;
        // ctx.shadowBlur = 15;
        // ctx.strokeStyle = this.hoopColor;
        // ctx.lineWidth = 4;
        // ctx.beginPath();
        // ctx.ellipse(0, 0, this.hoopRadiusX + 2, this.hoopRadiusY + 2, 0, 0, Math.PI * 2);
        // ctx.stroke();

        // Draw hoop outline with glow
        ctx.strokeStyle = this.hoopColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.hoopRadiusX, this.hoopRadiusY, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Draw hoop fill with bright center
        // ctx.fillStyle = this.glowColor;
        // ctx.globalAlpha = 0.3;
        // ctx.beginPath();
        // ctx.ellipse(0, 0, this.hoopRadiusX, this.hoopRadiusY, 0, 0, Math.PI * 2);
        // ctx.fill();

        // Reset shadow for rubber bands
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;

        // Draw rubber bands if pulling
        if (this.isPulling) {
            let bandTarget;
            if (this.penguin && typeof this.penguin.x === 'number' && typeof this.penguin.y === 'number') {
                // Calculate the visual center of the penguin sprite
                let visualCenterX = this.penguin.x;
                let visualCenterY = this.penguin.y;
                
                // If penguin has animation metadata, adjust for registration point and scaling
                if (this.penguin.metadata && this.penguin.currentAnimationType) {
                    const metadata = this.penguin.metadata[this.penguin.currentAnimationType];
                    if (metadata && metadata.registration_points) {
                        const regPoint = metadata.registration_points[this.penguin.aniFrame] || metadata.registration_points[0];
                        const scale = 1.5; // Same scale as in penguin drawing
                        
                        // Adjust for registration point offset and scaling
                        // The sprite is drawn at (x - regPoint[0], y - regPoint[1]) then scaled
                        // So the visual center is at (x + regPoint[0]*(scale-1), y + regPoint[1]*(scale-1))
                        visualCenterX = this.penguin.x + (regPoint[0] * (scale - 1));
                        visualCenterY = this.penguin.y + (regPoint[1] * (scale - 1));
                    }
                }
                
                // bandTarget is the vector from anchor to penguin's visual center in world-space
                bandTarget = { x: visualCenterX - this.anchor.x, y: visualCenterY - this.anchor.y };
            } else {
                bandTarget = { x: this.pullback.x, y: this.pullback.y };
            }
            this.drawRubberBands(ctx, bandTarget);
        }
    }

    drawRubberBands(ctx, bandTarget) {
        // The canvas is already rotated, so the "pull direction" is along the local x-axis.
        // We need to calculate the coordinates of the bandTarget in this rotated frame.
        const angleRad = Utils.toRadians(-this.rotation);
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        const rotatedX = bandTarget.x * cos - bandTarget.y * sin;
        const rotatedY = bandTarget.x * sin + bandTarget.y * cos;

        // The attachment points are perpendicular to the pull direction, so on the local y-axis.
        const tempRadius = this.hoopRadiusY - 3;
        const topAttachment = { x: 0, y: -tempRadius };
        const bottomAttachment = { x: 0, y: tempRadius };

        // Draw rubber bands with glow effect
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = this.rubberBandColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        // Top rubber band
        ctx.beginPath();
        ctx.moveTo(topAttachment.x, topAttachment.y);
        ctx.lineTo(rotatedX, rotatedY);
        ctx.stroke();

        // Bottom rubber band
        ctx.beginPath();
        ctx.moveTo(bottomAttachment.x, bottomAttachment.y);
        ctx.lineTo(rotatedX, rotatedY);
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
    }

    startPull(x, y) {
        this.isPulling = true;
        this.updatePullback(x, y);
    }

    updatePullback(x, y) {
        // Calculate offset from anchor (hoop) to mouse
        const dx = x - this.anchor.x;
        const dy = y - this.anchor.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        // Clamp distance between min and max
        if (distance > this.maxPullback) distance = this.maxPullback;
        if (distance < this.minPullback) distance = this.minPullback;
        // Use original rotationAngle logic
        const angle = Utils.rotationAngle({ x: dx, y: dy });
        // Find the new penguin position using findPoint
        const newPoint = Utils.findPoint(this.anchor, angle, distance);
        // Update pullback vector (relative to anchor)
        this.pullback.x = newPoint.x - this.anchor.x;
        this.pullback.y = newPoint.y - this.anchor.y;
        // Update hoop rotation (like pSHoopT.rotation = newAngle)
        this.rotation = angle;
        // Update penguin position directly if reference is set
        if (this.penguin && typeof this.penguin.setPosition === 'function') {
            this.penguin.setPosition(newPoint.x, newPoint.y);
        }
    }

    release() {
        this.isPulling = false;
        // Calculate launch vector using original Lingo logic
        // tempPoint = anchor - penguin
        const tempPoint = {
            x: this.anchor.x - (this.penguin ? this.penguin.x : this.anchor.x),
            y: this.anchor.y - (this.penguin ? this.penguin.y : this.anchor.y)
        };
        
        // Calculate distance from anchor
        const distance = Math.sqrt(tempPoint.x * tempPoint.x + tempPoint.y * tempPoint.y);
        
        // Apply non-linear scaling: 1:1 at low distances, exponential at higher distances
        const normalizedDistance = distance / this.maxPullback; // 0 to 1
        const nonLinearScale = this.calculateNonLinearScale(normalizedDistance);
        
        // Scale the pullback vector with non-linear scaling
        const scaledPoint = { 
            x: tempPoint.x * nonLinearScale, 
            y: tempPoint.y * nonLinearScale 
        };
        
        // tempSpeed = (x^2 + y^2) / 250.0
        const tempSpeed = (scaledPoint.x * scaledPoint.x + scaledPoint.y * scaledPoint.y) / 250.0;
        // tempAngle = Utils.rotationAngle(anchor - penguin)
        const tempAngle = Utils.rotationAngle(tempPoint);
        // tempVector = findPoint({0,0}, tempAngle, tempSpeed)
        const tempVector = Utils.findPoint({ x: 0, y: 0 }, tempAngle, tempSpeed);
        // Apply global velocity multiplier
        this.pullback = { x: 0, y: 0 };
        return { x: tempVector.x * this.velocityMultiplier, y: tempVector.y * this.velocityMultiplier };
    }
    
    calculateNonLinearScale(normalizedDistance) {
        // normalizedDistance is 0 to 1
        // At low distances (0-0.3): linear 1:1 scaling
        // At medium distances (0.3-0.7): gradual increase
        // At high distances (0.7-1.0): exponential increase
        
        return normalizedDistance;
    }
}

class TextObject extends GameObject {
    constructor(x, y, content, options = {}) {
        const width = options.width || 200;
        const height = options.height || 100;
        super(x, y, width, height);
        this.renderOrder = options.renderOrder || 8; // Render text on top of most things
        this.content = content; // HTML content
        this.visible = options.visible !== undefined ? options.visible : true;
        
        // Text styling options (matching original HTML formatting)
        this.textAlign = options.textAlign || 'left';
        this.fontSize = options.fontSize || 16;
        this.fontFamily = options.fontFamily || 'Arial, sans-serif';
        this.color = options.color || '#FFFFCC'; // Default yellow like original
        this.backgroundColor = options.backgroundColor || 'rgba(0, 0, 0, 0.7)'; // Semi-transparent black
        this.borderRadius = options.borderRadius || 8;
        this.padding = options.padding || 10;
        this.maxWidth = options.maxWidth || width - (this.padding * 2);
        
        // Auto-sizing based on content
        this.autoSize = options.autoSize !== undefined ? options.autoSize : true;
        
        // Animation properties
        this.fadeIn = options.fadeIn || false;
        this.fadeInDuration = options.fadeInDuration || 1.0; // seconds
        this.fadeTimer = 0;
        
        // Parse HTML content to extract text and basic formatting
        this.parsedContent = this.parseHTMLContent(content);
    }
    
    parseHTMLContent(htmlContent) {
        // Simple HTML parsing to extract text and basic formatting
        // Remove HTML tags but preserve text content and basic formatting info
        let text = htmlContent;
        let isBold = false;
        let fontSize = this.fontSize;
        let color = this.color;
        
        // Extract font size
        const sizeMatch = text.match(/<font[^>]*size[=\s]*[\"']?(\d+)[\"']?[^>]*>/i);
        if (sizeMatch) {
            fontSize = parseInt(sizeMatch[1]) * 4; // Convert HTML font size to pixels (rough approximation)
        }
        
        // Extract color
        const colorMatch = text.match(/<font[^>]*color[=\s]*[\"']?([^\"'>]+)[\"']?[^>]*>/i);
        if (colorMatch) {
            color = colorMatch[1];
        }
        
        // Check for bold
        isBold = /<b[^>]*>/.test(text) || /<strong[^>]*>/.test(text);
        
        // Handle line breaks before removing HTML tags
        text = text.replace(/<br\s*\/?>/gi, '\n');
        
        // Remove all HTML tags
        text = text.replace(/<[^>]*>/g, '');
        
        // Convert HTML entities
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&#58;/g, ':');
        
        return {
            text: text.trim(),
            isBold,
            fontSize,
            color
        };
    }
    
    update(deltaTime) {
        // Handle fade-in animation
        if (this.fadeIn && this.fadeTimer < this.fadeInDuration) {
            this.fadeTimer += deltaTime;
            this.alpha = Math.min(1.0, this.fadeTimer / this.fadeInDuration);
        }
    }
    
    drawSprite(ctx) {
        const parsed = this.parsedContent;
        
        // Set up text properties
        ctx.font = `${parsed.isBold ? 'bold ' : ''}${parsed.fontSize}px ${this.fontFamily}`;
        ctx.textAlign = this.textAlign;
        ctx.textBaseline = 'top';
        
        // Measure text for auto-sizing
        const lines = this.wrapText(ctx, parsed.text, this.maxWidth);
        const lineHeight = parsed.fontSize * 1.2;
        const textHeight = lines.length * lineHeight;
        const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
        
        if (this.autoSize) {
            this.width = textWidth + (this.padding * 2);
            this.height = textHeight + (this.padding * 2);
        }
        
        // Draw background
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(
            -this.width / 2,
            -this.height / 2,
            this.width,
            this.height
        );
        
        // Draw border
        // ctx.strokeStyle = parsed.color;
        // ctx.lineWidth = 1;
        // ctx.strokeRect(
        //     -this.width / 2,
        //     -this.height / 2,
        //     this.width,
        //     this.height
        // );
        
        // Draw text
        ctx.fillStyle = parsed.color;
        const startY = -this.height / 2 + this.padding;
        const startX = this.textAlign === 'center' ? 0 : -this.width / 2 + this.padding;
        
        lines.forEach((line, index) => {
            const y = startY + (index * lineHeight);
            ctx.fillText(line, startX, y);
        });
    }
    
    wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (let i = 0; i < words.length; i++) {
            const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines;
    }
    
    // Method to update content dynamically
    setContent(newContent) {
        this.content = newContent;
        this.parsedContent = this.parseHTMLContent(newContent);
    }
    
    // Method to show/hide with optional fade
    show(fadeIn = false) {
        this.visible = true;
        if (fadeIn) {
            this.fadeIn = true;
            this.fadeTimer = 0;
            this.alpha = 0;
        } else {
            this.alpha = 1.0;
        }
    }
    
    hide() {
        this.visible = false;
    }
}

class PointingArrow extends GameObject {
    constructor(x, y, options = {}) {
        super(x, y, 20, 20);
        this.renderOrder = options.renderOrder || 9; // Render on top of text
        this.color = options.color || '#00FFFF'; // Bright cyan like original
        this.glowColor = options.glowColor || '#0099FF';
        this.pointingAt = null; // Target position to point at
        this.baseWidth = options.baseWidth || 20;
        this.scaleWithDistance = options.scaleWithDistance !== undefined ? options.scaleWithDistance : true;
        this.maxDistance = options.maxDistance || 300; // Max distance for scaling
        this.minWidth = options.minWidth || 15;
        this.maxWidth = options.maxWidth || 60;
        
        // Pulsing animation
        this.pulseSpeed = options.pulseSpeed || 3.0;
        this.pulseTimer = 0;
        this.minAlpha = options.minAlpha || 0.6;
        this.maxAlpha = options.maxAlpha || 1.0;
    }
    
    // Set the target position this arrow should point to
    pointTo(targetPosition) {
        this.pointingAt = { x: targetPosition.x, y: targetPosition.y };
        this.visible = true;
    }
    
    // Stop pointing (hide arrow)
    stopPointing() {
        this.pointingAt = null;
        this.visible = false;
    }
    
    update(deltaTime) {
        if (!this.pointingAt || !this.visible) {
            return;
        }
        
        // Calculate rotation to point at target
        const dx = this.pointingAt.x - this.position.x;
        const dy = this.pointingAt.y - this.position.y;
        this.rotation = Utils.rotationAngle({ x: dx, y: dy });
        
        // Scale width based on distance if enabled
        if (this.scaleWithDistance) {
            const distance = Math.sqrt(dx * dx + dy * dy);
            const normalizedDistance = Math.min(distance / this.maxDistance, 1.0);
            this.width = this.minWidth + (normalizedDistance * (this.maxWidth - this.minWidth));
        }
        
        // Pulsing animation
        this.pulseTimer += deltaTime;
        const pulse = Math.sin(this.pulseTimer * this.pulseSpeed) * 0.5 + 0.5;
        this.alpha = this.minAlpha + (pulse * (this.maxAlpha - this.minAlpha));
    }
    
    drawSprite(ctx) {
        // Draw arrow with glow effect
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = 2;
        
        // Arrow dimensions
        const arrowLength = this.width;
        const arrowWidth = 8;
        const headLength = 12;
        const headWidth = 12;
        
        ctx.beginPath();
        // Arrow shaft
        ctx.moveTo(-arrowLength, -arrowWidth/2);
        ctx.lineTo(-headLength, -arrowWidth/2);
        // Arrow head
        ctx.lineTo(-headLength, -headWidth/2);
        ctx.lineTo(0, 0); // Tip pointing toward target
        ctx.lineTo(-headLength, headWidth/2);
        ctx.lineTo(-headLength, arrowWidth/2);
        ctx.lineTo(-arrowLength, arrowWidth/2);
        ctx.closePath();
        
        ctx.fill();
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
    }
}

// Export all classes
export { GameObject, OrbitSystem, Planet, Bonus, BonusPopup, Target, Arrow, Slingshot, TextObject, PointingArrow }; 