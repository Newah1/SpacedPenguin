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
    LevelOrbitType,
    normalizeLevelObjectDefinition,
    normalizeLevelObjectType,
    normalizeOrbitDefinition
} from './levelSchema.js';
import { evaluateFailureRules, evaluateVictoryRules } from './simulationEngine.js';
import {
    LEVEL_CATALOG_CONFIG,
    LEVEL_DEFAULTS,
    LEVEL_GENERATOR_CONFIG,
    PHYSICS_CONFIG,
    WORLD_CONFIG,
    builtInLevelPath
} from './config/gameConfig.js';

export class GameObjectFactory {
    static create(objectDefinition, assetLoader, game, gameObjectLookup = null) {
        const normalizedDefinition = normalizeLevelObjectDefinition(objectDefinition);
        let { type, position, properties = {} } = normalizedDefinition;
        
        // If position is not at top level, check if it's in properties
        if (!position && properties.x !== undefined && properties.y !== undefined) {
            position = { x: properties.x, y: properties.y };
        }
        
        // Debug logging for problematic objects
        if (!position && [LevelObjectType.BONUS, LevelObjectType.PLANET, LevelObjectType.TARGET]
            .includes(normalizeLevelObjectType(type))) {
            console.error('Object creation failed: missing position', { 
                type, 
                position, 
                properties,
                objectDefinition: normalizedDefinition
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
            radius = LEVEL_DEFAULTS.planet.radius,
            mass = LEVEL_DEFAULTS.planet.mass,
            collisionRadius = radius + LEVEL_DEFAULTS.planet.collisionPadding,
            gravitationalReach = LEVEL_DEFAULTS.planet.gravitationalReach,
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
        const { name = null, value = LEVEL_DEFAULTS.bonus.value, id = null } = properties;
        
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
        
        const {
            name = null,
            width = LEVEL_DEFAULTS.target.width,
            height = LEVEL_DEFAULTS.target.height,
            spriteType = LEVEL_DEFAULTS.target.spriteType,
            id = null
        } = properties;
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
            stretchLimit = properties.maxPullback ?? LEVEL_DEFAULTS.slingshot.maxPullback,
            velocityMultiplier = LEVEL_DEFAULTS.slingshot.velocityMultiplier
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
            content = LEVEL_DEFAULTS.text.content,
            width = LEVEL_DEFAULTS.text.width,
            height = LEVEL_DEFAULTS.text.height,
            visible = LEVEL_DEFAULTS.text.visible,
            textAlign = LEVEL_DEFAULTS.text.textAlign,
            fontSize = LEVEL_DEFAULTS.text.fontSize,
            fontFamily = LEVEL_DEFAULTS.text.fontFamily,
            color = LEVEL_DEFAULTS.text.color,
            backgroundColor = LEVEL_DEFAULTS.text.backgroundColor,
            padding = LEVEL_DEFAULTS.text.padding,
            maxWidth = LEVEL_DEFAULTS.text.maxWidth,
            autoSize = LEVEL_DEFAULTS.text.autoSize,
            fadeIn = LEVEL_DEFAULTS.text.fadeIn,
            fadeInDuration = LEVEL_DEFAULTS.text.fadeInDuration,
            renderOrder = LEVEL_DEFAULTS.text.renderOrder
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
                textObject.show(properties.fadeIn);
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
            color = LEVEL_DEFAULTS.pointingArrow.color,
            glowColor = LEVEL_DEFAULTS.pointingArrow.glowColor,
            baseWidth = LEVEL_DEFAULTS.pointingArrow.baseWidth,
            scaleWithDistance = LEVEL_DEFAULTS.pointingArrow.scaleWithDistance,
            maxDistance = LEVEL_DEFAULTS.pointingArrow.maxDistance,
            minWidth = LEVEL_DEFAULTS.pointingArrow.minWidth,
            maxWidth = LEVEL_DEFAULTS.pointingArrow.maxWidth,
            pulseSpeed = LEVEL_DEFAULTS.pointingArrow.pulseSpeed,
            minAlpha = LEVEL_DEFAULTS.pointingArrow.minAlpha,
            maxAlpha = LEVEL_DEFAULTS.pointingArrow.maxAlpha,
            renderOrder = LEVEL_DEFAULTS.pointingArrow.renderOrder,
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
            case LevelOrbitType.CIRCULAR:
                object.orbitSystem.setCircularOrbit(orbitCenter, radius, speed);
                break;
                
            case LevelOrbitType.ELLIPTICAL:
                const semiMajorAxis = params.semiMajorAxis ?? radius;
                const semiMinorAxis = params.semiMinorAxis ?? radius * PHYSICS_CONFIG.orbit.ellipseMinorAxisRatio;
                const rotation = params.rotation ?? 0;
                object.orbitSystem.setEllipticalOrbit(orbitCenter, semiMajorAxis, semiMinorAxis, speed, rotation);
                break;
                
                case LevelOrbitType.FIGURE_8:
                const size = params.size ?? radius;
                object.orbitSystem.setFigure8Orbit(orbitCenter, size, speed);
                    break;
                    
                case LevelOrbitType.GRAVITY:
                    const initialVelocity = params.initialVelocity ?? PHYSICS_CONFIG.orbit.initialVelocity;
                    const gravityStrength = params.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength;
                    // Pass object position to store as initial position
                    const objectPosition = object.position || { x: object.x, y: object.y };
                    object.orbitSystem.setGravityOrbit(orbitCenter, initialVelocity, gravityStrength, objectPosition);
                    break;
                    
                case LevelOrbitType.CUSTOM:
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
        this.scoreMultiplier = rulesDefinition.scoreMultiplier ?? LEVEL_DEFAULTS.rules.scoreMultiplier;
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
        for (let i = LEVEL_CATALOG_CONFIG.firstLevel; i <= totalLevels; i++) {
            await this.tryLoadLevelFile(i, builtInLevelPath(i));
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

        game.levelMetadata = {
            name: levelDefinition.name || `Custom Level ${levelNumber}`,
            description: levelDefinition.description ?? ''
        };
        
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
        const startPos = levelDefinition.startPosition || WORLD_CONFIG.defaultStartPosition;
        game.penguin = new Penguin(this.assetLoader);
        game.penguin.setPosition(startPos.x, startPos.y);
        game.addGameObject(game.penguin);
        
        // Create slingshot - look for slingshot object or use default
        const slingshotDef = levelDefinition.objects?.find(obj => normalizeLevelObjectType(obj.type) === LevelObjectType.SLINGSHOT);
        if (slingshotDef) {
            game.slingshot = GameObjectFactory.create(slingshotDef, this.assetLoader, game);
        } else {
            game.slingshot = new Slingshot(
                startPos.x,
                startPos.y,
                startPos.x,
                startPos.y,
                LEVEL_DEFAULTS.slingshot.maxPullback
            );
            game.slingshot.minPullback = LEVEL_DEFAULTS.slingshot.minPullback;
            game.slingshot.velocityMultiplier = LEVEL_DEFAULTS.slingshot.velocityMultiplier;
        }
        game.slingshot.setPenguin(game.penguin);
        game.addGameObject(game.slingshot);
        
        // Create target - look for target object or use default
        const targetDef = levelDefinition.objects?.find(obj => normalizeLevelObjectType(obj.type) === LevelObjectType.TARGET);
        if (targetDef) {
            game.target = GameObjectFactory.create(targetDef, this.assetLoader, game);
        } else {
            const targetPos = levelDefinition.targetPosition || WORLD_CONFIG.defaultTargetPosition;
            game.target = new Target(
                targetPos.x,
                targetPos.y,
                LEVEL_DEFAULTS.target.width,
                LEVEL_DEFAULTS.target.height,
                LEVEL_DEFAULTS.target.spriteType,
                this.assetLoader
            );
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
        
        const generator = LEVEL_GENERATOR_CONFIG;
        const numPlanets = Math.min(
            generator.planets.baseCount + levelNumber * generator.planets.perLevel,
            generator.planets.maximumCount
        );
        const numBonuses = Math.min(
            levelNumber * generator.bonuses.perLevel,
            generator.bonuses.maximumCount
        );
        
        const levelDefinition = {
            name: `Generated Level ${levelNumber}`,
            description: `Randomly generated level with ${numPlanets} planets and ${numBonuses} bonuses`,
            startPosition: { ...WORLD_CONFIG.defaultStartPosition },
            targetPosition: { ...WORLD_CONFIG.defaultTargetPosition },
            objects: [],
            rules: {
                scoreMultiplier: generator.scoreMultiplierBase +
                    (levelNumber - LEVEL_CATALOG_CONFIG.firstLevel) * generator.scoreMultiplierPerLevel
            }
        };
        
        // Generate planets
        const planetTypes = Planet.planetTypes;
        for (let i = 0; i < numPlanets; i++) {
            levelDefinition.objects.push({
                type: LevelObjectType.PLANET,
                position: {
                    x: Utils.random(...generator.planets.xRange),
                    y: Utils.random(...generator.planets.yRange)
                },
                properties: {
                    radius: Utils.random(...generator.planets.radiusRange),
                    mass: Utils.random(...generator.planets.massRange),
                    gravitationalReach: PHYSICS_CONFIG.defaultGravitationalReach,
                    planetType: planetTypes[i % planetTypes.length]
                }
            });
        }
        
        // Generate bonuses
        for (let i = 0; i < numBonuses; i++) {
            levelDefinition.objects.push({
                type: LevelObjectType.BONUS,
                position: {
                    x: Utils.random(...generator.bonuses.xRange),
                    y: Utils.random(...generator.bonuses.yRange)
                },
                properties: {
                    value: Utils.randomInt(...generator.bonuses.valueRange)
                }
            });
        }
        
        // Store and load the generated level
        this.levels.set(levelNumber, levelDefinition);
        return this.loadLevel(levelNumber, game);
    }
}
