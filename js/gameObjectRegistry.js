import { EDITOR_CONFIG } from './config/editorConfig.js';
import { LEVEL_DEFAULTS } from './config/gameConfig.js';

export const LevelObjectType = Object.freeze({
    PLANET: 'planet',
    BLACK_HOLE: 'blackhole',
    BONUS: 'bonus',
    TARGET: 'target',
    SLINGSHOT: 'slingshot',
    TEXT: 'textobject',
    POINTING_ARROW: 'pointingarrow',
    PORTAL: 'portal',
    SPEED_BOOSTER: 'speedbooster',
    PENGUIN: 'penguin'
});

export const LEVEL_OBJECT_TYPE_ALIASES = Object.freeze({
    text: LevelObjectType.TEXT,
    arrow: LevelObjectType.POINTING_ARROW,
    black_hole: LevelObjectType.BLACK_HOLE
});

export const LEVEL_OBJECT_TYPES = Object.freeze(Object.values(LevelObjectType));
export const LEVEL_OBJECT_TYPE_NAMES = Object.freeze([
    ...LEVEL_OBJECT_TYPES,
    ...Object.keys(LEVEL_OBJECT_TYPE_ALIASES)
]);

export function normalizeLevelObjectType(type) {
    if (typeof type !== 'string') return null;
    const normalized = type.trim().toLowerCase();
    return LEVEL_OBJECT_TYPE_ALIASES[normalized] || normalized;
}

const ORBIT_TARGET_TYPE_SET = new Set([
    LevelObjectType.PLANET, LevelObjectType.BLACK_HOLE, LevelObjectType.BONUS
]);
const ORBIT_SOURCE_TYPE_SET = new Set([
    LevelObjectType.PLANET, LevelObjectType.BLACK_HOLE, LevelObjectType.BONUS,
    LevelObjectType.TARGET
]);

function objectDefinition(type, x, y, properties = {}) {
    return { type, position: { x, y }, properties: { ...properties } };
}

const SINGLE_AUTHORING_FACTORIES = Object.freeze({
    Planet: ({ x, y }) => objectDefinition(LevelObjectType.PLANET, x, y, {
        ...EDITOR_CONFIG.authoringDefaults.planet,
        collisionRadius: EDITOR_CONFIG.authoringDefaults.planet.radius +
            LEVEL_DEFAULTS.planet.collisionPadding
    }),
    BlackHole: ({ x, y }) => objectDefinition(LevelObjectType.BLACK_HOLE, x, y, {
        radius: EDITOR_CONFIG.authoringDefaults.planet.radius,
        mass: EDITOR_CONFIG.authoringDefaults.planet.mass,
        gravitationalReach: EDITOR_CONFIG.authoringDefaults.planet.gravitationalReach
    }),
    Bonus: ({ x, y }) => objectDefinition(LevelObjectType.BONUS, x, y, {
        value: EDITOR_CONFIG.authoringDefaults.bonus.value
    }),
    Target: ({ x, y }) => objectDefinition(LevelObjectType.TARGET, x, y, {
        ...LEVEL_DEFAULTS.target,
        collisionRadius: LEVEL_DEFAULTS.target.width / 2
    }),
    Slingshot: ({ x, y }) => objectDefinition(LevelObjectType.SLINGSHOT, x, y, {
        maxPullback: EDITOR_CONFIG.authoringDefaults.slingshot.maxPullback,
        stretchLimit: EDITOR_CONFIG.authoringDefaults.slingshot.maxPullback,
        velocityMultiplier: LEVEL_DEFAULTS.slingshot.velocityMultiplier,
        minPullback: LEVEL_DEFAULTS.slingshot.minPullback
    }),
    TextObject: ({ x, y }) => objectDefinition(LevelObjectType.TEXT, x, y, LEVEL_DEFAULTS.text),
    PointingArrow: ({ x, y }) => objectDefinition(
        LevelObjectType.POINTING_ARROW, x, y, LEVEL_DEFAULTS.pointingArrow
    ),
    SpeedBooster: ({ x, y }) => objectDefinition(
        LevelObjectType.SPEED_BOOSTER, x, y, LEVEL_DEFAULTS.speedBooster
    )
});

