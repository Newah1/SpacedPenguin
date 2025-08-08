// Level Loading System for Spaced Penguin
// Supports JSON-based level definitions with object factories and custom rules

import { Planet, Bonus, Target, Slingshot, TextObject, PointingArrow } from './gameObjects.js';
import { Penguin } from './penguin.js';
import { GRAVITATIONAL_CONSTANT } from './globalConstants.js';
import plog from './penguinLogger.js';
import Utils from './utils.js';
import { GameState } from './game.js';

class GameObjectFactory {
    static create(objectDefinition, assetLoader, game) {
        let { type, position, properties = {} } = objectDefinition;
        
        // If position is not at top level, check if it's in properties
        if (!position && properties.x !== undefined && properties.y !== undefined) {
            position = { x: properties.x, y: properties.y };
        }
        
        // Debug logging for problematic objects
        if (!position && (type === 'bonus' || type === 'planet' || type === 'target')) {
            console.error('Object creation failed: missing position', { 
                type, 
                position, 
                properties,
                objectDefinition 
            });
            return null;
        }
        
        switch (type.toLowerCase()) {
            case 'planet':
                return this.createPlanet(position, properties, assetLoader);
            
            case 'bonus':
                return this.createBonus(position, properties, assetLoader);
            
            case 'target':
                return this.createTarget(position, properties, assetLoader);
            
            case 'slingshot':
                return this.createSlingshot(position, properties);
            
            case 'text':
            case 'textobject':
                return this.createTextObject(position, properties);
            
            case 'arrow':
            case 'pointingarrow':
                return this.createPointingArrow(position, properties);
            
            case 'obstacle':
                return this.createObstacle(position, properties);
            
            default:
                plog.warn(`Unknown object type: ${type}`);
                return null;
        }
    }
    
    static createPlanet(position, properties, assetLoader) {
        if (!position) {
            console.error('Planet creation failed: position is undefined', { position, properties });
            return null;
        }
        
        const {
            name = null,
            radius = 30,
            mass = 100,
            gravitationalReach = 5000,
            orbit = null,
            planetType = null
        } = properties;
        
        const planet = new Planet(position.x, position.y, radius, mass, gravitationalReach, planetType, assetLoader);
        
        // Set name if provided
        if (name) {
            planet.name = name;
        }
        
        // Apply orbital properties if specified (check both old location and new properties location)
        if (orbit) {
            this.applyOrbitToObject(planet, orbit);
        } else if (properties.orbit) {
            this.applyOrbitToObject(planet, properties.orbit);
        }
        
        return planet;
    }
    
    static createBonus(position, properties, assetLoader) {
        const { name = null, value = 100 } = properties;
        
        // Check if position is defined
        if (!position) {
            console.error('Bonus creation failed: position is undefined', { position, properties });
            return null;
        }
        
        // Ensure position has x and y properties
        if (typeof position.x === 'undefined' || typeof position.y === 'undefined') {
            console.error('Bonus creation failed: position missing x or y', { position, properties });
            return null;
        }
        
        const bonus = new Bonus(position.x, position.y, value, assetLoader);
        
        // Set name if provided
        if (name) {
            bonus.name = name;
        }

        if (properties.orbit) {
            this.applyOrbitToObject(bonus, properties.orbit);
        }

        return bonus;
    }
    
    static createTarget(position, properties, assetLoader) {
        if (!position) {
            console.error('Target creation failed: position is undefined', { position, properties });
            return null;
        }
        
        const { name = null, width = 60, height = 60, spriteType = 'ship_open' } = properties;
        const target = new Target(position.x, position.y, width, height, spriteType, assetLoader);
        
        // Set name if provided
        if (name) {
            target.name = name;
        }
        
        // Apply orbital properties if specified
        if (properties.orbit) {
            this.applyOrbitToObject(target, properties.orbit);
        }
        
        return target;
    }
    
    static createSlingshot(position, properties) {
        if (!position) {
            console.error('Slingshot creation failed: position is undefined', { position, properties });
            return null;
        }
        
        const {
            name = null,
            anchorX = position.x,
            anchorY = position.y,
            stretchLimit = 100,
            velocityMultiplier = 15
        } = properties;
        
        const slingshot = new Slingshot(position.x, position.y, anchorX, anchorY, stretchLimit);
        slingshot.velocityMultiplier = velocityMultiplier;
        
        // Set name if provided
        if (name) {
            slingshot.name = name;
        }
        
        // Apply orbital properties if specified
        if (properties.orbit) {
            this.applyOrbitToObject(slingshot, properties.orbit);
        }
        
        return slingshot;
    }
    
