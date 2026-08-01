// Headless Game Engine for Node.js Testing
// Reuses existing game logic without browser dependencies

import { MockCanvas, MockAudioManager, mockLogger } from './nodeShims.js';
import { GRAVITATIONAL_CONSTANT } from './constants.js';
import { integratePlanetGravity } from '../js/simulation.js';
import { assertValidLevelDefinition } from '../js/levelValidation.js';

// Create minimal implementations of browser modules for Node.js
const NodeUtils = {
    distance: (p1, p2) => {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    },
    inside: (point, rect) => {
        return point.x >= rect.x && 
               point.x <= rect.x + rect.width && 
               point.y >= rect.y && 
               point.y <= rect.y + rect.height;
    },
    circlesIntersect: (center1, radius1, center2, radius2) => {
        const dx = center2.x - center1.x;
        const dy = center2.y - center1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= radius1 + radius2;
    },
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    validateLevel: (level, maxLevel = 25) => {
        const parsed = parseInt(level);
        if (isNaN(parsed) || parsed < 1 || parsed > maxLevel) {
            return null;
        }
        return parsed;
    }
};

// Minimal Physics class for Node.js
class HeadlessPhysics {
    constructor() {
        this.gravitationalConstant = GRAVITATIONAL_CONSTANT;
        this.planets = [];
        this.bonuses = [];
    }
    
    clear() {
        this.planets = [];
        this.bonuses = [];
    }
    
    addPlanet(planet) {
        this.planets.push({
            sprite: planet,
            mass: planet.mass,
            collisionRadius: planet.collisionRadius ?? planet.radius + 8,
            gravitationalReach: planet.gravitationalReach ?? 5000
        });
    }
    
    updatePenguinPhysics(penguin, deltaTime) {
        if (!penguin || penguin.state !== 'soaring') return;

        // Update orbiting planets first
        this.updateOrbitingPlanets(deltaTime);

        const planets = this.planets.map(planetData => ({
            x: planetData.sprite.x,
            y: planetData.sprite.y,
            mass: planetData.mass,
            gravitationalReach: planetData.gravitationalReach
        }));
        const result = integratePlanetGravity(
            { x: penguin.x, y: penguin.y },
            penguin.velocity,
            planets,
            this.gravitationalConstant,
            deltaTime
        );

        penguin.x = result.position.x;
        penguin.y = result.position.y;
        penguin.velocity = result.velocity;
    }
    
    updateOrbitingPlanets(deltaTime) {
        for (const planetData of this.planets) {
            const planet = planetData.sprite;
            if (planet.orbit?.center && planet.orbit.radius > 0 && planet.orbit.speed !== 0) {
                // Update orbit time
                planet.orbitTime += deltaTime * planet.orbit.speed;
                
                // Calculate new position based on circular orbit
                const angle = planet.orbitTime;
                planet.x = planet.orbit.center.x + Math.cos(angle) * planet.orbit.radius;
                planet.y = planet.orbit.center.y + Math.sin(angle) * planet.orbit.radius;
            }
        }
    }

    resetOrbitingPlanets() {
        for (const planetData of this.planets) {
            const planet = planetData.sprite;
            planet.x = planet.initialX;
            planet.y = planet.initialY;
            planet.orbitTime = planet.initialOrbitTime;
        }
    }
    
    checkCollisions(penguin) {
        if (!penguin) return null;

        // Check planet collisions
        for (const planetData of this.planets) {
            const planet = planetData.sprite;
            const distance = NodeUtils.distance(
                {x: penguin.x, y: penguin.y}, 
                {x: planet.x, y: planet.y}
            );

            if (distance <= planetData.collisionRadius) {
                return {
                    type: 'planet',
                    object: planet,
                    distance: distance
                };
            }
        }

        return null;
    }
    
    checkTargetCollision(penguin, target) {
        if (!penguin || !target) return false;

        // Use rectangular collision detection like the production target.
        const targetRect = {
            x: target.x - (target.width || 60) / 2,
            y: target.y - (target.height || 60) / 2,
            width: target.width || 60,
            height: target.height || 60
        };

        return NodeUtils.inside(
            {x: penguin.x, y: penguin.y}, 
            targetRect
        );
    }
    
    checkBounds(penguin, bounds) {
        if (!penguin) return false;
        
        return (
            penguin.x < bounds.left ||
            penguin.x > bounds.right ||
            penguin.y < bounds.top ||
            penguin.y > bounds.bottom
        );
    }
}