function createPortalPairDefinitions({ x, y, allocatePairNumber }) {
    const number = allocatePairNumber('portal_pair', ['red', 'blue']);
    const redId = `portal_pair_${number}_red`;
    const blueId = `portal_pair_${number}_blue`;
    const offset = Math.max(55, LEVEL_DEFAULTS.portal.width * 1.5);
    return [
        objectDefinition(LevelObjectType.PORTAL, x - offset, y, {
            ...LEVEL_DEFAULTS.portal, id: redId, name: `Portal Pair ${number} Red`,
            color: 'red', pairedPortalId: blueId, rotation: 270
        }),
        objectDefinition(LevelObjectType.PORTAL, x + offset, y, {
            ...LEVEL_DEFAULTS.portal, id: blueId, name: `Portal Pair ${number} Blue`,
            color: 'blue', pairedPortalId: redId, rotation: 90
        })
    ];
}

function clonePortalPairDefinitions({ source, resolveDefinition, allocatePairNumber }) {
    const pair = resolveDefinition(source.properties?.pairedPortalId);
    if (!pair) return [];
    const byColor = new Map([source, pair].map(definition => [definition.properties.color, definition]));
    const number = allocatePairNumber('portal_pair', ['red', 'blue']);
    const redId = `portal_pair_${number}_red`;
    const blueId = `portal_pair_${number}_blue`;
    const cloneEndpoint = (color, id, pairedPortalId) => {
        const clone = structuredClone(byColor.get(color));
        clone.position.x += EDITOR_CONFIG.cloneOffset.x;
        clone.position.y += EDITOR_CONFIG.cloneOffset.y;
        Object.assign(clone.properties, {
            id,
            pairedPortalId,
            name: `Portal Pair ${number} ${color === 'red' ? 'Red' : 'Blue'}`
        });
        return clone;
    };
    return [cloneEndpoint('red', redId, blueId), cloneEndpoint('blue', blueId, redId)];
}

function applyTextRuntimeProperty({ object, property, value }) {
    if (property === 'content') {
        object.content = value;
        object.parsedContent = object.parseHTMLContent(value);
        return true;
    }
    if (property === 'width') {
        object.width = value;
        object.maxWidth = Math.max(1, value - object.padding * 2);
        return true;
    }
    return false;
}

function applyPlanetRuntimeProperty({ object, property, value, editor }) {
    if (property === 'planetType') {
        object.planetType = value;
        editor.refreshPlanetSprite(object);
        return true;
    }
    if (property === 'width' || property === 'height') {
        object[property] = value;
        object.radius = Math.min(object.width, object.height) / 2;
        return true;
    }
    return false;
}

function applyTargetRuntimeProperty({ object, property, value, editor }) {
    if (property !== 'spriteType') return false;
    object.spriteType = value;
    editor.refreshTargetSprite(object);
    return true;
}

function applyPointingArrowRuntimeProperty({ object, property, value }) {
    if (property !== 'pointingAtX' && property !== 'pointingAtY') return false;
    object.pointingAt ||= { x: 0, y: 0 };
    object.pointingAt[property === 'pointingAtX' ? 'x' : 'y'] = value;
    if (object.pointingAt.x !== 0 || object.pointingAt.y !== 0) object.visible = true;
    return true;
}

function refreshGravityRuntime({ object, editor }) {
    editor.game.physics?.refreshPlanet?.(object);
}

function refreshPlanetRuntime(context) {
    refreshGravityRuntime(context);
    context.editor.refreshPlanetSprite(context.object);
}

function refreshTargetRuntime({ object, editor }) {
    editor.refreshTargetSprite(object);
}

function applyCommonRuntimeProperties(object, properties, applyOrbit, gameObjectLookup) {
    if (properties.name) object.name = properties.name;
    if (properties.id) object.id = properties.id;
    if (properties.orbit) applyOrbit(object, properties.orbit, gameObjectLookup);
    return object;
}

function createPlanetRuntime({ constructors, position, properties, assetLoader, gameObjectLookup, applyOrbit }) {
    const radius = properties.radius ?? LEVEL_DEFAULTS.planet.radius;
    const planet = new constructors.Planet(
        position.x, position.y, radius,
        properties.mass ?? LEVEL_DEFAULTS.planet.mass,
        properties.gravitationalReach ?? LEVEL_DEFAULTS.planet.gravitationalReach,
        properties.planetType ?? null,
        assetLoader,
        gameObjectLookup
    );
    planet.collisionRadius = properties.collisionRadius ??
        radius + LEVEL_DEFAULTS.planet.collisionPadding;
    return applyCommonRuntimeProperties(planet, properties, applyOrbit, gameObjectLookup);
}

