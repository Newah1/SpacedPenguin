// Level Loading System for Spaced Penguin
// Supports JSON-based level definitions with object factories and custom rules

import { Planet, Bonus, Target, Slingshot, TextObject, PointingArrow, Portal } from './gameObjects.js';
import { BlackHole } from './blackHole.js';
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
    LEVEL_COLLECTION_CONFIG,
    LEVEL_CATALOG_CONFIG,
    LEVEL_DEFAULTS,
    LEVEL_GENERATOR_CONFIG,
    PHYSICS_CONFIG,
    WORLD_CONFIG,
    builtInLevelPath,
    formatLevelSelector,
    levelCollectionPath
} from './config/gameConfig.js';

export class GameObjectFactory {
    static create(objectDefinition, assetLoader, game, gameObjectLookup = null) {
        const normalizedDefinition = normalizeLevelObjectDefinition(objectDefinition);
        let { type, position, properties = {} } = normalizedDefinition;
        
        if (!position && properties.x !== undefined && properties.y !== undefined) {
            position = { x: properties.x, y: properties.y };
        }
        
        if (!position && [LevelObjectType.BONUS, LevelObjectType.PLANET, LevelObjectType.BLACK_HOLE, LevelObjectType.TARGET, LevelObjectType.PORTAL]
            .includes(normalizeLevelObjectType(type))) {
            plog.error('Object creation failed: missing position', {
                type, position, properties, objectDefinition: normalizedDefinition
            });
            return null;
        }
        
        switch (normalizeLevelObjectType(type)) {
            case LevelObjectType.PLANET:
                return this.createPlanet(position, properties, assetLoader, gameObjectLookup);
            case LevelObjectType.BLACK_HOLE:
                return this.createBlackHole(position, properties, gameObjectLookup);
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
            case LevelObjectType.PORTAL:
                return this.createPortal(position, properties);
            case LevelObjectType.PENGUIN:
                return null;
            default:
                plog.warn(`Unknown object type: ${type}`);
                return null;
        }
    }
    
    static createPlanet(position, properties, assetLoader, gameObjectLookup = null) {
        if (!position) return null;
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
        if (name) planet.name = name;
        if (id) planet.id = id;
        if (orbit) this.applyOrbitToObject(planet, orbit, gameObjectLookup);
        return planet;
    }

    static createBlackHole(position, properties, gameObjectLookup = null) {
        if (!position) return null;
        const {
            name = null,
            radius = LEVEL_DEFAULTS.planet.radius,
            mass = LEVEL_DEFAULTS.planet.mass,
            gravitationalReach = LEVEL_DEFAULTS.planet.gravitationalReach,
            orbit = null,
            id = null
        } = properties;
        const blackHole = new BlackHole(position.x, position.y, radius, mass, gravitationalReach, gameObjectLookup);
        if (name) blackHole.name = name;
        if (id) blackHole.id = id;
        if (orbit) this.applyOrbitToObject(blackHole, orbit, gameObjectLookup);
        return blackHole;
    }

    static createPortal(position, properties) {
        if (!position) return null;
        const portal = new Portal(position.x, position.y, properties);
        portal.id = properties.id ?? null;
        portal.name = properties.name ?? '';
        return portal;
    }
    
    static createBonus(position, properties, assetLoader, gameObjectLookup = null) {
        const { name = null, value = LEVEL_DEFAULTS.bonus.value, id = null } = properties;
        if (!position || typeof position.x === 'undefined' || typeof position.y === 'undefined') return null;
        const bonus = new Bonus(position.x, position.y, value, assetLoader, gameObjectLookup);
        if (name) bonus.name = name;
        if (id) bonus.id = id;
        if (properties.orbit) this.applyOrbitToObject(bonus, properties.orbit, gameObjectLookup);
        return bonus;
    }
    
    static createTarget(position, properties, assetLoader, gameObjectLookup = null) {
        if (!position) return null;
        const {
            name = null,
            width = LEVEL_DEFAULTS.target.width,
            height = LEVEL_DEFAULTS.target.height,
            spriteType = LEVEL_DEFAULTS.target.spriteType,
            id = null,
            collisionRadius = width / 2
        } = properties;
        const target = new Target(position.x, position.y, width, height, spriteType, assetLoader, gameObjectLookup);
        target.collisionRadius = collisionRadius;
        if (name) target.name = name;
        if (id) target.id = id;
        if (properties.orbit) this.applyOrbitToObject(target, properties.orbit, gameObjectLookup);
        return target;
    }
    