    static createTextObject(position, properties) {
        const {
            name = null,
            content = 'Sample Text',
            width = 200,
            height = 100,
            visible = true,
            textAlign = 'left',
            fontSize = 16,
            fontFamily = 'Arial, sans-serif',
            color = '#FFFFCC',
            backgroundColor = 'rgba(0, 0, 0, 0.7)',
            padding = 10,
            autoSize = true,
            fadeIn = false,
            fadeInDuration = 1.0,
            renderOrder = 8
        } = properties;
        
        const options = {
            width, height, visible, textAlign, fontSize, fontFamily,
            color, backgroundColor, padding, autoSize, fadeIn, 
            fadeInDuration, renderOrder
        };
        
        const textObject = new TextObject(position.x, position.y, content, options);
        
        // Set name if provided
        if (name) {
            textObject.name = name;
        }
        
        // Handle delayed visibility (for tutorial timing)
        if (properties.showAfterDelay) {
            textObject.visible = false;
            setTimeout(() => {
                textObject.show(properties.fadeIn || false);
            }, properties.showAfterDelay * 1000);
        }
        
        // Apply orbital properties if specified
        if (properties.orbit) {
            this.applyOrbitToObject(textObject, properties.orbit);
        }
        
        return textObject;
    }
    
    static createPointingArrow(position, properties) {
        const {
            name = null,
            color = '#00FFFF',
            glowColor = '#0099FF',
            baseWidth = 20,
            scaleWithDistance = true,
            maxDistance = 300,
            minWidth = 15,
            maxWidth = 60,
            pulseSpeed = 3.0,
            minAlpha = 0.6,
            maxAlpha = 1.0,
            renderOrder = 9,
            pointingAt = null // Target position {x, y}
        } = properties;
        
        const options = {
            color, glowColor, baseWidth, scaleWithDistance, maxDistance,
            minWidth, maxWidth, pulseSpeed, minAlpha, maxAlpha, renderOrder
        };
        
        const arrow = new PointingArrow(position.x, position.y, options);
        
        // Set name if provided
        if (name) {
            arrow.name = name;
        }
        
        // Set initial pointing target if specified
        if (pointingAt) {
            arrow.pointTo(pointingAt);
        }
        
        // Handle delayed pointing (for tutorial timing)
        if (properties.pointAfterDelay && pointTo) {
            arrow.visible = false;
            setTimeout(() => {
                arrow.pointTo(pointTo);
            }, properties.pointAfterDelay * 1000);
        }
        
        // Apply orbital properties if specified
        if (properties.orbit) {
            this.applyOrbitToObject(arrow, properties.orbit);
        }
        
        return arrow;
    }
    
    static createObstacle(position, properties) {
        // Future extension point for obstacles
        const { width = 50, height = 50, type = 'static' } = properties;
        // Would return new Obstacle(position.x, position.y, width, height, type);
        plog.warn('Obstacle type not yet implemented');
        return null;
    }
    