function createBlackHoleRuntime({ constructors, position, properties, gameObjectLookup, applyOrbit }) {
    return applyCommonRuntimeProperties(new constructors.BlackHole(
        position.x, position.y,
        properties.radius ?? LEVEL_DEFAULTS.planet.radius,
        properties.mass ?? LEVEL_DEFAULTS.planet.mass,
        properties.gravitationalReach ?? LEVEL_DEFAULTS.planet.gravitationalReach,
        gameObjectLookup
    ), properties, applyOrbit, gameObjectLookup);
}

function createBonusRuntime({ constructors, position, properties, assetLoader, gameObjectLookup, applyOrbit }) {
    return applyCommonRuntimeProperties(new constructors.Bonus(
        position.x, position.y,
        properties.value ?? LEVEL_DEFAULTS.bonus.value,
        assetLoader,
        gameObjectLookup
    ), properties, applyOrbit, gameObjectLookup);
}

function createTargetRuntime({ constructors, position, properties, assetLoader, gameObjectLookup, applyOrbit }) {
    const width = properties.width ?? LEVEL_DEFAULTS.target.width;
    const target = new constructors.Target(
        position.x, position.y, width,
        properties.height ?? LEVEL_DEFAULTS.target.height,
        properties.spriteType ?? LEVEL_DEFAULTS.target.spriteType,
        assetLoader,
        gameObjectLookup
    );
    target.collisionRadius = properties.collisionRadius ?? width / 2;
    return applyCommonRuntimeProperties(target, properties, applyOrbit, gameObjectLookup);
}

function createSlingshotRuntime({ constructors, position, properties, applyOrbit }) {
    const anchorX = properties.anchorX ?? properties.anchorPosition?.x ?? position.x;
    const anchorY = properties.anchorY ?? properties.anchorPosition?.y ?? position.y;
    const stretchLimit = properties.stretchLimit ?? properties.maxPullback ??
        LEVEL_DEFAULTS.slingshot.maxPullback;
    const slingshot = new constructors.Slingshot(position.x, position.y, anchorX, anchorY, stretchLimit);
    slingshot.velocityMultiplier = properties.velocityMultiplier ?? LEVEL_DEFAULTS.slingshot.velocityMultiplier;
    slingshot.minPullback = properties.minPullback ?? LEVEL_DEFAULTS.slingshot.minPullback;
    slingshot.launchModel = properties.launchModel ?? 'modern';
    slingshot.sourceFrameRate = properties.sourceFrameRate ?? null;
    slingshot.coordinateScale = properties.coordinateScale ?? 1;
    return applyCommonRuntimeProperties(slingshot, properties, applyOrbit, null);
}

function createTextRuntime({ constructors, position, properties, applyOrbit, schedule }) {
    const options = Object.fromEntries([
        'width', 'height', 'visible', 'textAlign', 'fontSize', 'fontFamily', 'color',
        'backgroundColor', 'padding', 'maxWidth', 'autoSize', 'fadeIn',
        'fadeInDuration', 'renderOrder'
    ].map(key => [key, properties[key] ?? LEVEL_DEFAULTS.text[key]]));
    const text = applyCommonRuntimeProperties(new constructors.TextObject(
        position.x, position.y,
        properties.content ?? LEVEL_DEFAULTS.text.content,
        options
    ), properties, applyOrbit, null);
    if (properties.showAfterDelay) {
        text.visible = false;
        schedule(() => text.show(properties.fadeIn), properties.showAfterDelay * 1000);
    }
    return text;
}

function createPointingArrowRuntime({ constructors, position, properties, applyOrbit, schedule }) {
    const options = Object.fromEntries([
        'color', 'glowColor', 'baseWidth', 'scaleWithDistance', 'maxDistance',
        'minWidth', 'maxWidth', 'pulseSpeed', 'minAlpha', 'maxAlpha', 'renderOrder'
    ].map(key => [key, properties[key] ?? LEVEL_DEFAULTS.pointingArrow[key]]));
    const arrow = applyCommonRuntimeProperties(
        new constructors.PointingArrow(position.x, position.y, options),
        properties,
        applyOrbit,
        null
    );
    if (properties.pointingAt) arrow.pointTo(properties.pointingAt);
    if (properties.pointAfterDelay && properties.pointingAt) {
        arrow.visible = false;
        schedule(() => {
            arrow.pointTo(properties.pointingAt);
            arrow.visible = true;
        }, properties.pointAfterDelay * 1000);
    }
    return arrow;
}

