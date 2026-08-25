// Level Loading System for Spaced Penguin
// Supports JSON-based level definitions with object factories and custom rules

import { Planet, OrbitSystem } from './gameObjects.js';
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
import {
    LEVEL_ROLE_GAME_OBJECT_DEFINITIONS,
    getGameObjectDefinition
} from './gameObjectRegistry.js';
import RuntimeObjectMembership from './runtimeObjectMembership.js';
import { RUNTIME_CONSTRUCTOR_CATALOG } from './runtimeConstructorCatalog.js';

export class GameObjectFactory {
    static create(objectDefinition, assetLoader, game, gameObjectLookup = null) {
        const normalizedDefinition = normalizeLevelObjectDefinition(objectDefinition);
        let { type, position, properties = {} } = normalizedDefinition;
        
        if (!position && properties.x !== undefined && properties.y !== undefined) {
            position = { x: properties.x, y: properties.y };
        }
        
        if (!position) {
            plog.error('Object creation failed: missing position', {
                type, position, properties, objectDefinition: normalizedDefinition
            });
            return null;
        }
        
        const creator = getGameObjectDefinition(type).createRuntime;
        if (!creator) {
            plog.warn(`Unknown object type: ${type}`);
            return null;
        }
        const gameObject = creator({
            constructors: RUNTIME_CONSTRUCTOR_CATALOG,
            position,
            properties,
            assetLoader,
            game,
            gameObjectLookup,
            applyOrbit: (object, orbit, lookup) => this.applyOrbitToObject(object, orbit, lookup),
            schedule: (callback, delay) => setTimeout(callback, delay)
        });

        if (gameObject && properties.id != null) gameObject.id = properties.id;
        return gameObject;
    }
    
    static applyOrbitToObject(object, orbitConfig, gameObjectLookup = null) {
        const normalized = normalizeOrbitDefinition(orbitConfig);
        const { center, targetId, speed, radius, type, angle, params } = normalized;
        if (!targetId && (!center || (center.x === 0 && center.y === 0 && radius === 0))) return;
        if (!object.orbitSystem) {
            object.orbitSystem = new OrbitSystem(gameObjectLookup);
        }
        if (gameObjectLookup) object.orbitSystem.gameObjectLookup = gameObjectLookup;
        this.configureOrbitSystem(object, center, targetId, speed, radius, type, angle, params);
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
        const membership = new RuntimeObjectMembership(game);
        membership.resetLevelObjects();
        game.planetCollisions = 0;
        game.simulationTime = 0;
        const startPos = levelDefinition.startPosition || WORLD_CONFIG.defaultStartPosition;
        game.penguin = new Penguin(this.assetLoader);
        game.penguin.setPosition(startPos.x, startPos.y);
        game.addGameObject(game.penguin);
        const gameObjectMap = new Map();
        const gameObjectLookup = id => gameObjectMap.get(id);
        const objectsToOrbit = [];
        const typeCounters = {};
        for (const descriptor of LEVEL_ROLE_GAME_OBJECT_DEFINITIONS) {
            const authoredDefinition = levelDefinition.objects?.find(object =>
                normalizeLevelObjectType(object.type) === descriptor.type
            );
            const definition = authoredDefinition || descriptor.createFallbackDefinition?.({
                levelDefinition,
                startPosition: startPos,
                targetPosition: levelDefinition.targetPosition || WORLD_CONFIG.defaultTargetPosition,
                game
            });
            const object = GameObjectFactory.create(
                definition, this.assetLoader, game, gameObjectLookup
            );
            if (!object || !membership.add(object, descriptor)) continue;
            descriptor.afterLevelAdd?.({ object, game, levelDefinition });
            if (authoredDefinition?.properties?.orbit) {
                objectsToOrbit.push({ gameObject: object, orbit: authoredDefinition.properties.orbit });
            }
        }
        for (const objectDef of (levelDefinition.objects || [])) {
            const objectType = normalizeLevelObjectType(objectDef.type);
            if (getGameObjectDefinition(objectType).levelRole) continue;
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
            membership.add(gameObject, objectType);
        }
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