    static createSlingshot(position, properties) {
        if (!position) return null;
        const {
            name = null,
            anchorX = properties.anchorPosition?.x ?? position.x,
            anchorY = properties.anchorPosition?.y ?? position.y,
            stretchLimit = properties.maxPullback ?? LEVEL_DEFAULTS.slingshot.maxPullback,
            velocityMultiplier = LEVEL_DEFAULTS.slingshot.velocityMultiplier
        } = properties;
        const slingshot = new Slingshot(position.x, position.y, anchorX, anchorY, stretchLimit);
        slingshot.velocityMultiplier = velocityMultiplier;
        slingshot.minPullback = properties.minPullback ?? LEVEL_DEFAULTS.slingshot.minPullback;
        slingshot.launchModel = properties.launchModel ?? 'modern';
        slingshot.sourceFrameRate = properties.sourceFrameRate ?? null;
        slingshot.coordinateScale = properties.coordinateScale ?? 1;
        if (name) slingshot.name = name;
        if (properties.orbit) this.applyOrbitToObject(slingshot, properties.orbit);
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
        const options = { width, height, visible, textAlign, fontSize, fontFamily, color, backgroundColor, padding, maxWidth, autoSize, fadeIn, fadeInDuration, renderOrder };
        const textObject = new TextObject(position.x, position.y, content, options);
        if (name) textObject.name = name;
        if (properties.showAfterDelay) {
            textObject.visible = false;
            setTimeout(() => textObject.show(properties.fadeIn), properties.showAfterDelay * 1000);
        }
        if (properties.orbit) this.applyOrbitToObject(textObject, properties.orbit);
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
            pointingAt = null
        } = properties;
        const options = { color, glowColor, baseWidth, scaleWithDistance, maxDistance, minWidth, maxWidth, pulseSpeed, minAlpha, maxAlpha, renderOrder };
        const arrow = new PointingArrow(position.x, position.y, options);
        if (name) arrow.name = name;
        if (pointingAt) arrow.pointTo(pointingAt);
        if (properties.pointAfterDelay && pointingAt) {
            arrow.visible = false;
            setTimeout(() => { arrow.pointTo(pointingAt); arrow.visible = true; }, properties.pointAfterDelay * 1000);
        }
        if (properties.orbit) this.applyOrbitToObject(arrow, properties.orbit);
        return arrow;
    }
    
    static applyOrbitToObject(object, orbitConfig, gameObjectLookup = null) {
        const normalized = normalizeOrbitDefinition(orbitConfig);
        const { center, targetId, speed, radius, type, angle, params } = normalized;
        if (!targetId && (!center || (center.x === 0 && center.y === 0 && radius === 0))) return;
        if (!object.orbitSystem) {
            import('./gameObjects.js').then(module => {
                object.orbitSystem = new module.OrbitSystem(gameObjectLookup);
                this.configureOrbitSystem(object, center, targetId, speed, radius, type, angle, params);
            });
        } else {
            if (gameObjectLookup) object.orbitSystem.gameObjectLookup = gameObjectLookup;
            this.configureOrbitSystem(object, center, targetId, speed, radius, type, angle, params);
        }
    }
    
    static configureOrbitSystem(object, center, targetId, speed, radius, type, angle, params) {
        object.orbitSystem.orbitCenter = center;
        object.orbitSystem.orbitTargetId = targetId;
        object.orbitSystem.orbitRadius = radius;
        object.orbitSystem.orbitSpeed = speed;
        object.orbitSystem.orbitAngle = angle;
        object.orbitSystem.orbitType = type;
        object.orbitSystem.orbitParams = params;
        const orbitCenter = targetId || center;
        switch (type) {
            case LevelOrbitType.CIRCULAR:
                object.orbitSystem.setCircularOrbit(orbitCenter, radius, speed);
                break;
            case LevelOrbitType.ELLIPTICAL: {
                const semiMajorAxis = params.semiMajorAxis ?? radius;
                const semiMinorAxis = params.semiMinorAxis ?? radius * PHYSICS_CONFIG.orbit.ellipseMinorAxisRatio;
                const rotation = params.rotation ?? 0;
                object.orbitSystem.setEllipticalOrbit(orbitCenter, semiMajorAxis, semiMinorAxis, speed, rotation);
                break;
            }
            case LevelOrbitType.FIGURE_8: {
                const size = params.size ?? radius;
                object.orbitSystem.setFigure8Orbit(orbitCenter, size, speed);
                break;
            }
            case LevelOrbitType.GRAVITY: {
                const initialVelocity = params.initialVelocity ?? PHYSICS_CONFIG.orbit.initialVelocity;
                const gravityStrength = params.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength;
                const objectPosition = object.position || { x: object.x, y: object.y };
                object.orbitSystem.setGravityOrbit(orbitCenter, initialVelocity, gravityStrength, objectPosition);
                break;
            }
            case LevelOrbitType.DIRECTOR_GRAVITY: {
                const objectPosition = object.position || { x: object.x, y: object.y };
                object.orbitSystem.setDirectorGravityOrbit(params, objectPosition);
                break;
            }
            case LevelOrbitType.CUSTOM:
                object.orbitSystem.setCircularOrbit(orbitCenter, radius, speed);
                break;
            default:
                object.orbitSystem.setCircularOrbit(orbitCenter, radius, speed);
                break;
        }
        object.orbitSystem.orbitAngle = angle;
    }
}