function createPortalRuntime({ constructors, position, properties }) {
    const portal = new constructors.Portal(position.x, position.y, properties);
    portal.id = properties.id ?? null;
    portal.name = properties.name ?? '';
    return portal;
}

function createSpeedBoosterRuntime({ constructors, position, properties }) {
    const speedBooster = new constructors.SpeedBooster(position.x, position.y, properties);
    speedBooster.id = properties.id ?? null;
    speedBooster.name = properties.name ?? '';
    return speedBooster;
}

function validateGravityProperties({ type, properties, propertyPath, collector, helpers }) {
    helpers.optionalNumber(properties.radius, `${propertyPath}.radius`, collector, { exclusiveMin: 0 });
    helpers.optionalNumber(properties.mass, `${propertyPath}.mass`, collector, { min: 0 });
    helpers.optionalNumber(properties.gravitationalReach, `${propertyPath}.gravitationalReach`, collector, { min: 0 });
    if (type === LevelObjectType.PLANET) {
        helpers.optionalNumber(properties.collisionRadius, `${propertyPath}.collisionRadius`, collector, { exclusiveMin: 0 });
        return;
    }
    if (properties.collisionRadius !== undefined && properties.collisionRadius !== 0) {
        collector.error('BLACK_HOLE_COLLISION_RADIUS', `${propertyPath}.collisionRadius`, 'must be 0 because black holes are non-collidable');
    }
    if (properties.collidable !== undefined && properties.collidable !== false) {
        collector.error('BLACK_HOLE_COLLIDABLE', `${propertyPath}.collidable`, 'must be false because black holes are non-collidable');
    }
}

function validateBonusProperties({ properties, propertyPath, collector, helpers }) {
    helpers.optionalNumber(properties.value, `${propertyPath}.value`, collector, { min: 0 });
}

function validateTargetProperties({ properties, propertyPath, collector, helpers }) {
    for (const key of ['width', 'height', 'collisionRadius']) {
        helpers.optionalNumber(properties[key], `${propertyPath}.${key}`, collector, { exclusiveMin: 0 });
    }
}

function validateSlingshotProperties({ properties, propertyPath, collector, helpers }) {
    helpers.optionalNumber(properties.velocityMultiplier, `${propertyPath}.velocityMultiplier`, collector, { exclusiveMin: 0 });
    helpers.optionalNumber(properties.maxPullback, `${propertyPath}.maxPullback`, collector, { exclusiveMin: 0 });
    helpers.optionalNumber(properties.minPullback, `${propertyPath}.minPullback`, collector, { min: 0 });
    helpers.optionalNumber(properties.stretchLimit, `${propertyPath}.stretchLimit`, collector, { exclusiveMin: 0 });
    if (properties.anchorPosition !== undefined) helpers.point(properties.anchorPosition, `${propertyPath}.anchorPosition`, collector);
    if (properties.launchModel !== undefined && !['modern', 'director'].includes(properties.launchModel)) {
        collector.error('LAUNCH_MODEL_UNKNOWN', `${propertyPath}.launchModel`, 'must be "modern" or "director"');
    }
    helpers.optionalNumber(properties.sourceFrameRate, `${propertyPath}.sourceFrameRate`, collector, { exclusiveMin: 0 });
    helpers.optionalNumber(properties.coordinateScale, `${propertyPath}.coordinateScale`, collector, { exclusiveMin: 0 });
}

function validatePortalProperties({ properties, propertyPath, collector, helpers }) {
    helpers.optionalNumber(properties.width, `${propertyPath}.width`, collector, { exclusiveMin: 0 });
    helpers.optionalNumber(properties.height, `${propertyPath}.height`, collector, { exclusiveMin: 0 });
    helpers.optionalNumber(properties.rotation, `${propertyPath}.rotation`, collector);
    if (properties.color !== undefined && !['red', 'blue'].includes(properties.color)) {
        collector.error('PORTAL_COLOR', `${propertyPath}.color`, 'must be "red" or "blue"');
    }
    if (properties.pairedPortalId !== undefined &&
        (typeof properties.pairedPortalId !== 'string' || properties.pairedPortalId.trim() === '')) {
        collector.error('PORTAL_PAIR_ID', `${propertyPath}.pairedPortalId`, 'must be a non-empty string');
    }
    if (properties.playSound !== undefined && typeof properties.playSound !== 'boolean') {
        collector.error('PORTAL_SOUND_TYPE', `${propertyPath}.playSound`, 'must be a boolean');
    }
}

