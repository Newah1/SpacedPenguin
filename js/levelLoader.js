// Level Loading System for Spaced Penguin
// Supports JSON-based level definitions with object factories and custom rules

import { Planet, Bonus, Target, Slingshot, TextObject, PointingArrow } from './gameObjects.js';
import { Penguin } from './penguin.js';
import { GRAVITATIONAL_CONSTANT, TOTAL_LEVELS } from './globalConstants.js';
import plog from './penguinLogger.js';
import Utils from './utils.js';
import { GameState } from './game.js';
import {
    assertValidLevelDefinition,
    formatLevelDiagnostics,
    validateLevelDefinition
} from './levelValidation.js';
import {
    LevelObjectType,
    normalizeLevelObjectType,
    normalizeOrbitDefinition
} from './levelSchema.js';
import { evaluateFailureRules, evaluateVictoryRules } from './simulationEngine.js';

export class GameObjectFactory {
    static create(objectDefinition, assetLoader, game, gameObjectLookup = null) {
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
        
        switch (normalizeLevelObjectType(type)) {
            case LevelObjectType.PLANET:
                // Temporary debug: Check mass value being passed
                console.log('GameObjectFactory.create - Planet properties:', properties);
                console.log('GameObjectFactory.create - Planet mass:', properties.mass);
                return this.createPlanet(position, properties, assetLoader, gameObjectLookup);
            
            case LevelObjectType.BONUS:
                return this.createBonus(position, properties, assetLoader, gameObjectLookup);
            
            case LevelObjectType.TARGET:
                return this.createTarget(position, properties, assetLoader, gameObjectLookup);
            
            case LevelObjectType.SLINGSHOT:
                return this.createSlingshot(position, properties, gameObjectLookup);
            
            case LevelObjectType.TEXT:
                return this.createTextObject(position, properties, gameObjectLookup);
            
            case LevelObjectType.POINTING_ARROW:
                return this.createPointingArrow(position, properties, gameObjectLookup);
            
            case LevelObjectType.PENGUIN:
                return null; // Exported penguin state is not a separately loaded object.
            
            default:
                plog.warn(`Unknown object type: ${type}`);
                return null;
        }
    }
    
    static createPlanet(position, properties, assetLoader, gameObjectLookup = null) {
        if (!position) {
            console.error('Planet creation failed: position is undefined', { position, properties });
            return null;
        }
        
        const {
            name = null,
            radius = 30,
            mass = 100,
            collisionRadius = radius + 8,
            gravitationalReach = 5000,
            orbit = null,
            planetType = null,
            id = null
        } = properties;
        
        const planet = new Planet(position.x, position.y, radius, mass, gravitationalReach, planetType, assetLoader, gameObjectLookup);
        planet.collisionRadius = collisionRadius;
        
        // Set name and ID if provided
        if (name) {
            planet.name = name;
        }
        if (id) {
            planet.id = id;
        }
        
        // Apply orbital properties if specified (check both old location and new properties location)
        if (orbit) {
            this.applyOrbitToObject(planet, orbit, gameObjectLookup);
        } else if (properties.orbit) {
            this.applyOrbitToObject(planet, properties.orbit, gameObjectLookup);
        }
        
        return planet;
    }
    
    static createBonus(position, properties, assetLoader, gameObjectLookup = null) {
        const { name = null, value = 100, id = null } = properties;
        
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
        
        const bonus = new Bonus(position.x, position.y, value, assetLoader, gameObjectLookup);
        
        // Set name and ID if provided
        if (name) {
            bonus.name = name;
        }
        if (id) {
            bonus.id = id;
        }

        if (properties.orbit) {
            this.applyOrbitToObject(bonus, properties.orbit, gameObjectLookup);
        }

        return bonus;
    }
    
