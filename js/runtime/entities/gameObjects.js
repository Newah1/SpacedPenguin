// Game objects for Spaced Penguin
// Based on the original behavior scripts

import Utils from '../../platform/utils.js';
import plog from '../../diagnostics/penguinLogger.js';
import { stepOrbit } from '../../simulation/orbitSimulation.js';
import { calculateLaunchScale, calculateLaunchVelocity } from '../../simulation/simulationEngine.js';
import { LevelOrbitType } from '../../levels/levelSchema.js';
import { LEVEL_DEFAULTS, PHYSICS_CONFIG, SIMULATION_CONFIG } from '../../config/gameConfig.js';
import { RENDER_CONFIG } from '../../config/renderConfig.js';
import { WaypointSystem } from '../../simulation/waypointSimulation.js';

function colorForThreshold(value, thresholds, fallback) {
    return thresholds.find(({ below }) => value < below)?.color ?? fallback;
}

// New consolidated orbit system supporting non-circular orbits and hierarchical targets
class OrbitSystem {
    constructor(gameObjectLookup = null) {
        this.orbitCenter = null; // Can be a position {x, y} or object reference
        this.orbitTargetId = null; // ID of target object for hierarchical orbits
        this.orbitRadius = 0;
        this.orbitSpeed = 0;
        this.orbitAngle = 0;
        this.orbitType = LevelOrbitType.CIRCULAR;
        this.orbitParams = {}; // Additional parameters for complex orbits
        this.gameObjectLookup = gameObjectLookup; // Function to resolve object IDs
        
        // Physics-based orbit properties
        this.velocity = { x: 0, y: 0 }; // Current velocity for gravity orbits
        this.gravityStrength = PHYSICS_CONFIG.orbit.gravityStrength;
        this.maxGravityAccel = PHYSICS_CONFIG.orbit.maxGravityAcceleration;
        this.frameAccumulator = 0;
    }
    
    // Set up circular orbit (original behavior)
    setCircularOrbit(center, radius, speed) {
        if (typeof center === 'string') {
            this.orbitTargetId = center;
            this.orbitCenter = null;
        } else {
            this.orbitCenter = center;
            this.orbitTargetId = null;
        }
        this.orbitRadius = radius;
        this.orbitSpeed = speed;
        this.orbitType = LevelOrbitType.CIRCULAR;
        this.orbitParams = {};
    }
    
    // Set up elliptical orbit
    setEllipticalOrbit(center, semiMajorAxis, semiMinorAxis, speed, rotation = 0) {
        if (typeof center === 'string') {
            this.orbitTargetId = center;
            this.orbitCenter = null;
        } else {
            this.orbitCenter = center;
            this.orbitTargetId = null;
        }
        this.orbitRadius = semiMajorAxis; // Keep for compatibility
        this.orbitSpeed = speed;
        this.orbitType = LevelOrbitType.ELLIPTICAL;
        this.orbitParams = {
            semiMajorAxis: semiMajorAxis,
            semiMinorAxis: semiMinorAxis,
            rotation: rotation // Rotation of ellipse in radians
        };
    }
    
    // Set up figure-8 orbit (lemniscate)
    setFigure8Orbit(center, size, speed) {
        if (typeof center === 'string') {
            this.orbitTargetId = center;
            this.orbitCenter = null;
        } else {
            this.orbitCenter = center;
            this.orbitTargetId = null;
        }
        this.orbitRadius = size;
        this.orbitSpeed = speed;
        this.orbitType = LevelOrbitType.FIGURE_8;
        this.orbitParams = {
            size: size
        };
    }
    
    // Set up physics-based gravity orbit
    setGravityOrbit(center, initialVelocity, gravityStrength = PHYSICS_CONFIG.orbit.gravityStrength, currentPosition = null) {
        if (typeof center === 'string') {
            this.orbitTargetId = center;
            this.orbitCenter = null;
        } else {
            this.orbitCenter = center;
            this.orbitTargetId = null;
        }
        this.orbitType = LevelOrbitType.GRAVITY;
        this.velocity = { x: initialVelocity.x, y: initialVelocity.y };
        this.gravityStrength = gravityStrength;
        
        // Store initial parameters for reset functionality
        this.orbitParams = {
            gravityStrength: gravityStrength,
            initialVelocity: { ...initialVelocity }
        };
        
        // If current position is provided, store it as initial position for resets
        if (currentPosition) {
            this.orbitParams.initialPosition = { 
                x: currentPosition.x, 
                y: currentPosition.y 
            };
        }
    }

    setDirectorGravityOrbit(params = {}, currentPosition = null) {
        const sources = Array.isArray(params.gravitySources) ? params.gravitySources : [];
        this.orbitTargetId = sources[0]?.targetId ?? null;
        this.orbitCenter = sources[0]?.position ?? null;
        this.orbitType = LevelOrbitType.DIRECTOR_GRAVITY;
        this.velocity = { ...(params.initialVelocity || { x: 0, y: 0 }) };
        this.gravityStrength = params.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength;
        this.frameAccumulator = 0;
        this.orbitParams = {
            ...params,
            gravitySources: sources.map(source => ({ ...source }))
        };
        if (currentPosition) this.orbitParams.initialPosition = { ...currentPosition };
    }
    