// Minimal Penguin class for Node.js
class HeadlessPenguin {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.velocity = { x: 0, y: 0 };
        this.state = 'idle';
        this.radius = 8; // From original game
    }
    
    launch(angle, power, slingshot = {}) {
        // Match Slingshot.release(): power is pullback distance in pixels.
        const velocityMultiplier = slingshot.velocityMultiplier ?? 15;
        const maxPullback = slingshot.maxPullback ?? slingshot.stretchLimit ?? 100;
        const minPullback = slingshot.minPullback ?? 10;
        const pullback = NodeUtils.clamp(power, minPullback, maxPullback);
        const normalizedDistance = pullback / maxPullback;
        let nonLinearScale;
        if (normalizedDistance <= 0.3) {
            nonLinearScale = 0.5 + (normalizedDistance / 0.3) * 0.5;
        } else if (normalizedDistance <= 0.7) {
            nonLinearScale = 1 + ((normalizedDistance - 0.3) / 0.4) * 0.5;
        } else {
            nonLinearScale = 1.5 + Math.pow((normalizedDistance - 0.7) / 0.3, 1.5) * 0.5;
        }

        const radians = (angle * Math.PI) / 180;
        const scaledPullback = pullback * nonLinearScale;
        const speed = (scaledPullback * scaledPullback / 250) * velocityMultiplier;
        
        this.velocity.x = Math.cos(radians) * speed;
        this.velocity.y = Math.sin(radians) * speed;
        this.state = 'soaring';
    }
    
    crash() {
        this.state = 'crashed';
        this.velocity.x = 0;
        this.velocity.y = 0;
    }
    
    hitTarget() {
        this.state = 'hitTarget';
        this.velocity.x = 0;
        this.velocity.y = 0;
    }
}

// Main headless game simulation
export class HeadlessGameEngine {
    constructor() {
        this.physics = new HeadlessPhysics();
        this.penguin = null;
        this.target = null;
        this.level = null;
        this.slingshot = null;
        this.bounds = {
            left: -400,
            right: 1200,
            top: -400,
            bottom: 1000
        };
        
        // Simulation settings
        this.maxSimulationTime = 30; // seconds
        this.timeStep = 1/60; // 60 FPS equivalent
        this.logger = mockLogger;
    }
    
    getStartPosition() {
        // Find slingshot position from level data
        if (this.level && this.level.objects) {
            const slingshot = this.level.objects.find(obj => obj.type === 'slingshot');
            if (slingshot) {
                return { x: slingshot.position.x, y: slingshot.position.y };
            }
        }
        
        // Fallback to startPosition or default
        if (this.level && this.level.startPosition) {
            return { x: this.level.startPosition.x, y: this.level.startPosition.y };
        }
        
        return { x: 100, y: 300 }; // Default position
    }
    
    loadLevel(levelData) {
        assertValidLevelDefinition(levelData, 'headless level');
        this.physics.clear();
        this.physics.gravitationalConstant = levelData.rules?.gravitationalConstant ?? GRAVITATIONAL_CONSTANT;
        this.level = levelData;
        this.penguin = null;
        this.target = null;
        this.slingshot = null;
        const objectsById = new Map();
        const pendingOrbits = [];
        
        // Parse objects array from level JSON
        if (levelData.objects) {
            for (const obj of levelData.objects) {
                switch (obj.type) {
                    case 'planet':
                        const properties = obj.properties || {};
                        const planet = {
                            x: obj.position.x,
                            y: obj.position.y,
                            initialX: obj.position.x,
                            initialY: obj.position.y,
                            mass: properties.mass ?? 100,
                            radius: properties.radius ?? 30,
                            collisionRadius: properties.collisionRadius,
                            gravitationalReach: properties.gravitationalReach ?? 5000,
                            orbit: null,
                            orbitTime: 0,
                            initialOrbitTime: 0
                        };
                        this.physics.addPlanet(planet);
                        if (properties.id) objectsById.set(properties.id, planet);
                        if (properties.orbit) pendingOrbits.push({ planet, config: properties.orbit });
                        break;
                        
                    case 'target':
                        this.target = {
                            x: obj.position.x,
                            y: obj.position.y,
                            width: obj.properties.width || 60,
                            height: obj.properties.height || 60
                        };
                        break;
                        
                    case 'slingshot':
                        this.slingshot = obj.properties;
                        this.penguin = new HeadlessPenguin(
                            obj.position.x,
                            obj.position.y
                        );
                        break;
                }
            }

            // Current levels can orbit an object by ID; older levels embed a center.
            // Resolve after every planet has been created so declaration order is irrelevant.
            for (const { planet, config } of pendingOrbits) {
                const targetId = config.orbitTargetId ?? config.targetId ?? null;
                const center = targetId
                    ? objectsById.get(targetId)
                    : (config.orbitCenter ?? config.center ?? null);
                const radius = config.orbitRadius ?? config.radius ?? 0;
                const speed = config.orbitSpeed ?? config.speed ?? 0;
                const angle = config.orbitAngle ?? config.angle ?? 0;

                if (center && radius > 0 && speed !== 0) {
                    planet.orbit = { center, radius, speed };
                    planet.orbitTime = angle;
                    planet.initialOrbitTime = angle;
                }
            }
        }
        
        // Fallback: older level format support
        if (levelData.planets) {
            for (const planetData of levelData.planets) {
                const planet = {
                    x: planetData.position[0],
                    y: planetData.position[1],
                    initialX: planetData.position[0],
                    initialY: planetData.position[1],
                    mass: planetData.mass ?? 100,
                    radius: planetData.radius ?? 30,
                    gravitationalReach: planetData.gravityReach ?? 5000,
                    orbitTime: 0,
                    initialOrbitTime: 0
                };
                this.physics.addPlanet(planet);
            }
        }
        
        if (levelData.target) {
            this.target = {
                x: levelData.target.position[0],
                y: levelData.target.position[1],
                radius: 25
            };
        }
        
        if (levelData.slingshot) {
            this.penguin = new HeadlessPenguin(
                levelData.slingshot.position[0],
                levelData.slingshot.position[1]
            );
        }
        
        return true;
    }
    