function validateSpeedBoosterProperties({ properties, propertyPath, collector, helpers }) {
    helpers.optionalNumber(properties.width, `${propertyPath}.width`, collector, { exclusiveMin: 0 });
    helpers.optionalNumber(properties.height, `${propertyPath}.height`, collector, { exclusiveMin: 0 });
    helpers.optionalNumber(properties.rotation, `${propertyPath}.rotation`, collector);
    helpers.optionalNumber(properties.speedMultiplier, `${propertyPath}.speedMultiplier`, collector, { min: 0 });
    if (properties.playSound !== undefined && typeof properties.playSound !== 'boolean') {
        collector.error('SPEED_BOOSTER_SOUND_TYPE', `${propertyPath}.playSound`, 'must be a boolean');
    }
}

function serializeTextRuntime({ object, properties }) {
    if (object.maxWidth !== undefined) {
        properties.width = object.maxWidth + object.padding * 2;
    }
}

function serializePointingArrowRuntime({ object, properties }) {
    if (object.pointingAt) {
        properties.pointingAt = { x: object.pointingAt.x, y: object.pointingAt.y };
    }
}

const BASE_DEFINITIONS = {
    Planet: {
        type: LevelObjectType.PLANET,
        label: 'Planet', editable: true, collections: ['planets'],
        properties: [
            { key: 'radius', label: 'Radius', type: 'number', min: 1 },
            { key: 'width', label: 'Width', type: 'number', min: 1 },
            { key: 'height', label: 'Height', type: 'number', min: 1 },
            { key: 'mass', label: 'Mass', type: 'number', min: 0 },
            { key: 'collisionRadius', label: 'Collision Radius', type: 'number', min: 1 },
            { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 },
            { key: 'color', label: 'Color', type: 'color' },
            { key: 'planetType', label: 'Planet Sprite', type: 'select', optionsFrom: 'planetSprites' }
        ],
        serializedProperties: ['planetType', 'collisionRadius', 'gravitationalReach', 'color'],
        spriteDefault: { property: 'planetType', value: EDITOR_CONFIG.authoringDefaults.planet.planetType, refreshMethod: 'refreshPlanetSprite' },
        levelDefaults: {
            radius: LEVEL_DEFAULTS.planet.radius, mass: LEVEL_DEFAULTS.planet.mass,
            gravitationalReach: LEVEL_DEFAULTS.planet.gravitationalReach
        },
        physicsAdd: 'addPlanet', physicsRemove: 'removePlanet',
        normalizeProperties(properties) {
            if (properties.collisionRadius == null) {
                properties.collisionRadius = properties.radius + LEVEL_DEFAULTS.planet.collisionPadding;
            }
        },
        validateProperties: validateGravityProperties,
        createRuntime: createPlanetRuntime,
        applyRuntimeProperty: applyPlanetRuntimeProperty,
        afterRuntimePropertyChanged: refreshPlanetRuntime
    },
    BlackHole: {
        type: LevelObjectType.BLACK_HOLE,
        label: 'Black Hole', editable: true, collections: ['planets'],
        properties: [
            { key: 'radius', label: 'Radius', type: 'number', min: 1 },
            { key: 'mass', label: 'Mass', type: 'number', min: 0 },
            { key: 'gravitationalReach', label: 'Gravitational Reach', type: 'number', min: 0 }
        ],
        serializedProperties: ['gravitationalReach', 'collisionRadius', 'collidable'],
        levelDefaults: {
            radius: LEVEL_DEFAULTS.planet.radius, mass: LEVEL_DEFAULTS.planet.mass,
            gravitationalReach: LEVEL_DEFAULTS.planet.gravitationalReach
        },
        physicsAdd: 'addPlanet', physicsRemove: 'removePlanet',
        normalizeProperties(properties) {
            properties.collisionRadius = 0;
            properties.collidable = false;
        },
        validateProperties: validateGravityProperties,
        createRuntime: createBlackHoleRuntime,
        afterRuntimePropertyChanged: refreshGravityRuntime
    },
    Bonus: {
        type: LevelObjectType.BONUS,
        label: 'Bonus', editable: true, collections: ['bonuses'],
        properties: [
            { key: 'width', label: 'Width', type: 'number', min: 1 },
            { key: 'height', label: 'Height', type: 'number', min: 1 },
            { key: 'value', label: 'Value', type: 'number', min: 1 },
            { key: 'rotationSpeed', label: 'Rotation Speed', type: 'number' },
            { key: 'state', label: 'State', type: 'select', options: ['notHit', 'Hit'] }
        ],
        serializedProperties: ['value', 'rotationSpeed', 'state'],
        levelDefaults: {
            value: LEVEL_DEFAULTS.bonus.value, width: LEVEL_DEFAULTS.bonus.width,
            height: LEVEL_DEFAULTS.bonus.height
        },
        physicsAdd: 'addBonus', physicsRemove: 'removeBonus',
        validateProperties: validateBonusProperties,
        createRuntime: createBonusRuntime
    },
    Target: {
        type: LevelObjectType.TARGET,
        label: 'Target', editable: true, singleton: 'target',
        levelRole: 'target',
        createFallbackDefinition: ({ targetPosition }) => objectDefinition(
            LevelObjectType.TARGET,
            targetPosition.x,
            targetPosition.y
        ),
        properties: [
            { key: 'width', label: 'Width', type: 'number', min: 1 },
            { key: 'height', label: 'Height', type: 'number', min: 1 },
            { key: 'spriteType', label: 'Ship Sprite', type: 'select', optionsFrom: 'shipSprites' }
        ],
        serializedProperties: ['spriteType'],
        spriteDefault: { property: 'spriteType', value: LEVEL_DEFAULTS.target.spriteType, refreshMethod: 'refreshTargetSprite' },
        levelDefaults: LEVEL_DEFAULTS.target,
        validateProperties: validateTargetProperties,
        createRuntime: createTargetRuntime,
        applyRuntimeProperty: applyTargetRuntimeProperty,
        afterRuntimePropertyChanged: refreshTargetRuntime
    },
    Slingshot: {
        type: LevelObjectType.SLINGSHOT,
        label: 'Slingshot', editable: true, singleton: 'slingshot',
        levelRole: 'slingshot',
        createFallbackDefinition: ({ startPosition }) => objectDefinition(
            LevelObjectType.SLINGSHOT,
            startPosition.x,
            startPosition.y
        ),
        afterLevelAdd: ({ object, game }) => object.setPenguin(game.penguin),
        properties: [
            { key: 'width', label: 'Width', type: 'number', min: 1 },
            { key: 'height', label: 'Height', type: 'number', min: 1 },
            { key: 'maxPullback', label: 'Max Pullback', type: 'number', min: 10 },
            { key: 'velocityMultiplier', label: 'Velocity Multiplier', type: 'number', min: 1 }
        ],
        serializedProperties: ['maxPullback', 'velocityMultiplier', 'anchorX', 'anchorY'],
        levelDefaults: LEVEL_DEFAULTS.slingshot,
        validateProperties: validateSlingshotProperties,
        createRuntime: createSlingshotRuntime
    },
    TextObject: {
        type: LevelObjectType.TEXT,
        label: 'Text', editable: true, collections: ['textObjects'],
        properties: [
            { key: 'content', label: 'Text Content', type: 'text' },
            { key: 'width', label: 'Width / Wrap Limit', type: 'number', min: 1 },
            { key: 'height', label: 'Height', type: 'number', min: 1 },
            { key: 'fontSize', label: 'Font Size', type: 'number', min: 8, max: 72 },
            { key: 'color', label: 'Color', type: 'color' },
            { key: 'fontFamily', label: 'Font Family', type: 'text' },
            { key: 'textAlign', label: 'Text Align', type: 'select', options: ['left', 'center', 'right'] },
            { key: 'backgroundColor', label: 'Background Color', type: 'color' },
            { key: 'autoSize', label: 'Auto Size', type: 'checkbox' },
            { key: 'visible', label: 'Visible', type: 'checkbox' }
        ],
        serializedProperties: ['content', 'fontSize', 'color', 'fontFamily', 'textAlign', 'backgroundColor', 'padding', 'maxWidth', 'autoSize'],
        levelDefaults: LEVEL_DEFAULTS.text,
        serializeRuntimeProperties: serializeTextRuntime,
        createRuntime: createTextRuntime,
        applyRuntimeProperty: applyTextRuntimeProperty
    },
    PointingArrow: {
        type: LevelObjectType.POINTING_ARROW,
        label: 'Pointing Arrow', editable: true, collections: ['pointingArrows'],
        properties: [
            { key: 'pointingAtX', label: 'Target X', type: 'number' },
            { key: 'pointingAtY', label: 'Target Y', type: 'number' },
            { key: 'width', label: 'Width', type: 'number', min: 1 },
            { key: 'height', label: 'Height', type: 'number', min: 1 },
            { key: 'color', label: 'Color', type: 'color' },
            { key: 'glowColor', label: 'Glow Color', type: 'color' },
            { key: 'baseWidth', label: 'Base Width', type: 'number', min: 10 },
            { key: 'scaleWithDistance', label: 'Scale with Distance', type: 'checkbox' },
            { key: 'visible', label: 'Visible', type: 'checkbox' }
        ],
        serializedProperties: ['pointingAt', 'baseWidth', 'color', 'glowColor', 'scaleWithDistance'],
        levelDefaults: LEVEL_DEFAULTS.pointingArrow,
        serializeRuntimeProperties: serializePointingArrowRuntime,
        createRuntime: createPointingArrowRuntime,
        applyRuntimeProperty: applyPointingArrowRuntimeProperty
    },
    Portal: {
        type: LevelObjectType.PORTAL,
        label: 'Portal Pair', editable: true, collections: ['portals'],
        properties: [
            { key: 'width', label: 'Width', type: 'number', min: 8 },
            { key: 'height', label: 'Height', type: 'number', min: 6 },
            { key: 'playSound', label: 'Play Woosh Sound', type: 'checkbox' }
        ],
        serializedProperties: ['pairedPortalId', 'color', 'playSound'],
        levelDefaults: LEVEL_DEFAULTS.portal,
        validateProperties: validatePortalProperties,
        relationshipValidator: 'portalPair',
        createAuthoringDefinitions: createPortalPairDefinitions,
        cloneAuthoringDefinitions: clonePortalPairDefinitions,
        createRuntime: createPortalRuntime
    },
    SpeedBooster: {
        type: LevelObjectType.SPEED_BOOSTER,
        label: 'Speed Booster', editable: true, collections: ['speedBoosters'],
        properties: [
            { key: 'width', label: 'Width', type: 'number', min: 1 },
            { key: 'height', label: 'Height', type: 'number', min: 1 },
            { key: 'speedMultiplier', label: 'Speed Multiplier', type: 'number', min: 0, step: 0.1 },
            { key: 'playSound', label: 'Play Sound', type: 'checkbox' }
        ],
        serializedProperties: ['speedMultiplier', 'playSound'],
        levelDefaults: LEVEL_DEFAULTS.speedBooster,
        validateProperties: validateSpeedBoosterProperties,
        createRuntime: createSpeedBoosterRuntime
    },
    Penguin: { type: LevelObjectType.PENGUIN, label: 'Penguin', editable: false, singleton: 'penguin' },
    BonusPopup: { label: 'Bonus Popup', editable: false },
    Arrow: { label: 'Launch Arrow', editable: false, singleton: 'arrow' }
};