    // Helper method to calculate stable circular orbital velocity
    static calculateOrbitalVelocity(distance, gravityStrength) {
        // For circular orbit: v = sqrt(GM/r)
        return Math.sqrt(gravityStrength / distance);
    }
    
    // Helper method to set up a stable circular orbit given distance
    setStableCircularOrbit(center, distance, gravityStrength = PHYSICS_CONFIG.orbit.gravityStrength, currentPosition = null) {
        const orbitalSpeed = OrbitSystem.calculateOrbitalVelocity(distance, gravityStrength);
        
        // Calculate velocity vector perpendicular to position vector for circular orbit
        let velocityX = 0;
        let velocityY = orbitalSpeed;
        
        // If we have current position, calculate proper velocity direction
        if (currentPosition && (typeof center === 'object')) {
            const dx = currentPosition.x - center.x;
            const dy = currentPosition.y - center.y;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            
            if (currentDistance > 0) {
                // Velocity perpendicular to radius vector (90 degrees rotated)
                velocityX = -dy / currentDistance * orbitalSpeed;
                velocityY = dx / currentDistance * orbitalSpeed;
            }
        }
        
        this.setGravityOrbit(center, { x: velocityX, y: velocityY }, gravityStrength);
    }
    
    // Set up custom parametric orbit
    setCustomOrbit(center, speed, xFunction, yFunction) {
        if (typeof center === 'string') {
            this.orbitTargetId = center;
            this.orbitCenter = null;
        } else {
            this.orbitCenter = center;
            this.orbitTargetId = null;
        }
        this.orbitSpeed = speed;
        this.orbitType = LevelOrbitType.CUSTOM;
        this.orbitParams = {
            xFunction: xFunction,
            yFunction: yFunction
        };
    }
    
    // Update orbit position
    update(deltaTime, currentPosition = null) {
        const center = this.getResolvedCenter();
        const result = stepOrbit({
            type: this.orbitType,
            center: this.orbitCenter,
            targetId: this.orbitTargetId,
            radius: this.orbitRadius,
            speed: this.orbitSpeed,
            angle: this.orbitAngle,
            params: this.orbitParams,
            velocity: this.velocity,
            gravityStrength: this.gravityStrength,
            maxGravityAccel: this.maxGravityAccel,
            frameAccumulator: this.frameAccumulator
        }, currentPosition || { x: 0, y: 0 }, center, this.getResolvedTarget(), deltaTime,
        this.getResolvedGravitySources());
        this.orbitAngle = result.orbit?.angle ?? this.orbitAngle;
        this.velocity = result.orbit?.velocity || this.velocity;
        this.frameAccumulator = result.orbit?.frameAccumulator ?? this.frameAccumulator;
        return result.position;
    }

    getResolvedGravitySources() {
        if (this.orbitType !== LevelOrbitType.DIRECTOR_GRAVITY) return null;
        return (this.orbitParams.gravitySources || []).map(source => {
            const target = source.targetId && this.gameObjectLookup
                ? this.gameObjectLookup(source.targetId)
                : null;
            return target || (source.position ? { position: source.position } : null);
        });
    }
    
    // Resolve orbit center - can be a fixed position or dynamic object reference
    getResolvedCenter() {
        if (this.orbitTargetId && this.gameObjectLookup) {
            const targetObject = this.gameObjectLookup(this.orbitTargetId);
            if (targetObject && targetObject.position) {
                return targetObject.position;
            }
        }
        return this.orbitCenter;
    }
    
    // Resolve the target object (not just its position) for gravity properties like mass/reach
    getResolvedTarget() {
        if (this.orbitTargetId && this.gameObjectLookup) {
            const targetObject = this.gameObjectLookup(this.orbitTargetId);
            if (targetObject) {
                return targetObject;
            }
        }
        if (this.orbitCenter && typeof this.orbitCenter === 'object' && (this.orbitCenter.position || this.orbitCenter.mass !== undefined || this.orbitCenter.gravitationalReach !== undefined)) {
            return this.orbitCenter;
        }
        return null;
    }
    
    calculateCircularPosition(center) {
        return {
            x: center.x + Math.cos(this.orbitAngle) * this.orbitRadius,
            y: center.y + Math.sin(this.orbitAngle) * this.orbitRadius
        };
    }
    
