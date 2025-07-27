// Headless Game Engine for Node.js Testing
// Reuses existing game logic without browser dependencies

import { MockCanvas, MockAudioManager, mockLogger } from './nodeShims.js';

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

// Constants
const GRAVITATIONAL_CONSTANT = 3.0;

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
            collisionRadius: planet.radius + 8,
            gravitationalReach: planet.gravitationalReach || 5000
        });
    }
    
    updatePenguinPhysics(penguin, deltaTime) {
        if (!penguin || penguin.state !== 'soaring') return;

        // Update orbiting planets first
        this.updateOrbitingPlanets(deltaTime);

        // Apply gravitational forces from all planets (matching real game physics)
        for (const planetData of this.planets) {
            const planet = planetData.sprite;
            const changeLoc = { x: planet.x - penguin.x, y: planet.y - penguin.y };
            const distanceSquared = changeLoc.x * changeLoc.x + changeLoc.y * changeLoc.y;
            
            if (distanceSquared === 0) continue;

            const distance = Math.sqrt(distanceSquared);
            
            // Check if within gravitational reach
            if (planetData.gravitationalReach > 0 && distance > planetData.gravitationalReach) {
                continue;
            }

            // Calculate gravitational force (matching real game: mass * constant / distance^2)
            const gravitationalForce = (planetData.mass * this.gravitationalConstant) / distanceSquared;
            
            // Apply force to velocity (NO deltaTime multiplication here, like real game)
            penguin.velocity.x += gravitationalForce * changeLoc.x;
            penguin.velocity.y += gravitationalForce * changeLoc.y;
        }

        // Update position (WITH deltaTime multiplication, like real game)
        penguin.x += penguin.velocity.x * deltaTime;
        penguin.y += penguin.velocity.y * deltaTime;
    }
    
    updateOrbitingPlanets(deltaTime) {
        for (const planetData of this.planets) {
            const planet = planetData.sprite;
            if (planet.orbit) {
                // Update orbit time
                planet.orbitTime += deltaTime * planet.orbit.speed;
                
                // Calculate new position based on circular orbit
                const angle = planet.orbitTime;
                planet.x = planet.orbit.center.x + Math.cos(angle) * planet.orbit.radius;
                planet.y = planet.orbit.center.y + Math.sin(angle) * planet.orbit.radius;
            }
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

        // Use rectangular collision detection like real game (80x80 target)
        const targetRect = {
            x: target.x - (target.width || 80) / 2,
            y: target.y - (target.height || 80) / 2,
            width: target.width || 80,
            height: target.height || 80
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
    
    launch(angle, power, velocityMultiplier = 15) {
        // Convert angle/power to velocity (from original slingshot logic)
        const radians = (angle * Math.PI) / 180;
        const speed = power * velocityMultiplier / 100; // Scale like real game
        
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
        this.physics.clear();
        this.level = levelData;
        
        // Parse objects array from level JSON
        if (levelData.objects) {
            for (const obj of levelData.objects) {
                switch (obj.type) {
                    case 'planet':
                        const planet = {
                            x: obj.position.x,
                            y: obj.position.y,
                            mass: obj.properties.mass || 100,
                            radius: obj.properties.radius || 30,
                            gravitationalReach: obj.properties.gravitationalReach || 5000,
                            orbit: obj.properties.orbit || null,
                            orbitTime: 0  // Track orbit position
                        };
                        this.physics.addPlanet(planet);
                        break;
                        
                    case 'target':
                        this.target = {
                            x: obj.position.x,
                            y: obj.position.y,
                            width: obj.properties.width || 80,
                            height: obj.properties.height || 80
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
        }
        
        // Fallback: older level format support
        if (levelData.planets) {
            for (const planetData of levelData.planets) {
                const planet = {
                    x: planetData.position[0],
                    y: planetData.position[1],
                    mass: planetData.mass || 100,
                    radius: planetData.radius || 30,
                    gravitationalReach: planetData.gravityReach || 5000
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
        
        // Launch penguin
        const velocityMultiplier = this.slingshot?.velocityMultiplier || 15;
        this.penguin.launch(angle, power, velocityMultiplier);
        
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
    findWorkingTrajectories(angleRange = [0, 360], powerRange = [10, 300], samples = 100) {
        const results = [];
        const angleStep = (angleRange[1] - angleRange[0]) / Math.sqrt(samples / 1024); // Increased step size for faster testing
        const powerStep = (powerRange[1] - powerRange[0]) / Math.sqrt(samples / 2);
        
        this.logger.info(`Testing ${samples} trajectory combinations...`);
        
        let tested = 0;
        let successful = 0;
        
        for (let angle = angleRange[0]; angle < angleRange[1]; angle += angleStep) {
            for (let power = powerRange[0]; power < powerRange[1]; power += powerStep) {
                const result = this.simulateTrajectory(angle, power);
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