function definitionFor(className, base) {
    const type = base.type ?? null;
    const editable = Boolean(base.editable);
    return Object.freeze({
        className,
        type,
        label: base.label || className,
        editable,
        exportable: Boolean(type && editable),
        collections: Object.freeze([...(base.collections || [])]),
        levelDefaults: Object.freeze({ ...(base.levelDefaults || {}) }),
        normalizeProperties: base.normalizeProperties || null,
        validateProperties: base.validateProperties || null,
        relationshipValidator: base.relationshipValidator || null,
        levelRole: base.levelRole || null,
        createFallbackDefinition: base.createFallbackDefinition || null,
        afterLevelAdd: base.afterLevelAdd || null,
        physicsAdd: base.physicsAdd,
        physicsRemove: base.physicsRemove,
        singleton: base.singleton,
        properties: Object.freeze([...(base.properties || [])].map(property => Object.freeze({ ...property }))),
        serializedProperties: Object.freeze([...(base.serializedProperties || [])]),
        serializeRuntimeProperties: base.serializeRuntimeProperties || null,
        spriteDefault: base.spriteDefault ? Object.freeze({ ...base.spriteDefault }) : null,
        createRuntime: base.createRuntime || null,
        applyRuntimeProperty: base.applyRuntimeProperty || null,
        afterRuntimePropertyChanged: base.afterRuntimePropertyChanged || null,
        createAuthoringDefinitions: base.createAuthoringDefinitions ||
            (SINGLE_AUTHORING_FACTORIES[className]
                ? context => [SINGLE_AUTHORING_FACTORIES[className](context)]
                : null),
        cloneAuthoringDefinitions: base.cloneAuthoringDefinitions || null,
        capabilities: Object.freeze({
            create: editable,
            clone: editable && !base.singleton,
            delete: editable,
            orbitSource: ORBIT_SOURCE_TYPE_SET.has(type),
            orbitTarget: ORBIT_TARGET_TYPE_SET.has(type)
        }),
        actions: Object.freeze([
            ...(editable && !base.singleton ? ['clone'] : []),
            ...(editable ? ['center', 'delete'] : [])
        ])
    });
}