    static applyOrbitToObject(object, orbitConfig) {
        // Handle both old format (center, speed, radius, type) and new format (orbitCenter, orbitSpeed, etc.)
        const center = orbitConfig.orbitCenter || orbitConfig.center || { x: 0, y: 0 };
        const speed = orbitConfig.orbitSpeed || orbitConfig.speed || 0;
        const radius = orbitConfig.orbitRadius || orbitConfig.radius || 0;
        const type = orbitConfig.orbitType || orbitConfig.type || 'circular';
        const angle = orbitConfig.orbitAngle || orbitConfig.angle || 0;
        const params = orbitConfig.orbitParams || orbitConfig.params || {};
        
        // Skip if no meaningful orbit data
        if (!center || (center.x === 0 && center.y === 0 && radius === 0)) {
            return;
        }
        
        plog.debug('Applying orbit to object:', {
            center, speed, radius, type, angle, params,
            objectType: object.constructor.name
        });
        
        // Import OrbitSystem dynamically and create orbit system
        import('./gameObjects.js').then(module => {
            const OrbitSystem = module.OrbitSystem;
            
            if (!object.orbitSystem) {
                object.orbitSystem = new OrbitSystem();
            }
            
            // Set basic orbit properties
            object.orbitSystem.orbitCenter = center;
            object.orbitSystem.orbitRadius = radius;
            object.orbitSystem.orbitSpeed = speed;
            object.orbitSystem.orbitAngle = angle;
            object.orbitSystem.orbitType = type;
            object.orbitSystem.orbitParams = params;
            
            // Set up specific orbit type
            switch (type) {
                case 'circular':
                    object.orbitSystem.setCircularOrbit(center, radius, speed);
                    break;
                    
                case 'elliptical':
                    const semiMajorAxis = params.semiMajorAxis || radius;
                    const semiMinorAxis = params.semiMinorAxis || radius * 0.7;
                    const rotation = params.rotation || 0;
                    object.orbitSystem.setEllipticalOrbit(center, semiMajorAxis, semiMinorAxis, speed, rotation);
                    break;
                    
                case 'figure8':
                    const size = params.size || radius;
                    object.orbitSystem.setFigure8Orbit(center, size, speed);
                    break;
                    
                case 'custom':
                    if (params.xFunction && params.yFunction) {
                        // For custom orbits, we'd need to pass functions
                        // This is more complex and would require special handling
                        plog.warn('Custom orbit functions not yet supported in JSON config');
                        object.orbitSystem.setCircularOrbit(center, radius, speed);
                    } else {
                        object.orbitSystem.setCircularOrbit(center, radius, speed);
                    }
                    break;
                    
                default:
                    object.orbitSystem.setCircularOrbit(center, radius, speed);
                    break;
            }
            
            // Restore the angle
            object.orbitSystem.orbitAngle = angle;
            
            plog.success('Orbit system applied successfully');
        }).catch(error => {
            plog.error('Failed to apply orbit system:', error);
        });
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
        // this.loadDefaultLevels();
    }
    
    async loadDefaultLevels() {
        // Load built-in level definitions
        const totalLevels = 8;
        for (let i = 1; i <= totalLevels; i++) {
            await this.tryLoadLevelFile(i, `levels/level${i}.json`);
        }
    }

    async tryLoadLevelFile(levelNumber, filePath) {
        try {
            const success = await this.loadLevelFromFile(levelNumber, filePath);
            if (success) {
                plog.level(`Successfully loaded ${filePath} as level ${levelNumber}`);
            }
        } catch (error) {
            plog.warn(`Level file ${filePath} not found, using fallback generation`);
        }
    }
    
    async loadLevelFromFile(levelNumber, filePath) {
        try {
            const response = await fetch(filePath);
            const levelData = await response.json();
            this.levels.set(levelNumber, levelData);
            return true;
        } catch (error) {
            plog.error(`Failed to load level ${levelNumber} from ${filePath}:`, error);
            return false;
        }
    }
    