export class LevelRules {
    constructor(rulesDefinition = {}) {
        this.maxTries = rulesDefinition.maxTries ?? null;
        this.timeLimit = rulesDefinition.timeLimit ?? null;
        this.scoreMultiplier = rulesDefinition.scoreMultiplier ?? LEVEL_DEFAULTS.rules.scoreMultiplier;
        this.gravitationalConstant = rulesDefinition.gravitationalConstant ?? GRAVITATIONAL_CONSTANT;
        this.customBehaviors = rulesDefinition.customBehaviors ?? [];
        this.requiredBonuses = rulesDefinition.requiredBonuses ?? null;
        this.allowedMisses = rulesDefinition.allowedMisses ?? null;
    }
    applyToGame(game) {
        game.physics.gravitationalConstant = this.gravitationalConstant;
        game.levelRules = this;
    }
    checkVictoryConditions(game) {
        const failure = evaluateVictoryRules({ rules: this, bonuses: game.bonuses.map(bonus => ({ collected: bonus.state === 'Hit' })) });
        return failure ? { canProgress: false, reason: failure.reason } : { canProgress: true, reason: null };
    }
    checkFailureConditions(game) {
        const failure = evaluateFailureRules({ rules: this, counters: { tries: game.tries, planetCollisions: game.planetCollisions } });
        return failure ? { failed: true, reason: failure.reason } : { failed: false, reason: null };
    }
}