export const GAME_OBJECT_DEFINITIONS = Object.freeze(
    Object.fromEntries(
        Object.entries(BASE_DEFINITIONS).map(([className, base]) => [
            className,
            definitionFor(className, base)
        ])
    )
);

export const GAME_OBJECT_DEFINITIONS_BY_TYPE = Object.freeze(
    Object.fromEntries(
        Object.values(GAME_OBJECT_DEFINITIONS)
            .filter(definition => definition.type)
            .map(definition => [definition.type, definition])
    )
);

export const LEVEL_OBJECT_TYPE_BY_CLASS_NAME = Object.freeze(
    Object.fromEntries(
        Object.values(GAME_OBJECT_DEFINITIONS)
            .filter(definition => definition.type)
            .map(definition => [definition.className, definition.type])
    )
);

export const LEVEL_ROLE_GAME_OBJECT_DEFINITIONS = Object.freeze(
    Object.values(GAME_OBJECT_DEFINITIONS).filter(definition => definition.levelRole)
);

const UNKNOWN_DEFINITION = Object.freeze({
    className: null,
    type: null,
    label: 'Object',
    editable: false,
    exportable: false,
    collections: Object.freeze([]),
    levelDefaults: Object.freeze({}),
    properties: Object.freeze([]),
    serializedProperties: Object.freeze([]),
    capabilities: Object.freeze({
        create: false, clone: false, delete: false, orbitSource: false, orbitTarget: false
    }),
    actions: Object.freeze([])
});

