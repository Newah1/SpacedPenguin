// Level Loading System for Spaced Penguin
// Supports JSON-based level definitions with object factories and custom rules

import { Planet, Bonus, Target, Slingshot } from './gameObjects.js';
import { Penguin } from './penguin.js';
import { GRAVITATIONAL_CONSTANT } from './globalConstants.js';

class GameObjectFactory {
    static create(objectDefinition, assetLoader, game) {
        const { type, position, properties = {} } = objectDefinition;
        
        switch (type.toLowerCase()) {
            case 'planet':
                return this.createPlanet(position, properties, assetLoader);
            
            case 'bonus':
                return this.createBonus(position, properties, assetLoader);
            
            case 'target':
                return this.createTarget(position, properties, assetLoader);
            
            case 'slingshot':
                return this.createSlingshot(position, properties);
            
            case 'obstacle':
                return this.createObstacle(position, properties);
            
            default:
                console.warn(`Unknown object type: ${type}`);
                return null;
        }
    }
    
    static createPlanet(position, properties, assetLoader) {
        const {
            radius = 30,
            mass = 100,
            gravitationalReach = 5000,
            orbit = null,
            planetType = null
        } = properties;
        
        const planet = new Planet(position.x, position.y, radius, mass, gravitationalReach, planetType, assetLoader);
        
        // Apply orbital properties if specified
        if (orbit) {
            this.applyOrbitToObject(planet, orbit);
        }
        
        return planet;
    }
    
    static createBonus(position, properties, assetLoader) {
        const { value = 100 } = properties;
        
        const bonus = new Bonus(position.x, position.y, value, assetLoader);

        if (properties.orbit) {
            this.applyOrbitToObject(bonus, properties.orbit);
        }

        return bonus;
    }
    
    static createTarget(position, properties, assetLoader) {
        const { width = 60, height = 60 } = properties;
        return new Target(position.x, position.y, width, height, assetLoader);
    }
    
    static createSlingshot(position, properties) {
        const {
            anchorX = position.x,
            anchorY = position.y,
            stretchLimit = 100,
            velocityMultiplier = 15
        } = properties;
        
        const slingshot = new Slingshot(position.x, position.y, anchorX, anchorY, stretchLimit);
        slingshot.velocityMultiplier = velocityMultiplier;
        return slingshot;
    }
    
    static createObstacle(position, properties) {
        // Future extension point for obstacles
        const { width = 50, height = 50, type = 'static' } = properties;
        // Would return new Obstacle(position.x, position.y, width, height, type);
        console.warn('Obstacle type not yet implemented');
        return null;
    }
    
    static applyOrbitToObject(object, orbitConfig) {
        const center = orbitConfig.center || { x: 0, y: 0 };
        const speed = orbitConfig.speed || 0;
        
        switch (orbitConfig.type || 'circular') {
            case 'circular':
                object.setCircularOrbit(center, orbitConfig.radius || 0, speed);
                break;
                
            case 'elliptical':
                const semiMajorAxis = orbitConfig.semiMajorAxis || orbitConfig.radius || 100;
                const semiMinorAxis = orbitConfig.semiMinorAxis || semiMajorAxis * 0.7;
                const rotation = orbitConfig.rotation || 0;
                object.setEllipticalOrbit(center, semiMajorAxis, semiMinorAxis, speed, rotation);
                break;
                
            case 'figure8':
                const size = orbitConfig.size || orbitConfig.radius || 100;
                object.setFigure8Orbit(center, size, speed);
                break;
                
            case 'custom':
                if (orbitConfig.xFunction && orbitConfig.yFunction) {
                    // For custom orbits, we'd need to pass functions
                    // This is more complex and would require special handling
                    console.warn('Custom orbit functions not yet supported in JSON config');
                    object.setCircularOrbit(center, orbitConfig.radius || 100, speed);
                } else {
                    object.setCircularOrbit(center, orbitConfig.radius || 100, speed);
                }
                break;
                
            default:
                // Legacy support - treat as circular
                object.setCircularOrbit(center, orbitConfig.radius || 0, speed);
                break;
        }
    }
}

export class LevelRules {
    constructor(rulesDefinition = {}) {
        this.maxTries = rulesDefinition.maxTries || null;
        this.timeLimit = rulesDefinition.timeLimit || null;
        this.scoreMultiplier = rulesDefinition.scoreMultiplier || 1.0;
        this.gravitationalConstant = rulesDefinition.gravitationalConstant || GRAVITATIONAL_CONSTANT;
        this.customBehaviors = rulesDefinition.customBehaviors || [];
        this.requiredBonuses = rulesDefinition.requiredBonuses || null; // Number of bonuses required to complete
        this.allowedMisses = rulesDefinition.allowedMisses || null; // Max planet collisions allowed
    }
    
    applyToGame(game) {
        // Apply rules to the game instance
        if (this.gravitationalConstant !== GRAVITATIONAL_CONSTANT) {
            game.physics.gravitationalConstant = this.gravitationalConstant;
        }
        
        // Store rules for game logic to check
        game.levelRules = this;
    }
    