export class LevelLoader {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
        this.levels = new Map();
        this.validationResults = new Map();
        this.activeCollection = 'shipped';
        this.maximumSelectableLevel = LEVEL_CATALOG_CONFIG.maxGeneratedLevel;
    }
    validateDefinition(levelDefinition) { return validateLevelDefinition(levelDefinition); }
    assertLevelValid(levelNumber) {
        const levelDefinition = this.levels.get(levelNumber);
        if (!levelDefinition) return null;
        const validation = assertValidLevelDefinition(levelDefinition, `level ${levelNumber}`);
        this.validationResults.set(levelNumber, validation);
        return validation;
    }
    async loadDefaultLevels() {
        for (let i = LEVEL_CATALOG_CONFIG.firstLevel; i <= TOTAL_LEVELS; i++) await this.tryLoadLevelFile(i, builtInLevelPath(i));
    }
    async loadCollection(collectionId) {
        const collection = LEVEL_COLLECTION_CONFIG[collectionId];
        if (!collection) throw new Error(`Unknown level collection "${collectionId}"`);
        const levels = new Map();
        const validationResults = new Map();
        for (let level = collection.firstLevel; level <= collection.levelCount; level++) {
            const path = levelCollectionPath(collectionId, level);
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
            const definition = await response.json();
            const validation = validateLevelDefinition(definition);
            if (!validation.valid) throw new Error(`Level validation failed:\n${formatLevelDiagnostics(validation, path)}`);
            levels.set(level, definition);
            validationResults.set(level, validation);
        }
        this.levels = levels;
        this.validationResults = validationResults;
        this.activeCollection = collectionId;
        this.maximumSelectableLevel = collection.maximumSelectableLevel;
        return true;
    }
    formatLevelSelector(levelNumber) { return formatLevelSelector(this.activeCollection, levelNumber); }
    async tryLoadLevelFile(levelNumber, filePath) {
        try { await this.loadLevelFromFile(levelNumber, filePath); } catch (error) { plog.warn(`Level file ${filePath} not found, using fallback generation`); }
    }
    async loadLevelFromFile(levelNumber, filePath) {
        try {
            const response = await fetch(filePath, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
            const levelData = await response.json();
            const validation = validateLevelDefinition(levelData);
            this.validationResults.set(levelNumber, validation);
            if (!validation.valid) throw new Error(`Level validation failed:\n${formatLevelDiagnostics(validation, filePath)}`);
            this.levels.set(levelNumber, levelData);
            return true;
        } catch (error) {
            plog.error(`Failed to load level ${levelNumber} from ${filePath}:`, error);
            return false;
        }
    }
    loadLevel(levelNumber, game) {
        const levelDefinition = this.levels.get(levelNumber);
        if (!levelDefinition) return this.generateRandomLevel(levelNumber, game);
        this.assertLevelValid(levelNumber);
        game.levelMetadata = { name: levelDefinition.name || `Custom Level ${levelNumber}`, description: levelDefinition.description ?? '' };
        game.stageRect = { ...(levelDefinition.bounds?.stage || { x: 0, y: 0, width: WORLD_CONFIG.stage.width, height: WORLD_CONFIG.stage.height }) };
        game.flightRect = { ...(levelDefinition.bounds?.flight || WORLD_CONFIG.flightBounds) };
        game.cameraConfig = levelDefinition.camera ? { ...levelDefinition.camera, mode: levelDefinition.camera.mode.trim().toLowerCase() } : null;
        game.arrow?.setFlightRect(game.flightRect);
        game.gameObjects = [];
        game.planets = [];
        game.bonuses = [];
        game.portals = [];
        game.textObjects = game.textObjects || [];
        game.pointingArrows = game.pointingArrows || [];
        game.physics.clear();
        game.planetCollisions = 0;
        game.simulationTime = 0;
        game._cachedSortedObjects = null;
        game._gameObjectsChanged = true;
        game.textObjects.length = 0;
        game.pointingArrows.length = 0;
        const startPos = levelDefinition.startPosition || WORLD_CONFIG.defaultStartPosition;
        game.penguin = new Penguin(this.assetLoader);
        game.penguin.setPosition(startPos.x, startPos.y);
        game.addGameObject(game.penguin);
        const slingshotDef = levelDefinition.objects?.find(obj => normalizeLevelObjectType(obj.type) === LevelObjectType.SLINGSHOT);
        if (slingshotDef) game.slingshot = GameObjectFactory.create(slingshotDef, this.assetLoader, game);
        else {
            game.slingshot = new Slingshot(startPos.x, startPos.y, startPos.x, startPos.y, LEVEL_DEFAULTS.slingshot.maxPullback);
            game.slingshot.minPullback = LEVEL_DEFAULTS.slingshot.minPullback;
            game.slingshot.velocityMultiplier = LEVEL_DEFAULTS.slingshot.velocityMultiplier;
        }
        game.slingshot.setPenguin(game.penguin);
        game.addGameObject(game.slingshot);
        const targetDef = levelDefinition.objects?.find(obj => normalizeLevelObjectType(obj.type) === LevelObjectType.TARGET);
        if (targetDef) game.target = GameObjectFactory.create(targetDef, this.assetLoader, game);
        else {
            const targetPos = levelDefinition.targetPosition || WORLD_CONFIG.defaultTargetPosition;
            game.target = new Target(targetPos.x, targetPos.y, LEVEL_DEFAULTS.target.width, LEVEL_DEFAULTS.target.height, LEVEL_DEFAULTS.target.spriteType, this.assetLoader);
        }
        game.addGameObject(game.target);
        const gameObjectMap = new Map();
        const gameObjectLookup = id => gameObjectMap.get(id);
        const objectsToOrbit = [];
        const typeCounters = {};
        for (const objectDef of (levelDefinition.objects || [])) {
            const objectType = normalizeLevelObjectType(objectDef.type);
            if (objectType === LevelObjectType.SLINGSHOT || objectType === LevelObjectType.TARGET) continue;
            const gameObject = GameObjectFactory.create(objectDef, this.assetLoader, game, gameObjectLookup);
            if (!gameObject) continue;
            if (!gameObject.id) {
                typeCounters[objectType] = (typeCounters[objectType] || 0) + 1;
                gameObject.id = `${objectType}_${typeCounters[objectType]}`;
            }
            const lookupId = objectDef.properties?.id || gameObject.id;
            gameObjectMap.set(gameObject.id, gameObject);
            if (lookupId !== gameObject.id) gameObjectMap.set(lookupId, gameObject);
            const tempOrbit = objectDef.properties?.orbit;
            if (tempOrbit) objectsToOrbit.push({ gameObject, orbit: tempOrbit });
            game.addGameObject(gameObject);
            if (gameObject instanceof Planet) {
                game.planets.push(gameObject);
                game.physics.addPlanet(gameObject);
            } else if (gameObject instanceof Bonus) {
                game.bonuses.push(gameObject);
                game.physics.addBonus(gameObject);
            } else if (gameObject instanceof TextObject) game.textObjects.push(gameObject);
            else if (gameObject instanceof PointingArrow) game.pointingArrows.push(gameObject);
            else if (gameObject instanceof Portal) game.portals.push(gameObject);
        }
        if (targetDef && targetDef.properties?.orbit) objectsToOrbit.push({ gameObject: game.target, orbit: targetDef.properties.orbit });
        for (const { gameObject, orbit } of objectsToOrbit) GameObjectFactory.applyOrbitToObject(gameObject, orbit, gameObjectLookup);
        new LevelRules(levelDefinition.rules).applyToGame(game);
        game.tries = 0;
        game.distance = 0;
        if (typeof game.setState === 'function') game.setState(GameState.PLAYING);
        else game.state = GameState.PLAYING;
        game.resetWorldCamera?.();
        plog.level(`Level ${levelNumber} loaded: ${game.planets.length} gravity sources, ${game.bonuses.length} bonuses`);
        return levelDefinition;
    }
    generateRandomLevel(levelNumber, game) {
        const generator = LEVEL_GENERATOR_CONFIG;
        const numPlanets = Math.min(generator.planets.baseCount + levelNumber * generator.planets.perLevel, generator.planets.maximumCount);
        const numBonuses = Math.min(levelNumber * generator.bonuses.perLevel, generator.bonuses.maximumCount);
        const levelDefinition = {
            name: `Generated Level ${levelNumber}`,
            description: `Randomly generated level with ${numPlanets} planets and ${numBonuses} bonuses`,
            startPosition: { ...WORLD_CONFIG.defaultStartPosition },
            targetPosition: { ...WORLD_CONFIG.defaultTargetPosition },
            objects: [],
            rules: { scoreMultiplier: generator.scoreMultiplierBase + (levelNumber - LEVEL_CATALOG_CONFIG.firstLevel) * generator.scoreMultiplierPerLevel }
        };
        const planetTypes = Planet.planetTypes;
        for (let i = 0; i < numPlanets; i++) {
            levelDefinition.objects.push({ type: LevelObjectType.PLANET, position: { x: Utils.random(...generator.planets.xRange), y: Utils.random(...generator.planets.yRange) }, properties: { radius: Utils.random(...generator.planets.radiusRange), mass: Utils.random(...generator.planets.massRange), gravitationalReach: PHYSICS_CONFIG.defaultGravitationalReach, planetType: planetTypes[i % planetTypes.length] } });
        }
        for (let i = 0; i < numBonuses; i++) {
            levelDefinition.objects.push({ type: LevelObjectType.BONUS, position: { x: Utils.random(...generator.bonuses.xRange), y: Utils.random(...generator.bonuses.yRange) }, properties: { value: Utils.randomInt(...generator.bonuses.valueRange) } });
        }
        this.levels.set(levelNumber, levelDefinition);
        return this.loadLevel(levelNumber, game);
    }
}