    static createTarget(position, properties, assetLoader, gameObjectLookup = null) {
        if (!position) {
            console.error('Target creation failed: position is undefined', { position, properties });
            return null;
        }
        
        const { name = null, width = 60, height = 60, spriteType = 'ship_open', id = null } = properties;
        const target = new Target(position.x, position.y, width, height, spriteType, assetLoader, gameObjectLookup);
        
        // Set name and ID if provided
        if (name) {
            target.name = name;
        }
        if (id) {
            target.id = id;
        }
        
        // Apply orbital properties if specified
        if (properties.orbit) {
            this.applyOrbitToObject(target, properties.orbit, gameObjectLookup);
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
            stretchLimit = properties.maxPullback ?? 100,
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
            maxWidth = null,
            autoSize = true,
            fadeIn = false,
            fadeInDuration = 1.0,
            renderOrder = 8
        } = properties;
        
        const options = {
            width, height, visible, textAlign, fontSize, fontFamily,
            color, backgroundColor, padding, maxWidth, autoSize, fadeIn,
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
        if (properties.pointAfterDelay && pointingAt) {
            arrow.visible = false;
            setTimeout(() => {
                arrow.pointTo(pointingAt);
                arrow.visible = true;
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
    
    static applyOrbitToObject(object, orbitConfig, gameObjectLookup = null) {
        const normalized = normalizeOrbitDefinition(orbitConfig);
        const { center, targetId, speed, radius, type, angle, params } = normalized;
        
        // Skip if no meaningful orbit data (either fixed center or object reference)
        if (!targetId && (!center || (center.x === 0 && center.y === 0 && radius === 0))) {
            return;
        }
        
        plog.debug('Applying orbit to object:', {
            center, targetId, speed, radius, type, angle, params,
            objectType: object.constructor.name
        });
        
        // Create orbit system if it doesn't exist
        if (!object.orbitSystem) {
            // Import OrbitSystem dynamically
            import('./gameObjects.js').then(module => {
                const OrbitSystem = module.OrbitSystem;
                object.orbitSystem = new OrbitSystem(gameObjectLookup);
                this.configureOrbitSystem(object, center, targetId, speed, radius, type, angle, params);
            });
        } else {
            if (gameObjectLookup) object.orbitSystem.gameObjectLookup = gameObjectLookup;
            this.configureOrbitSystem(object, center, targetId, speed, radius, type, angle, params);
        }
    }
    
    static configureOrbitSystem(object, center, targetId, speed, radius, type, angle, params) {
        // Set basic orbit properties
        object.orbitSystem.orbitCenter = center;
        object.orbitSystem.orbitTargetId = targetId;
        object.orbitSystem.orbitRadius = radius;
        object.orbitSystem.orbitSpeed = speed;
        object.orbitSystem.orbitAngle = angle;
        object.orbitSystem.orbitType = type;
        object.orbitSystem.orbitParams = params;
        
        // Set up specific orbit type - use targetId if available, otherwise use center
        const orbitCenter = targetId || center;
        
        switch (type) {
            case 'circular':
                object.orbitSystem.setCircularOrbit(orbitCenter, radius, speed);
                break;
                
            case 'elliptical':
                const semiMajorAxis = params.semiMajorAxis ?? radius;
                const semiMinorAxis = params.semiMinorAxis ?? radius * 0.7;
                const rotation = params.rotation ?? 0;
                object.orbitSystem.setEllipticalOrbit(orbitCenter, semiMajorAxis, semiMinorAxis, speed, rotation);
                break;
                
                case 'figure8':
                const size = params.size ?? radius;
                object.orbitSystem.setFigure8Orbit(orbitCenter, size, speed);
                    break;
                    
                case 'gravity':
                    const initialVelocity = params.initialVelocity ?? { x: 0, y: 50 };
                    const gravityStrength = params.gravityStrength ?? 1000;
                    // Pass object position to store as initial position
                    const objectPosition = object.position || { x: object.x, y: object.y };
                    object.orbitSystem.setGravityOrbit(orbitCenter, initialVelocity, gravityStrength, objectPosition);
                    break;
                    
                case 'custom':
                    if (params.xFunction && params.yFunction) {
                        // For custom orbits, we'd need to pass functions
                        // This is more complex and would require special handling
                        plog.warn('Custom orbit functions not yet supported in JSON config');
                        object.orbitSystem.setCircularOrbit(orbitCenter, radius, speed);
                    } else {
                        object.orbitSystem.setCircularOrbit(orbitCenter, radius, speed);
                    }
                    break;
                    
                default:
                    object.orbitSystem.setCircularOrbit(orbitCenter, radius, speed);
                    break;
        }
        
        // Restore the angle
        object.orbitSystem.orbitAngle = angle;
        
        plog.success('Orbit system applied successfully');
    }
}

export class LevelRules {
    constructor(rulesDefinition = {}) {
        this.maxTries = rulesDefinition.maxTries ?? null;
        this.timeLimit = rulesDefinition.timeLimit ?? null;
        this.scoreMultiplier = rulesDefinition.scoreMultiplier ?? 1.0;
        this.gravitationalConstant = rulesDefinition.gravitationalConstant ?? GRAVITATIONAL_CONSTANT;
        this.customBehaviors = rulesDefinition.customBehaviors ?? [];
        this.requiredBonuses = rulesDefinition.requiredBonuses ?? null; // Number of bonuses required to complete
        this.allowedMisses = rulesDefinition.allowedMisses ?? null; // Max planet collisions allowed
    }
    
    applyToGame(game) {
        // Always assign the effective value so gravity cannot leak across levels.
        game.physics.gravitationalConstant = this.gravitationalConstant;
        
        // Store rules for game logic to check
        game.levelRules = this;
    }
    
    checkVictoryConditions(game) {
        const failure = evaluateVictoryRules({
            rules: this,
            bonuses: game.bonuses.map(bonus => ({ collected: bonus.state === 'Hit' }))
        });
        return failure
            ? { canProgress: false, reason: failure.reason }
            : { canProgress: true, reason: null };
    }
    
    checkFailureConditions(game) {
        const failure = evaluateFailureRules({
            rules: this,
            counters: { tries: game.tries, planetCollisions: game.planetCollisions }
        });
        return failure
            ? { failed: true, reason: failure.reason }
            : { failed: false, reason: null };
    }
}

export class LevelLoader {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
        this.levels = new Map();
        this.validationResults = new Map();
    }

    validateDefinition(levelDefinition) {
        return validateLevelDefinition(levelDefinition);
    }

    assertLevelValid(levelNumber) {
        const levelDefinition = this.levels.get(levelNumber);
        if (!levelDefinition) return null; // Missing levels use generated fallback content.
        const validation = assertValidLevelDefinition(levelDefinition, `level ${levelNumber}`);
        this.validationResults.set(levelNumber, validation);
        return validation;
    }
    
    async loadDefaultLevels() {
        // Load built-in level definitions
        const totalLevels = TOTAL_LEVELS;
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
            // Level JSON is frequently replaced while using the editor. Avoid
            // reusing a stale browser response after an export is copied over a
            // built-in level file.
            const response = await fetch(filePath, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            const levelData = await response.json();
            const validation = validateLevelDefinition(levelData);
            this.validationResults.set(levelNumber, validation);
            if (!validation.valid) {
                throw new Error(`Level validation failed:\n${formatLevelDiagnostics(validation, filePath)}`);
            }
            if (validation.warnings.length > 0) {
                plog.warn(`Level ${levelNumber} validation warnings:\n${formatLevelDiagnostics({ diagnostics: validation.warnings }, filePath)}`);
            }
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

        this.assertLevelValid(levelNumber);
        
        plog.level(`Loading level ${levelNumber}: ${levelDefinition.name}`);
        
        // Clear existing game state
        game.gameObjects = [];
        game.planets = [];
        game.bonuses = [];
        game.textObjects = game.textObjects || [];
        game.pointingArrows = game.pointingArrows || [];
        game.physics.clear();
        game.planetCollisions = 0; // Reset collision counter
        game.simulationTime = 0;
        
        // IMPORTANT: Invalidate render cache when clearing gameObjects
        game._cachedSortedObjects = null;
        game._gameObjectsChanged = true;
        
        // Clear text objects and arrows
        game.textObjects.length = 0;
        game.pointingArrows.length = 0;
        
        // Create penguin at start position
        const startPos = levelDefinition.startPosition || { x: 100, y: 300 };
        game.penguin = new Penguin(this.assetLoader);
        game.penguin.setPosition(startPos.x, startPos.y);
        game.addGameObject(game.penguin);
        
        // Create slingshot - look for slingshot object or use default
        const slingshotDef = levelDefinition.objects?.find(obj => normalizeLevelObjectType(obj.type) === LevelObjectType.SLINGSHOT);
        if (slingshotDef) {
            game.slingshot = GameObjectFactory.create(slingshotDef, this.assetLoader, game);
        } else {
            game.slingshot = new Slingshot(startPos.x, startPos.y, startPos.x, startPos.y, 100);
        }
        game.slingshot.setPenguin(game.penguin);
        game.addGameObject(game.slingshot);
        
        // Create target - look for target object or use default
        const targetDef = levelDefinition.objects?.find(obj => normalizeLevelObjectType(obj.type) === LevelObjectType.TARGET);
        if (targetDef) {
            game.target = GameObjectFactory.create(targetDef, this.assetLoader, game);
        } else {
            const targetPos = levelDefinition.targetPosition || { x: 700, y: 300 };
            game.target = new Target(targetPos.x, targetPos.y, 60, 60, 'ship_open', this.assetLoader);
        }
        game.addGameObject(game.target);
        
        // Create object lookup map for hierarchical orbits
        const gameObjectMap = new Map();
        const gameObjectLookup = (id) => gameObjectMap.get(id);
        
        // First pass: Create level objects without orbit configuration
        const objectsToOrbit = [];
        const typeCounters = {}; // Track count by type for consistent ID generation

        for (const objectDef of (levelDefinition.objects || [])) {
            // Skip slingshots and targets that were already handled above
            const objectType = normalizeLevelObjectType(objectDef.type);
            if (objectType === LevelObjectType.SLINGSHOT || objectType === LevelObjectType.TARGET) {
                continue; // Already handled above
            }
            
            const gameObject = GameObjectFactory.create(objectDef, this.assetLoader, game, gameObjectLookup);
            if (gameObject) {
                // Generate consistent ID if not provided
                if (!gameObject.id) {
                    // Use type-specific counters for consistent IDs
                    typeCounters[objectType] = (typeCounters[objectType] || 0) + 1;
                    gameObject.id = `${objectType}_${typeCounters[objectType]}`;
                }
                
                // Store both the original properties ID and the generated ID for lookup
                const lookupId = objectDef.properties?.id || gameObject.id;
                
                // Add to lookup map with both possible IDs
                gameObjectMap.set(gameObject.id, gameObject);
                if (lookupId !== gameObject.id) {
                    gameObjectMap.set(lookupId, gameObject);
                }
                
                // Store orbit config for second pass WITH direct object reference
                const tempOrbit = objectDef.properties?.orbit;
                if (tempOrbit) {
                    objectsToOrbit.push({ gameObject: gameObject, orbit: tempOrbit });
                }
                
                game.addGameObject(gameObject);
                
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
        
        // Include target's orbit in second pass if defined (so object-id references resolve)
        if (targetDef && targetDef.properties?.orbit) {
            objectsToOrbit.push({ gameObject: game.target, orbit: targetDef.properties.orbit });
        }

        // Second pass: Apply orbit configurations now that all objects exist
        for (const { gameObject, orbit } of objectsToOrbit) {
            if (gameObject) {
                GameObjectFactory.applyOrbitToObject(gameObject, orbit, gameObjectLookup);
            } else {
                plog.error(`Invalid gameObject reference for orbit application`);
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
}