    loadLevel(levelNumber, game) {
        const levelDefinition = this.levels.get(levelNumber);
        if (!levelDefinition) {
            plog.warn(`Level ${levelNumber} not found, generating random level`);
            return this.generateRandomLevel(levelNumber, game);
        }
        
        plog.level(`Loading level ${levelNumber}: ${levelDefinition.name}`);
        
        // Clear existing game state
        game.gameObjects = [];
        game.planets = [];
        game.bonuses = [];
        game.textObjects = game.textObjects || [];
        game.pointingArrows = game.pointingArrows || [];
        game.physics.clear();
        game.planetCollisions = 0; // Reset collision counter
        
        // Clear text objects and arrows
        game.textObjects.length = 0;
        game.pointingArrows.length = 0;
        
        // Create penguin at start position
        const startPos = levelDefinition.startPosition || { x: 100, y: 300 };
        game.penguin = new Penguin(this.assetLoader);
        game.penguin.setPosition(startPos.x, startPos.y);
        game.gameObjects.push(game.penguin);
        
        // Create slingshot - look for slingshot object or use default
        const slingshotDef = levelDefinition.objects?.find(obj => obj.type === Slingshot.constructor.name.toLowerCase());
        if (slingshotDef) {
            game.slingshot = GameObjectFactory.create(slingshotDef, this.assetLoader, game);
        } else {
            game.slingshot = new Slingshot(startPos.x, startPos.y, startPos.x, startPos.y, 100);
        }
        game.slingshot.setPenguin(game.penguin);
        game.gameObjects.push(game.slingshot);
        
        // Create target - look for target object or use default
        const targetDef = levelDefinition.objects?.find(obj => obj.type === Target.constructor.name.toLowerCase());
        if (targetDef) {
            game.target = GameObjectFactory.create(targetDef, this.assetLoader, game);
        } else {
            const targetPos = levelDefinition.targetPosition || { x: 700, y: 300 };
            game.target = new Target(targetPos.x, targetPos.y, 60, 60, 'ship_open', this.assetLoader);
        }
        game.gameObjects.push(game.target);
        
        // Create level objects
        if (levelDefinition.objects) {
            for (const objectDef of levelDefinition.objects) {
                // Skip slingshots and targets that were already handled above
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
                    } else if (gameObject instanceof TextObject) {
                        game.textObjects.push(gameObject);
                    } else if (gameObject instanceof PointingArrow) {
                        game.pointingArrows.push(gameObject);
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
        game.state = GameState.PLAYING;
        
        plog.level(`Level ${levelNumber} loaded: ${game.planets.length} planets, ${game.bonuses.length} bonuses`);
        return levelDefinition;
    }
    
    generateRandomLevel(levelNumber, game) {
        plog.level(`Generating random level ${levelNumber}`);
        
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
        const planetTypes = Planet.planetTypes;
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
                // Tutorial text objects (based on original game text)
                {
                    type: 'text',
                    position: { x: 200, y: 150 },
                    properties: {
                        content: '<font color="#FFFFCC">Click on Kevin and hold your mouse down. Then pull Kevin back to the tip of the arrow and let your mouse go.</font>',
                        width: 280,
                        fadeIn: true,
                        fadeInDuration: 2.0,
                        textAlign: 'left'
                    }
                },
                {
                    type: 'text',
                    position: { x: 700, y: 100 },
                    properties: {
                        content: '<font color="#00FF00">Hit the ship to complete the level!</font>',
                        width: 200,
                        showAfterDelay: 3.0,
                        fadeIn: true,
                        color: '#00FF00'
                    }
                },
                {
                    type: 'text',
                    position: { x: 400, y: 350 },
                    properties: {
                        content: '<font color="#FF6600"><b>Tips!</b></font><br><font color="#FFFFCC">Collect bonuses for extra points. Avoid hitting planets!</font>',
                        width: 250,
                        showAfterDelay: 5.0,
                        fadeIn: true,
                        textAlign: 'center'
                    }
                },
                // Pointing arrows for tutorial guidance
                {
                    type: 'arrow',
                    position: { x: 80, y: 250 },
                    properties: {
                        pointTo: { x: 100, y: 300 }, // Point to penguin start position
                        scaleWithDistance: false,
                        baseWidth: 30
                    }
                },
                {
                    type: 'arrow',
                    position: { x: 650, y: 350 },
                    properties: {
                        pointTo: { x: 700, y: 300 }, // Point to target ship
                        pointAfterDelay: 4.0,
                        color: '#00FF00',
                        glowColor: '#008800'
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
            name: "Bonuses",
            description: "Collect bonuses to increase your score",
            startPosition: { x: 100, y: 300 },
            targetPosition: { x: 700, y: 300 },
            objects: [
                {
                    type: 'text',
                    position: { x: 200, y: 150 },
                    properties: {
                        content: '<font color="#FFFFCC">Collect bonuses to increase your score</font>',
                        width: 280,
                        fadeIn: true,
                        fadeInDuration: 2.0,
                        textAlign: 'left'
                    }
                },
                {
                    type: 'arrow',
                    position: { x: 400, y: 240 },
                    properties: {
                        pointTo: { x: 450, y: 250 }, // Point to penguin start position
                        scaleWithDistance: false,
                        baseWidth: 30
                    }
                },
                {
                    type: 'bonus',
                    position: { x: 450, y: 300 },
                    properties: { value: 150 }
                }
            ],
            rules: {
                scoreMultiplier: 1.2
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
                gravitationalConstant: GRAVITATIONAL_CONSTANT * 1.2
            }
        };
    }
} 