    // Simulate a single trajectory attempt
    simulateTrajectory(angle, power, maxTime = null) {
        if (!this.penguin || !this.target) {
            throw new Error('Level not loaded properly');
        }
        
        // Reset penguin to start position
        const startPos = this.getStartPosition();
        this.penguin.x = startPos.x;
        this.penguin.y = startPos.y;
        this.penguin.velocity = { x: 0, y: 0 };
        this.physics.resetOrbitingPlanets();
        
        // Launch penguin
        this.penguin.launch(angle, power, this.slingshot);
        
        const simulationTime = maxTime || this.maxSimulationTime;
        const maxSteps = Math.floor(simulationTime / this.timeStep);
        
        const result = {
            success: false,
            reason: 'timeout',
            steps: 0,
            finalPosition: { x: this.penguin.x, y: this.penguin.y },
            trajectory: [],
            distance: 0
        };
        
        // Simulation loop
        for (let step = 0; step < maxSteps; step++) {
            result.steps = step;
            
            // Store trajectory point
            if (step % 10 === 0) { // Store every 10th point to save memory
                result.trajectory.push({
                    x: this.penguin.x,
                    y: this.penguin.y,
                    velocity: { ...this.penguin.velocity },
                    time: step * this.timeStep
                });
            }
            
            // Update physics
            this.physics.updatePenguinPhysics(this.penguin, this.timeStep);
            
            
            // Check target collision
            if (this.physics.checkTargetCollision(this.penguin, this.target)) {
                result.success = true;
                result.reason = 'target_hit';
                result.finalPosition = { x: this.penguin.x, y: this.penguin.y };
                const startPos = this.getStartPosition();
                result.distance = NodeUtils.distance(
                    startPos,
                    { x: this.penguin.x, y: this.penguin.y }
                );
                this.penguin.hitTarget();
                break;
            }
            
            // Check planet collisions
            const collision = this.physics.checkCollisions(this.penguin);
            if (collision) {
                result.success = false;
                result.reason = 'planet_collision';
                result.finalPosition = { x: this.penguin.x, y: this.penguin.y };
                this.penguin.crash();
                break;
            }
            
            // Check bounds
            if (this.physics.checkBounds(this.penguin, this.bounds)) {
                result.success = false;
                result.reason = 'out_of_bounds';
                result.finalPosition = { x: this.penguin.x, y: this.penguin.y };
                break;
            }
            
            // Update final position
            result.finalPosition = { x: this.penguin.x, y: this.penguin.y };
        }
        
        return result;
    }
    
    // Test multiple trajectories to find successful ones
    findWorkingTrajectories(angleRange = [0, 360], powerRange = [10, 100], samples = 100, maxTime = null) {
        const results = [];
        const normalizedSamples = Math.max(1, Math.floor(samples));
        const gridSize = Math.ceil(Math.sqrt(normalizedSamples));
        
        this.logger.info(`Testing ${normalizedSamples} trajectory combinations...`);
        
        let tested = 0;
        let successful = 0;
        
        for (let angleIndex = 0; angleIndex < gridSize && tested < normalizedSamples; angleIndex++) {
            const angleFraction = gridSize === 1 ? 0.5 : angleIndex / (gridSize - 1);
            const angle = angleRange[0] + (angleRange[1] - angleRange[0]) * angleFraction;

            for (let powerIndex = 0; powerIndex < gridSize && tested < normalizedSamples; powerIndex++) {
                const powerFraction = gridSize === 1 ? 0.5 : powerIndex / (gridSize - 1);
                const power = powerRange[0] + (powerRange[1] - powerRange[0]) * powerFraction;
                const result = this.simulateTrajectory(angle, power, maxTime);
                tested++;
                
                if (result.success) {
                    successful++;
                    results.push({
                        angle,
                        power,
                        ...result
                    });
                }
                
                // Progress feedback
                if (tested % 10 === 0) {
                    this.logger.info(`Tested ${tested} trajectories, found ${successful} successful. ${angle} ${power}`);
                }
            }
        }
        
        this.logger.info(`Testing complete: ${successful}/${tested} successful trajectories`);
        return results;
    }
}

export { HeadlessPhysics, HeadlessPenguin, NodeUtils };
