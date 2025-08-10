// Physics system for Spaced Penguin
// Based on the original GPS (Gravity Physics System) script

import Utils from './utils.js';
import { GRAVITATIONAL_CONSTANT } from './globalConstants.js';

export class Physics {
    constructor() {
        this.gravitationalConstant = GRAVITATIONAL_CONSTANT;
        this.planets = [];
        this.bonuses = [];
        this.traceEnabled = true;
        this.traceColor = '#00FFFF';
        this.tracePoints = [];
    }
    
    // Add a planet to the physics system
    addPlanet(planet) {
        this.planets.push({
            sprite: planet,
            mass: planet.mass,
            collisionRadius: planet.radius + 8,
            gravitationalReach: planet.gravitationalReach || 5000
        });
    }
    
    // Remove a planet from the physics system
    removePlanet(planet) {
        this.planets = this.planets.filter(p => p.sprite !== planet);
    }
    
    // Add a bonus item to the physics system
    addBonus(bonus) {
        this.bonuses.push({
            sprite: bonus,
            collected: false
        });
    }
    
    // Clear all planets and bonuses
    clear() {
        this.planets = [];
        this.bonuses = [];
        this.tracePoints = [];
    }
    
    // Calculate gravitational force from all planets on a point (optimized)
    calculateGravitationalForce(position, velocity) {
        let totalForceX = 0;
        let totalForceY = 0;
        
        const planetCount = this.planets.length;
        for (let i = 0; i < planetCount; i++) {
            const planet = this.planets[i];
            const dx = planet.sprite.position.x - position.x;
            const dy = planet.sprite.position.y - position.y;
            
            // Use squared distance to avoid sqrt until needed
            const distSquared = dx * dx + dy * dy;
            const distance = Math.sqrt(distSquared);
            
            // Check if within gravitational reach (early exit)
            if (distance >= planet.gravitationalReach) continue;
            
            // Check collision first (most critical)
            if (distance < planet.collisionRadius) {
                return { collision: true, planet: planet };
            }
            
            // Calculate gravitational force using already computed distSquared
            if (distSquared > 0) {
                const gravitationalForce = planet.mass * this.gravitationalConstant / distSquared;
                totalForceX += gravitationalForce * dx;
                totalForceY += gravitationalForce * dy;
            }
        }
        
        return {
            collision: false,
            force: { x: totalForceX, y: totalForceY }
        };
    }
    
    // Update velocity based on gravitational forces
    updateVelocity(position, velocity, deltaTime) {
        const result = this.calculateGravitationalForce(position, velocity);
        
        if (result.collision) {
            // Handle collision with planet
            return this.handlePlanetCollision(position, velocity, result.planet);
        }
        
        // Apply gravitational force to velocity
        const newVelocity = {
            x: velocity.x + result.force.x * deltaTime,
            y: velocity.y + result.force.y * deltaTime
        };
        
        return { velocity: newVelocity, collision: false };
    }
    
    // Handle collision with a planet
    handlePlanetCollision(position, velocity, planet) {
        // Calculate bounce direction
        const angle = Utils.rotationAngle({
            x: position.x - planet.sprite.position.x,
            y: position.y - planet.sprite.position.y
        });
        
        // Reflect velocity based on collision angle
        const velocityMagnitude = Utils.vectorMagnitude(velocity);
        const bounceAngle = angle + 180; // Reflect the angle
        
        const newVelocity = Utils.findPoint(
            { x: 0, y: 0 },
            bounceAngle,
            velocityMagnitude * 0.8 // Reduce velocity on bounce
        );
        
        return { velocity: newVelocity, collision: true, planet: planet };
    }
    
    // Check for bonus collection
    checkBonusCollection(position) {
        let collectedBonuses = [];
        
        for (const bonus of this.bonuses) {
            // Check if bonus is in notHit state (not yet collected)
            if (bonus.sprite.state === 'notHit') {
                const distance = Utils.distance(position, bonus.sprite.position);
                const collectionRadius = 8 + (bonus.sprite.width / 2);
                
                if (distance < collectionRadius) {
                    collectedBonuses.push(bonus.sprite); // Return the actual Bonus object
                }
            }
        }
        
        return collectedBonuses;
    }
    
    // Update physics for a moving object
    updatePhysics(object, deltaTime) {
        // Update position based on velocity
        const newPosition = {
            x: object.position.x + object.velocity.x * deltaTime,
            y: object.position.y + object.velocity.y * deltaTime
        };
        
        // Update velocity based on gravitational forces
        const velocityResult = this.updateVelocity(object.position, object.velocity, deltaTime);
        
        // Update trace if enabled
        if (this.traceEnabled) {
            this.addTracePoint(object.position);
        }
        
        return {
            position: newPosition,
            velocity: velocityResult.velocity,
            collision: velocityResult.collision,
            planet: velocityResult.planet
        };
    }
    
    // Add point to trace
    addTracePoint(point) {
        this.tracePoints.push({ x: point.x, y: point.y, time: Date.now() });
        
        // Limit trace points to prevent memory issues
        if (this.tracePoints.length > 1000) {
            this.tracePoints.shift();
        }
    }
    
    // Clear trace
    clearTrace() {
        this.tracePoints = [];
    }
    
    // Draw trace on canvas
    drawTrace(ctx) {
        if (!this.traceEnabled || this.tracePoints.length < 2) return;
        
        ctx.strokeStyle = this.traceColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7;
        
        ctx.beginPath();
        ctx.moveTo(this.tracePoints[0].x, this.tracePoints[0].y);
        
        for (let i = 1; i < this.tracePoints.length; i++) {
            ctx.lineTo(this.tracePoints[i].x, this.tracePoints[i].y);
        }
        
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
    
    // Check if position is within game bounds
    isInBounds(position, bounds) {
        return Utils.inside(position, bounds);
    }
    
    // Calculate distance traveled
    calculateDistanceTraveled(positions) {
        let totalDistance = 0;
        
        for (let i = 1; i < positions.length; i++) {
            totalDistance += Utils.distance(positions[i-1], positions[i]);
        }
        
        return totalDistance;
    }
    
    // Set gravitational constant
    setGravitationalConstant(constant) {
        this.gravitationalConstant = constant;
    }
    
    // Enable/disable trace
    setTraceEnabled(enabled) {
        this.traceEnabled = enabled;
        if (!enabled) {
            this.clearTrace();
        }
    }
    
    // Set trace color
    setTraceColor(color) {
        this.traceColor = color;
    }
    
    // Get all planets
    getPlanets() {
        return this.planets;
    }
    
    // Get all bonuses
    getBonuses() {
        return this.bonuses;
    }
    
    // Get trace points
    getTracePoints() {
        return this.tracePoints;
    }
} 