export const EDITOR_ACTION_DEFINITIONS = Object.freeze({
    clone: Object.freeze({
        label: 'Clone',
        execute: editor => editor.cloneSelected()
    }),
    center: Object.freeze({
        label: 'Center on Canvas',
        execute: editor => editor.centerSelectedObjectOnCanvas()
    }),
    delete: Object.freeze({
        label: 'Delete',
        danger: true,
        execute: editor => editor.deleteSelectedObject()
    })
});

export function getEditorActionDefinition(action) {
    return EDITOR_ACTION_DEFINITIONS[action] ?? null;
}

export function getGameObjectDefinition(classNameOrType) {
    if (GAME_OBJECT_DEFINITIONS[classNameOrType]) return GAME_OBJECT_DEFINITIONS[classNameOrType];
    const type = normalizeLevelObjectType(classNameOrType);
    return GAME_OBJECT_DEFINITIONS_BY_TYPE[type] ?? UNKNOWN_DEFINITION;
}

/** Resolve runtime objects by their stable serialized type before legacy class names. */
export function getGameObjectDefinitionForRuntime(object) {
    if (!object) return UNKNOWN_DEFINITION;
    const stableType = object.levelType ?? object.objectType ?? object.type;
    if (stableType && typeof stableType === 'string') {
        const definition = getGameObjectDefinition(stableType);
        if (definition !== UNKNOWN_DEFINITION) return definition;
    }
    return getGameObjectDefinition(object.constructor?.name);
}

/** Stamp a runtime object with the canonical, serialization-safe type identity. */
export function stampGameObjectType(object, classNameOrType = object?.constructor?.name) {
    if (!object) return object;
    const definition = getGameObjectDefinition(classNameOrType);
    if (definition.type) object.levelType = definition.type;
    return object;
}

export function listEditableRuntimeClassNames(gameObjectClasses = {}) {
    return Object.keys(gameObjectClasses)
        .filter(className => getGameObjectDefinition(className).editable)
        .sort();
}

export function listEditableLevelObjectTypes() {
    return Object.values(GAME_OBJECT_DEFINITIONS_BY_TYPE)
        .filter(definition => definition.editable && definition.type !== LevelObjectType.PENGUIN)
        .map(definition => definition.type);
}