    calculateEllipticalPosition(center) {
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
            x: center.x + rotatedX,
            y: center.y + rotatedY
        };
    }
    
    calculateFigure8Position(center) {
        const { size } = this.orbitParams;
        
        // Lemniscate of Bernoulli formula
        const denominator = 1 + Math.sin(this.orbitAngle) * Math.sin(this.orbitAngle);
        const x = size * Math.cos(this.orbitAngle) / denominator;
        const y = size * Math.sin(this.orbitAngle) * Math.cos(this.orbitAngle) / denominator;
        
        return {
            x: center.x + x,
            y: center.y + y
        };
    }
    
    calculateGravityPosition(center, deltaTime, currentPosition) {
        // Penguin-style gravity toward a single selected target object
        if (!currentPosition) {
            return this.calculateCircularPosition(center);
        }
        
        // Resolve the target object to read mass/reach when available
        const target = this.getResolvedTarget();
        const targetPos = center;
        
        // Displacement vector from object to target (planet - object)
        const changeLocX = targetPos.x - currentPosition.x;
        const changeLocY = targetPos.y - currentPosition.y;
        const distanceSquared = (changeLocX * changeLocX) + (changeLocY * changeLocY);
        const distance = Math.sqrt(distanceSquared);
        
        //if (distance < 1) return currentPosition;
        
        // Optional gravitational reach check if target provides it
        if (target && typeof target.gravitationalReach === 'number' && target.gravitationalReach > 0) {
            const effectiveReach = (target.radius || 0) + target.gravitationalReach;
            if (distance > effectiveReach) {
                return currentPosition;
            }
        }
        
        // Mass-weighted inverse-square gravity like penguin.js
        const mass = (target && typeof target.mass === 'number') ? target.mass : 1;
        let gravitationalForce = 0;
        if (distanceSquared > 0) {
            gravitationalForce = (mass * this.gravityStrength) / distanceSquared;
        }
        
        // Compute acceleration along non-normalized displacement
        let accelX = gravitationalForce * changeLocX;
        let accelY = gravitationalForce * changeLocY;
        
        // Clamp acceleration magnitude to avoid extreme slingshot near center
        const accelMag = Math.sqrt(accelX * accelX + accelY * accelY);
        if (accelMag > this.maxGravityAccel) {
            const scale = this.maxGravityAccel / accelMag;
            accelX *= scale;
            accelY *= scale;
        }
        
        // Apply acceleration
        this.velocity.x += accelX;
        this.velocity.y += accelY;
        
        // Integrate position
        const newX = currentPosition.x + this.velocity.x * deltaTime;
        const newY = currentPosition.y + this.velocity.y * deltaTime;
        
        return { x: newX, y: newY };
    }
    
    calculateCustomPosition(center) {
        const { xFunction, yFunction } = this.orbitParams;
        
        if (typeof xFunction === 'function' && typeof yFunction === 'function') {
            return {
                x: center.x + xFunction(this.orbitAngle),
                y: center.y + yFunction(this.orbitAngle)
            };
        }
        
        // Fallback to circular
        return this.calculateCircularPosition(center);
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
        this.id = null; // Unique identifier for object references
        this.name = ''; // Human-readable name for level editor
        this.waypointSystem = null;
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

class Portal extends GameObject {
    constructor(x, y, options = {}) {
        super(
            x,
            y,
            options.width ?? LEVEL_DEFAULTS.portal.width,
            options.height ?? LEVEL_DEFAULTS.portal.height
        );
        this.color = options.color ?? LEVEL_DEFAULTS.portal.color;
        this.pairedPortalId = options.pairedPortalId ?? null;
        this.playSound = options.playSound ?? LEVEL_DEFAULTS.portal.playSound;
        this.rotation = options.rotation ?? 0;
        this.renderOrder = RENDER_CONFIG.layers.portal;
    }

    get tint() {
        return RENDER_CONFIG.entities.portal[this.color] ?? RENDER_CONFIG.entities.portal.blue;
    }

    drawSprite(ctx) {
        const config = RENDER_CONFIG.entities.portal;
        const rx = this.width / 2;
        const ry = this.height / 2;
        ctx.shadowColor = this.tint;
        ctx.shadowBlur = config.glowBlur;
        ctx.fillStyle = config.aperture;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = this.tint;
        ctx.lineWidth = config.rimWidth;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const time = globalThis.performance?.now?.() ?? 0;
        const seed = [...String(this.id || this.color)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
        ctx.fillStyle = this.tint;
        for (let index = 0; index < config.particleCount; index++) {
            const phase = time * 0.0015 + seed * 0.013 + index * (Math.PI * 2 / config.particleCount);
            const orbit = 0.78 + 0.16 * Math.sin(phase * 1.7 + index);
            const px = Math.cos(phase) * rx * orbit;
            const py = Math.sin(phase) * ry * orbit;
            ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(phase * 2.3));
            ctx.beginPath();
            ctx.arc(px, py, config.particleRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    drawForeground(ctx) {
        if (!this.visible) return;
        const config = RENDER_CONFIG.entities.portal;
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(Utils.toRadians(this.rotation));
        ctx.strokeStyle = this.tint;
        ctx.lineWidth = config.rimWidth + 1;
        ctx.shadowColor = this.tint;
        ctx.shadowBlur = config.glowBlur * 0.65;
        ctx.beginPath();
        // The full rim is rendered below Kevin with the portal body. Redraw
        // only the inward/deeper half above him, leaving the outward rim below
        // so he visibly passes over it as he exits.
        ctx.ellipse(0, 0, this.width / 2, this.height / 2, 0, 0, Math.PI);
        ctx.stroke();
        ctx.restore();
    }
}

class SpeedBooster extends GameObject {
    constructor(x, y, options = {}) {
        super(x, y, options.width ?? LEVEL_DEFAULTS.speedBooster.width, options.height ?? LEVEL_DEFAULTS.speedBooster.height);
        this.speedMultiplier = options.speedMultiplier ?? LEVEL_DEFAULTS.speedBooster.speedMultiplier;
        this.playSound = options.playSound ?? LEVEL_DEFAULTS.speedBooster.playSound;
        this.rotation = options.rotation ?? 0;
        this.renderOrder = RENDER_CONFIG.layers.speedBooster;
    }

    getArrowMarqueeOffset(timeMilliseconds, spacing) {
        const config = RENDER_CONFIG.entities.speedBooster;
        const speed = config.marqueePixelsPerSecond * Math.max(0, this.speedMultiplier);
        return ((timeMilliseconds / 1000) * speed) % spacing;
    }

    drawSprite(ctx, timeMilliseconds = globalThis.performance?.now?.() ?? 0) {
        const config = RENDER_CONFIG.entities.speedBooster;
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        ctx.shadowColor = config.border;
        ctx.shadowBlur = config.glowBlur;
        ctx.fillStyle = config.fill;
        ctx.fillRect(-halfWidth, -halfHeight, this.width, this.height);
        ctx.lineWidth = config.borderWidth;
        ctx.strokeStyle = config.border;
        ctx.strokeRect(-halfWidth, -halfHeight, this.width, this.height);
        ctx.shadowBlur = 0;

        // Clip a repeating row of arrows inside the frame. Keeping one arrow
        // beyond each edge makes the strip wrap without a visible jump.
        ctx.save();
        ctx.beginPath();
        ctx.rect(
            -halfWidth + config.borderWidth,
            -halfHeight + config.borderWidth,
            this.width - config.borderWidth * 2,
            this.height - config.borderWidth * 2
        );
        ctx.clip();
        ctx.fillStyle = config.arrow;
        const spacing = this.width / (config.arrowCount + 1);
        const arrowLength = Math.min(14, spacing * 0.7);
        const arrowHalfHeight = Math.min(8, this.height * 0.28);
        const marqueeOffset = this.getArrowMarqueeOffset(timeMilliseconds, spacing);
        for (let index = -1; index <= config.arrowCount + 1; index++) {
            const x = -halfWidth + spacing * index + marqueeOffset;
            ctx.beginPath();
            ctx.moveTo(x + arrowLength / 2, 0);
            ctx.lineTo(x - arrowLength / 2, -arrowHalfHeight);
            ctx.lineTo(x - arrowLength / 2, -arrowHalfHeight / 2);
            ctx.lineTo(x - arrowLength, -arrowHalfHeight / 2);
            ctx.lineTo(x - arrowLength, arrowHalfHeight / 2);
            ctx.lineTo(x - arrowLength / 2, arrowHalfHeight / 2);
            ctx.lineTo(x - arrowLength / 2, arrowHalfHeight);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

class DeflectorBumper extends GameObject {
    constructor(x, y, options = {}) {
        const radius = options.radius ?? LEVEL_DEFAULTS.deflectorBumper.radius;
        super(x, y, radius * 2, radius * 2);
        this.radius = radius;
        this.restitution = options.restitution ?? LEVEL_DEFAULTS.deflectorBumper.restitution;
        this.color = options.color ?? LEVEL_DEFAULTS.deflectorBumper.color;
        this.playSound = options.playSound ?? LEVEL_DEFAULTS.deflectorBumper.playSound;
        this.renderOrder = RENDER_CONFIG.layers.deflectorBumper;
    }

    drawSprite(ctx, timeMilliseconds = globalThis.performance?.now?.() ?? 0) {
        const config = RENDER_CONFIG.entities.deflectorBumper;
        const pulse = 1 + Math.sin(timeMilliseconds * config.pulseRadiansPerMillisecond) * config.pulseScale;
        const bounceAge = timeMilliseconds - (this.lastBounceTime ?? Number.NEGATIVE_INFINITY);
        const bounceFlash = bounceAge >= 0 && bounceAge < config.bounceFlashMilliseconds
            ? 1 - bounceAge / config.bounceFlashMilliseconds
            : 0;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = config.glowBlur;
        ctx.fillStyle = config.fill;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = config.rimWidth + bounceFlash * config.bounceFlashWidth;
        ctx.strokeStyle = this.color;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.globalAlpha *= config.innerAlpha;
        ctx.lineWidth = config.innerWidth;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * config.innerRadiusRatio * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha /= config.innerAlpha;

        ctx.fillStyle = this.color;
        for (let index = 0; index < config.notchCount; index++) {
            const angle = index * Math.PI * 2 / config.notchCount;
            const inner = this.radius * config.notchInnerRatio;
            const outer = this.radius * config.notchOuterRatio;
            const halfWidth = config.notchHalfWidthRadians;
            ctx.beginPath();
            ctx.arc(0, 0, outer, angle - halfWidth, angle + halfWidth);
            ctx.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
            ctx.closePath();
            ctx.fill();
        }
    }
}

class OneWayForceField extends GameObject {
    constructor(x, y, options = {}) {
        const defaults = LEVEL_DEFAULTS.oneWayForceField;
        super(x, y, options.width ?? defaults.width, options.height ?? defaults.height);
        this.rotation = options.rotation ?? defaults.rotation;
        this.restitution = options.restitution ?? defaults.restitution;
        this.color = options.color ?? defaults.color;
        this.playSound = options.playSound ?? defaults.playSound;
        this.renderOrder = RENDER_CONFIG.layers.forceField;
    }

    drawSprite(ctx, timeMilliseconds = globalThis.performance?.now?.() ?? 0) {
        const config = RENDER_CONFIG.entities.forceField;
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        const pulse = 0.8 + Math.sin(timeMilliseconds * config.pulseRadiansPerMillisecond) * 0.2;
        const reflectionAge = timeMilliseconds - (this.lastReflectionTime ?? Number.NEGATIVE_INFINITY);
        const flash = reflectionAge >= 0 && reflectionAge < config.reflectionFlashMilliseconds
            ? 1 - reflectionAge / config.reflectionFlashMilliseconds
            : 0;

        ctx.shadowColor = this.color;
        ctx.shadowBlur = config.glowBlur + flash * 10;
        ctx.globalAlpha *= config.fillAlpha + flash * 0.2;
        ctx.fillStyle = this.color;
        ctx.fillRect(-halfWidth, -halfHeight, this.width, this.height);
        ctx.globalAlpha /= config.fillAlpha + flash * 0.2;
        ctx.lineWidth = config.borderWidth + flash * 3;
        ctx.strokeStyle = this.color;
        ctx.strokeRect(-halfWidth, -halfHeight, this.width, this.height);

        ctx.globalAlpha *= config.coreAlpha * pulse;
        ctx.beginPath();
        ctx.moveTo(halfWidth, -halfHeight);
        ctx.lineTo(halfWidth, halfHeight);
        ctx.stroke();
        for (let y = -halfHeight + config.arrowSpacing / 2; y < halfHeight; y += config.arrowSpacing) {
            ctx.beginPath();
            ctx.moveTo(halfWidth + config.arrowSize, y);
            ctx.lineTo(halfWidth, y - config.arrowSize);
            ctx.lineTo(halfWidth, y + config.arrowSize);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha /= config.coreAlpha * pulse;
        ctx.shadowBlur = 0;
    }
}

// Penguin class moved to penguin.js

class PenguinOld extends GameObject {
    constructor(x, y) {
        super(x, y, 32, 32);
        this.velocity = { x: 0, y: 0 };
        this.state = PenguinState.IDLE;
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
        if (this.state === PenguinState.CRASHED) {
            this.crashedTimer++;
            if (this.crashedTimer >= this.crashedDuration) {
                this.state = PenguinState.IDLE;
                this.crashedTimer = 0;
            }
        }
        
        // Update rotation based on velocity
        if (this.state === PenguinState.SOARING || this.state === PenguinState.CRASHED) {
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
        if (newState === PenguinState.CRASHED) {
            this.crashedTimer = 0;
        }
    }
    
    reset() {
        this.velocity = { x: 0, y: 0 };
        this.state = PenguinState.IDLE;
        this.rotation = 0;
        this.trail = [];
        this.crashedTimer = 0;
    }
}

class Planet extends GameObject {
    constructor(x, y, radius, mass, gravitationalReach = 0, planetType = null, assetLoader = null, gameObjectLookup = null) {
        super(x, y, radius * 2, radius * 2);
        this.renderOrder = RENDER_CONFIG.layers.planet;
        this.radius = radius;
        this.mass = mass;
        this.gravitationalReach = gravitationalReach;
        this.collisionRadius = radius + LEVEL_DEFAULTS.planet.collisionPadding;
        this.collidable = true;
        this.color = this.getPlanetColor(mass);
        this.planetType = planetType;
        this.assetLoader = assetLoader;
        this.planetSprite = null;
        
        // Use consolidated orbit system
        this.orbitSystem = new OrbitSystem(gameObjectLookup);
        
        // Initialize sprite if asset loader and planet type are available
        if (this.assetLoader && this.planetType) {
            this.initializeSprite().catch(error => {
                plog.error('Failed to initialize planet sprite:', error);
            });
        }
    }
    
    getPlanetColor(mass) {
        // Color based on mass
        return colorForThreshold(
            mass,
            RENDER_CONFIG.entities.planetMassColors,
            RENDER_CONFIG.entities.planetFallbackColor
        );
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
    
    update(deltaTime, options = {}) {
        // Update orbiting using consolidated system
        if (options.updateOrbit !== false && this.orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
            // For gravity orbits, the orbit system modifies position based on physics
            // Don't override position - let gravity system update it naturally
            const newPosition = this.orbitSystem.update(deltaTime, this.position);
            this.position = newPosition;
        } else if (options.updateOrbit !== false) {
            // For other orbit types, use traditional position override
            const newPosition = this.orbitSystem.update(deltaTime, this.position);
            if (newPosition.x !== 0 || newPosition.y !== 0) {
                this.position = newPosition;
            }
        }
        
        // For gravity orbits, ensure we set up proper initial velocity if needed
        // DISABLED FOR DEBUGGING - using manual setup
        /*
        if (this.orbitSystem.orbitType === LevelOrbitType.GRAVITY && !this.orbitSystem._gravityInitialized) {
            const center = this.orbitSystem.getResolvedCenter();
            if (center) {
                this.orbitSystem.setStableCircularOrbit(
                    this.orbitSystem.orbitTargetId || center, 
                    Math.sqrt((this.position.x - center.x)**2 + (this.position.y - center.y)**2),
                    this.orbitSystem.gravityStrength,
                    this.position
                );
                this.orbitSystem._gravityInitialized = true;
            }
        }
        */
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
        if (this.gravitationalReach > 0 &&
            this.gravitationalReach < PHYSICS_CONFIG.defaultGravitationalReach) {
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
    constructor(x, y, value, assetLoader = null, gameObjectLookup = null) {
        super(x, y, LEVEL_DEFAULTS.bonus.width, LEVEL_DEFAULTS.bonus.height);
        this.renderOrder = RENDER_CONFIG.layers.bonus;
        this.value = value;
        this.collected = false;
        this.state = 'notHit'; // notHit, Hit (matching original)
        this.rotationSpeed = RENDER_CONFIG.entities.bonus.rotationSpeed;
        this.collectedRotationSpeed = RENDER_CONFIG.entities.bonus.collectedRotationSpeed;
        this.assetLoader = assetLoader;
        this.bonusSprite = null;
        this.bonusHitSprite = null;
        this.currentSprite = null;
        this.pulseTimer = 0;
        this.pulseSpeed = RENDER_CONFIG.entities.bonus.pulseSpeed;
        this.alpha = 1.0;
        
        // Use consolidated orbit system
        this.orbitSystem = new OrbitSystem(gameObjectLookup);
        
        // Reuse the startup-loaded sprites. Constructing a new level should
        // only create gameplay state, not start new image requests.
        if (this.assetLoader) {
            this.initializeSprites();
        }
    }

    initializeSprites() {
        this.bonusSprite = this.assetLoader.getGameSprite('bonus');
        this.bonusHitSprite = this.assetLoader.getGameSprite('bonus_hit');
        this.currentSprite = this.bonusSprite;
    }
    
    update(deltaTime, options = {}) {
        // Don't update if collected (bonus disappears)
        if (this.collected) {
            return;
        }
        
        // Update rotation speed (matching original behavior)
        if (this.rotationSpeed > RENDER_CONFIG.entities.bonus.rotationSpeed) {
            this.rotationSpeed -= RENDER_CONFIG.entities.bonus.rotationDecayPerLegacyFrame * deltaTime * SIMULATION_CONFIG.legacyPhysicsFps;
        } else {
            this.rotationSpeed = RENDER_CONFIG.entities.bonus.rotationSpeed;
        }
        
        // Apply rotation
        this.rotation += this.rotationSpeed * deltaTime;
        
        // Update orbiting using consolidated system
        if (options.updateOrbit !== false && this.orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
            // For gravity orbits, the orbit system modifies position based on physics
            // Don't override position - let gravity system update it naturally
            const newPosition = this.orbitSystem.update(deltaTime, this.position);
            this.position = newPosition;
        } else if (options.updateOrbit !== false) {
            // For other orbit types, use traditional position override
            const newPosition = this.orbitSystem.update(deltaTime, this.position);
            if (newPosition.x !== 0 || newPosition.y !== 0) {
                this.position = newPosition;
            }
        }
        
        // For gravity orbits, ensure we set up proper initial velocity if needed
        // DISABLED FOR DEBUGGING - using manual setup
        /*
        if (this.orbitSystem.orbitType === LevelOrbitType.GRAVITY && !this.orbitSystem._gravityInitialized) {
            const center = this.orbitSystem.getResolvedCenter();
            if (center) {
                this.orbitSystem.setStableCircularOrbit(
                    this.orbitSystem.orbitTargetId || center, 
                    Math.sqrt((this.position.x - center.x)**2 + (this.position.y - center.y)**2),
                    this.orbitSystem.gravityStrength,
                    this.position
                );
                this.orbitSystem._gravityInitialized = true;
            }
        }
        */
        
        // Pulse effect
        this.pulseTimer += deltaTime;
        const pulse = Math.sin(this.pulseTimer * this.pulseSpeed)
            * RENDER_CONFIG.entities.bonus.pulseAmplitude
            + RENDER_CONFIG.entities.bonus.pulseBaseAlpha;
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
            const spriteWidth = this.width * RENDER_CONFIG.entities.bonus.spriteScale;
            const spriteHeight = this.height * RENDER_CONFIG.entities.bonus.spriteScale;
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
        return colorForThreshold(
            value,
            RENDER_CONFIG.entities.bonusValueColors,
            RENDER_CONFIG.entities.bonusFallbackColor
        );
    }
    
    collect() {
        if (this.state === 'notHit') {
            // Switch to hit state (matching original behavior)
            this.state = 'Hit';
            this.collected = true;
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
            this.rotationSpeed = RENDER_CONFIG.entities.bonus.rotationSpeed;
            this.state = 'notHit';
            this.collected = false;
            
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
        this.renderOrder = RENDER_CONFIG.layers.popup;
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
        return colorForThreshold(
            value,
            RENDER_CONFIG.entities.bonusValueColors,
            RENDER_CONFIG.entities.bonusFallbackColor
        );
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
    
    update(deltaTime, options = {}) {
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
    constructor(
        x,
        y,
        width = LEVEL_DEFAULTS.target.width,
        height = LEVEL_DEFAULTS.target.height,
        spriteType = LEVEL_DEFAULTS.target.spriteType,
        assetLoader = null,
        gameObjectLookup = null
    ) {
        super(x, y, width, height);
        this.renderOrder = RENDER_CONFIG.layers.target;
        this.assetLoader = assetLoader;
        this.spriteType = spriteType; // Default sprite type
        this.shipState = 'open'; // open by default, closed when hit
        this.shipSprites = null;
        this.currentShipSprite = null;
        this.hitFrameCount = 0;
        this.hitDuration = RENDER_CONFIG.entities.targetHitFrames;
        this.isHit = false;
        
        // Use consolidated orbit system (matches Planet/Bonus behavior)
        this.orbitSystem = new OrbitSystem(gameObjectLookup);
        
        // Initialize ship sprite if asset loader is available
        if (this.assetLoader) {
            this.initializeShip();
        }
    }
    
    initializeShip() {
        try {
            this.shipSprites = {
                closed: this.assetLoader.getGameSprite('ship_closed'),
                open: this.assetLoader.getGameSprite('ship_open')
            };
            
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
    
    update(deltaTime, options = {}) {
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
        
        // Update orbiting using consolidated system (same pattern as Bonus/Planet)
        if (options.updateOrbit !== false && this.orbitSystem && this.orbitSystem.orbitType) {
            if (this.orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
                const newPosition = this.orbitSystem.update(deltaTime, this.position);
                this.position = newPosition;
            } else {
                const newPosition = this.orbitSystem.update(deltaTime, this.position);
                if (newPosition.x !== 0 || newPosition.y !== 0) {
                    this.position = newPosition;
                }
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
            
            // Scale the sprite to fit our target size. Keep the destination on
            // whole pixels and use nearest-neighbor sampling so the original
            // pixel art is not softened by fractional canvas scaling.
            const scaleX = this.width / sprite.width;
            const scaleY = this.height / sprite.height;
            const scale = Math.min(scaleX, scaleY);
            const drawWidth = Math.max(1, Math.round(sprite.width * scale));
            const drawHeight = Math.max(1, Math.round(sprite.height * scale));
            const drawX = Math.round(-drawWidth / 2);
            const drawY = Math.round(-drawHeight / 2);
            
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            
            ctx.drawImage(sprite, drawX, drawY, drawWidth, drawHeight);
            
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
        super(x, y, RENDER_CONFIG.entities.arrow.initialSize, RENDER_CONFIG.entities.arrow.initialSize);
        this.renderOrder = RENDER_CONFIG.layers.arrow;
        this.visible = false;
        this.color = RENDER_CONFIG.entities.arrow.color;
        this.glowColor = RENDER_CONFIG.entities.arrow.glowColor;
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
        ctx.shadowBlur = RENDER_CONFIG.entities.arrow.shadowBlur;
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = RENDER_CONFIG.entities.arrow.lineWidth;
        
        // Draw arrow body - tip should be at the edge, pointing toward penguin
        const arrowLength = this.width;
        const arrowWidth = RENDER_CONFIG.entities.arrow.shaftWidth;
        const headLength = RENDER_CONFIG.entities.arrow.headLength;
        const headWidth = RENDER_CONFIG.entities.arrow.headWidth;
        
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
    constructor(x, y, anchorX = null, anchorY = null, stretchLimit = LEVEL_DEFAULTS.slingshot.maxPullback) {
        super(x, y, RENDER_CONFIG.entities.slingshot.size, RENDER_CONFIG.entities.slingshot.size);
        this.renderOrder = RENDER_CONFIG.layers.slingshot;
        // Set position to anchor for consistency
        this.position = { x: anchorX !== null ? anchorX : x, y: anchorY !== null ? anchorY : y };
        this.anchor = this.position;
        this.resetPosition = { x, y };
        this.pullback = { x: 0, y: 0 }; // Offset from anchor
        this.maxPullback = stretchLimit; // pStretchLimit from Lingo (increased by 50% for finer control)
        this.minPullback = LEVEL_DEFAULTS.slingshot.minPullback;
        this.isPulling = false;
        // Colors matched from original game screenshot - glowing blue/cyan effect
        this.rubberBandColor = RENDER_CONFIG.entities.slingshot.rubberBandColor;
        this.hoopColor = RENDER_CONFIG.entities.slingshot.hoopColor;
        this.glowColor = RENDER_CONFIG.entities.slingshot.glowColor;
        this.hoopRadiusX = RENDER_CONFIG.entities.slingshot.hoopRadiusX;
        this.hoopRadiusY = RENDER_CONFIG.entities.slingshot.hoopRadiusY;
        this.penguin = null; // Reference to penguin object
        this.velocityMultiplier = LEVEL_DEFAULTS.slingshot.velocityMultiplier;
        this.launchModel = 'modern';
        this.sourceFrameRate = null;
        this.coordinateScale = 1;
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
        ctx.lineWidth = RENDER_CONFIG.entities.slingshot.lineWidth;
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
                        const scale = RENDER_CONFIG.entities.slingshot.spriteRegistrationScale;
                        
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
        ctx.shadowBlur = RENDER_CONFIG.entities.slingshot.shadowBlur;
        ctx.strokeStyle = this.rubberBandColor;
        ctx.lineWidth = RENDER_CONFIG.entities.slingshot.lineWidth;
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
        // Clamp only the maximum. Near-zero pulls must remain near zero so the
        // launch curve can provide precise, gentle shots.
        if (distance > this.maxPullback) distance = this.maxPullback;
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
        
        const distance = Math.sqrt(tempPoint.x * tempPoint.x + tempPoint.y * tempPoint.y);
        const tempAngle = Utils.rotationAngle(tempPoint);
        this.lastLaunch = { angle: tempAngle, power: distance };
        this.pullback = { x: 0, y: 0 };
        return calculateLaunchVelocity(tempAngle, distance, {
            velocityMultiplier: this.velocityMultiplier,
            maxPullback: this.maxPullback,
            minPullback: this.minPullback,
            launchModel: this.launchModel,
            sourceFrameRate: this.sourceFrameRate,
            coordinateScale: this.coordinateScale
        });
    }
    
    calculateNonLinearScale(normalizedDistance) {
        return calculateLaunchScale(normalizedDistance);
    }
}

class TextObject extends GameObject {
    constructor(x, y, content, options = {}) {
        const width = options.width ?? LEVEL_DEFAULTS.text.width;
        const height = options.height ?? LEVEL_DEFAULTS.text.height;
        super(x, y, width, height);
        this.renderOrder = options.renderOrder ?? LEVEL_DEFAULTS.text.renderOrder;
        this.content = content; // HTML content
        this.visible = options.visible !== undefined ? options.visible : true;
        
        // Text styling options (matching original HTML formatting)
        this.textAlign = options.textAlign ?? LEVEL_DEFAULTS.text.textAlign;
        this.fontSize = options.fontSize ?? LEVEL_DEFAULTS.text.fontSize;
        this.fontFamily = options.fontFamily ?? LEVEL_DEFAULTS.text.fontFamily;
        this.color = options.color ?? LEVEL_DEFAULTS.text.color;
        this.backgroundColor = options.backgroundColor ?? LEVEL_DEFAULTS.text.backgroundColor;
        this.borderRadius = options.borderRadius || 8;
        this.padding = options.padding ?? LEVEL_DEFAULTS.text.padding;
        this.maxWidth = options.maxWidth ?? Math.max(1, width - (this.padding * 2));
        
        // Auto-sizing based on content
        this.autoSize = options.autoSize ?? LEVEL_DEFAULTS.text.autoSize;
        
        // Animation properties
        this.fadeIn = options.fadeIn ?? LEVEL_DEFAULTS.text.fadeIn;
        this.fadeInDuration = options.fadeInDuration ?? LEVEL_DEFAULTS.text.fadeInDuration;
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
        
        // Preserve authored line breaks without treating source-file indentation as copy.
        const lineBreakToken = '\u0000LINE_BREAK\u0000';
        text = text.replace(/<br\s*\/?>/gi, lineBreakToken);
        
        // Remove all HTML tags
        text = text.replace(/<[^>]*>/g, '');
        
        // Convert HTML entities
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;|&apos;/g, "'");
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&#58;/g, ':');
        text = text
            .split(lineBreakToken)
            .map(line => line.replace(/\s+/g, ' ').trim())
            .join('\n');
        
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
        const lines = [];
        for (const paragraph of text.split('\n')) {
            const words = paragraph.split(' ').filter(Boolean);
            let currentLine = '';

            for (const word of words) {
                const testLine = currentLine + (currentLine ? ' ' : '') + word;
                if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
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
        super(x, y, RENDER_CONFIG.entities.pointingArrow.initialSize, RENDER_CONFIG.entities.pointingArrow.initialSize);
        this.renderOrder = options.renderOrder ?? LEVEL_DEFAULTS.pointingArrow.renderOrder;
        this.color = options.color ?? LEVEL_DEFAULTS.pointingArrow.color;
        this.glowColor = options.glowColor ?? LEVEL_DEFAULTS.pointingArrow.glowColor;
        this.pointingAt = null; // Target position to point at
        this.baseWidth = options.baseWidth ?? LEVEL_DEFAULTS.pointingArrow.baseWidth;
        this.scaleWithDistance = options.scaleWithDistance ?? LEVEL_DEFAULTS.pointingArrow.scaleWithDistance;
        this.maxDistance = options.maxDistance ?? LEVEL_DEFAULTS.pointingArrow.maxDistance;
        this.minWidth = options.minWidth ?? LEVEL_DEFAULTS.pointingArrow.minWidth;
        this.maxWidth = options.maxWidth ?? LEVEL_DEFAULTS.pointingArrow.maxWidth;
        
        // Pulsing animation
        this.pulseSpeed = options.pulseSpeed ?? LEVEL_DEFAULTS.pointingArrow.pulseSpeed;
        this.pulseTimer = 0;
        this.minAlpha = options.minAlpha ?? LEVEL_DEFAULTS.pointingArrow.minAlpha;
        this.maxAlpha = options.maxAlpha ?? LEVEL_DEFAULTS.pointingArrow.maxAlpha;
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
        ctx.shadowBlur = RENDER_CONFIG.entities.pointingArrow.shadowBlur;
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineWidth = RENDER_CONFIG.entities.pointingArrow.lineWidth;
        
        // Arrow dimensions
        const arrowLength = this.width;
        const arrowWidth = RENDER_CONFIG.entities.pointingArrow.shaftWidth;
        const headLength = RENDER_CONFIG.entities.pointingArrow.headLength;
        const headWidth = RENDER_CONFIG.entities.pointingArrow.headWidth;
        
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
export { GameObject, OrbitSystem, WaypointSystem, Planet, Bonus, BonusPopup, Target, Arrow, Slingshot, TextObject, PointingArrow, Portal, SpeedBooster, DeflectorBumper, OneWayForceField };
import { PenguinState } from '../penguinState.js';