    checkVictoryConditions(game) {
        // Check custom victory conditions
        if (this.requiredBonuses !== null) {
            const collectedBonuses = game.bonuses.filter(b => b.state === 'Hit').length;
            if (collectedBonuses < this.requiredBonuses) {
                return { canProgress: false, reason: `Collect ${this.requiredBonuses - collectedBonuses} more bonuses!` };
            }
        }
        
        return { canProgress: true, reason: null };
    }
    
    checkFailureConditions(game) {
        // Check custom failure conditions
        if (this.maxTries !== null && game.tries >= this.maxTries) {
            return { failed: true, reason: 'Maximum attempts reached!' };
        }
        
        if (this.allowedMisses !== null && game.planetCollisions >= this.allowedMisses) {
            return { failed: true, reason: 'Too many planet collisions!' };
        }
        
        return { failed: false, reason: null };
    }
}

export class LevelLoader {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
        this.levels = new Map();
        this.loadDefaultLevels();
    }
    
    loadDefaultLevels() {
        // Load built-in level definitions
        this.levels.set(1, this.getLevel1Definition());
        this.levels.set(2, this.getLevel2Definition());
        this.levels.set(3, this.getLevel3Definition());
        
        // Try to load additional levels from JSON files
        this.tryLoadLevelFile(4, 'levels/level4.json');
        this.tryLoadLevelFile(5, 'levels/level5.json');
    }
    
    async tryLoadLevelFile(levelNumber, filePath) {
        try {
            const success = await this.loadLevelFromFile(levelNumber, filePath);
            if (success) {
                console.log(`Successfully loaded ${filePath} as level ${levelNumber}`);
            }
        } catch (error) {
            console.log(`Level file ${filePath} not found, using fallback generation`);
        }
    }
    
    async loadLevelFromFile(levelNumber, filePath) {
        try {
            const response = await fetch(filePath);
            const levelData = await response.json();
            this.levels.set(levelNumber, levelData);
            return true;
        } catch (error) {
            console.error(`Failed to load level ${levelNumber} from ${filePath}:`, error);
            return false;
        }
    }
    
    loadLevel(levelNumber, game) {
        const levelDefinition = this.levels.get(levelNumber);
        if (!levelDefinition) {
            console.warn(`Level ${levelNumber} not found, generating random level`);
            return this.generateRandomLevel(levelNumber, game);
        }
        
        console.log(`Loading level ${levelNumber}: ${levelDefinition.name}`);
        
        // Clear existing game state
        game.gameObjects = [];
        game.planets = [];
        game.bonuses = [];
        game.physics.clear();
        game.planetCollisions = 0; // Reset collision counter
        
        // Create penguin at start position
        const startPos = levelDefinition.startPosition || { x: 100, y: 300 };
        game.penguin = new Penguin(this.assetLoader);
        game.penguin.setPosition(startPos.x, startPos.y);
        game.gameObjects.push(game.penguin);
        
        // Create slingshot - look for slingshot object or use default
        const slingshotDef = levelDefinition.objects?.find(obj => obj.type === 'slingshot');
        if (slingshotDef) {
            game.slingshot = GameObjectFactory.create(slingshotDef, this.assetLoader, game);
        } else {
            game.slingshot = new Slingshot(startPos.x, startPos.y, startPos.x, startPos.y, 100);
        }
        game.slingshot.setPenguin(game.penguin);
        game.gameObjects.push(game.slingshot);
        
        // Create target - look for target object or use default
        const targetDef = levelDefinition.objects?.find(obj => obj.type === 'target');
        if (targetDef) {
            game.target = GameObjectFactory.create(targetDef, this.assetLoader, game);
        } else {
            const targetPos = levelDefinition.targetPosition || { x: 700, y: 300 };
            game.target = new Target(targetPos.x, targetPos.y, 60, 60, this.assetLoader);
        }
        game.gameObjects.push(game.target);
        
        // Create level objects
        if (levelDefinition.objects) {
            for (const objectDef of levelDefinition.objects) {
                if (objectDef.type === 'slingshot' || objectDef.type === 'target') {
                    continue; // Already handled above
                }
                
                const gameObject = GameObjectFactory.create(objectDef, this.assetLoader, game);
                if (gameObject) {
                    game.gameObjects.push(gameObject);
                    
                    // Add to appropriate collections
                    if (gameObject instanceof Planet) {
                        game.planets.push(gameObject);
                        game.physics.addPlanet(gameObject);
                    } else if (gameObject instanceof Bonus) {
                        game.bonuses.push(gameObject);
                        game.physics.addBonus(gameObject);
                    }
                }
            }
        }
        
        // Apply level rules
        const rules = new LevelRules(levelDefinition.rules);
        rules.applyToGame(game);
        
        // Reset game state
        game.tries = 0;
        game.distance = 0;
        game.state = 'playing';
        
        console.log(`Level ${levelNumber} loaded: ${game.planets.length} planets, ${game.bonuses.length} bonuses`);
        return levelDefinition;
    }
    
    generateRandomLevel(levelNumber, game) {
        console.log(`Generating random level ${levelNumber}`);
        
        const numPlanets = Math.min(levelNumber + 1, 5);
        const numBonuses = Math.min(levelNumber * 2, 8);
        
        const levelDefinition = {
            name: `Generated Level ${levelNumber}`,
            description: `Randomly generated level with ${numPlanets} planets and ${numBonuses} bonuses`,
            startPosition: { x: 100, y: 300 },
            targetPosition: { x: 700, y: 300 },
            objects: [],
            rules: {
                scoreMultiplier: 1.0 + (levelNumber - 1) * 0.1
            }
        };
        
        // Generate planets
        const planetTypes = ['planet_sun', 'planet_saturn', 'planet_grey', 'planet_pink', 'planet_red_gumball'];
        for (let i = 0; i < numPlanets; i++) {
            levelDefinition.objects.push({
                type: 'planet',
                position: {
                    x: Utils.random(200, 600),
                    y: Utils.random(100, 500)
                },
                properties: {
                    radius: Utils.random(20, 40),
                    mass: Utils.random(50, 200),
                    gravitationalReach: 5000,
                    planetType: planetTypes[i % planetTypes.length]
                }
            });
        }
        
        // Generate bonuses
        for (let i = 0; i < numBonuses; i++) {
            levelDefinition.objects.push({
                type: 'bonus',
                position: {
                    x: Utils.random(150, 650),
                    y: Utils.random(50, 550)
                },
                properties: {
                    value: Utils.randomInt(50, 500)
                }
            });
        }
        
        // Store and load the generated level
        this.levels.set(levelNumber, levelDefinition);
        return this.loadLevel(levelNumber, game);
    }
    
    getLevel1Definition() {
        return {
            name: "Tutorial: First Flight",
            description: "Learn to use the slingshot and avoid planets",
            startPosition: { x: 100, y: 300 },
            targetPosition: { x: 700, y: 300 },
            objects: [
                {
                    type: 'planet',
                    position: { x: 400, y: 200 },
                    properties: {
                        radius: 30,
                        mass: 300,
                        gravitationalReach: 5000,
                        planetType: 'planet_sun'
                    }
                },
                {
                    type: 'bonus',
                    position: { x: 300, y: 150 },
                    properties: { 
                        value: 100,
                        orbit: {
                            center: { x: 400, y: 200 },
                            radius: 100,
                            speed: 1.0
                        }
                    }
                },
                {
                    type: 'bonus',
                    position: { x: 500, y: 250 },
                    properties: { 
                        value: 200,
                        orbit: {
                            center: { x: 400, y: 200 },
                            radius: 100,
                            speed: -1
                        }
                    }
                }
            ],
            rules: {
                maxTries: null,
                timeLimit: null,
                scoreMultiplier: 1.0,
                requiredBonuses: null
            }
        };
    }
    
    getLevel2Definition() {
        return {
            name: "Double Trouble",
            description: "Navigate between two planets",
            startPosition: { x: 100, y: 300 },
            targetPosition: { x: 700, y: 300 },
            objects: [
                {
                    type: 'planet',
                    position: { x: 300, y: 200 },
                    properties: {
                        radius: 25,
                        mass: 150,
                        planetType: 'planet_grey'
                    }
                },
                {
                    type: 'planet',
                    position: { x: 500, y: 400 },
                    properties: {
                        radius: 35,
                        mass: 150,
                        planetType: 'planet_saturn'
                    }
                },
                {
                    type: 'bonus',
                    position: { x: 250, y: 150 },
                    properties: { value: 150 }
                },
                {
                    type: 'bonus',
                    position: { x: 450, y: 250 },
                    properties: { value: 250 }
                },
                {
                    type: 'bonus',
                    position: { x: 550, y: 350 },
                    properties: { value: 300 }
                }
            ],
            rules: {
                scoreMultiplier: 1.2,
                requiredBonuses: 2
            }
        };
    }
    
    getLevel3Definition() {
        return {
            name: "Orbital Challenge",
            description: "Master gravitational slingshots with orbiting planets",
            startPosition: { x: 100, y: 300 },
            targetPosition: { x: 700, y: 300 },
            objects: [
                {
                    type: 'planet',
                    position: { x: 350, y: 250 },
                    properties: {
                        radius: 40,
                        mass: 200,
                        planetType: 'planet_red_gumball'
                    }
                },
                {
                    type: 'planet',
                    position: { x: 450, y: 250 },
                    properties: {
                        radius: 20,
                        mass: 60,
                        planetType: 'planet_pink',
                        orbit: {
                            center: { x: 350, y: 250 },
                            radius: 100,
                            speed: 1.0
                        }
                    }
                },
                {
                    type: 'bonus',
                    position: { x: 350, y: 180 },
                    properties: { value: 200 }
                },
                {
                    type: 'bonus',
                    position: { x: 420, y: 250 },
                    properties: { value: 300 }
                },
                {
                    type: 'bonus',
                    position: { x: 350, y: 320 },
                    properties: { value: 400 }
                }
            ],
            rules: {
                maxTries: null,
                scoreMultiplier: 1.5,
                requiredBonuses: 3,
                gravitationalConstant: GRAVITATIONAL_CONSTANT * 1.2
            }
        };
    }
} 