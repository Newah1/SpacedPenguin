import {
    CLASS_SERIALIZED_OBJECT_PROPERTIES,
    EDITOR_OBJECT_SPRITE_DEFAULTS,
    OBJECT_PROPERTY_FIELDS
} from './config/editorInspectorConfig.js';
import {
    LevelObjectType,
    LEVEL_OBJECT_TYPE_BY_CLASS_NAME,
    ORBIT_LOOKUP_TARGET_TYPES,
    ORBIT_SOURCE_TYPES,
    normalizeLevelObjectType
} from './levelSchema.js';
import { EDITOR_CONFIG } from './config/editorConfig.js';
import { LEVEL_DEFAULTS } from './config/gameConfig.js';

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

const BASE_DEFINITIONS = {
    Planet: {
        label: 'Planet', editable: true, collections: ['planets'],
        physicsAdd: 'addPlanet', physicsRemove: 'removePlanet',
        createRuntime: createPlanetRuntime
    },
    BlackHole: {
        label: 'Black Hole', editable: true, collections: ['planets'],
        physicsAdd: 'addPlanet', physicsRemove: 'removePlanet',
        createRuntime: createBlackHoleRuntime
    },
    Bonus: {
        label: 'Bonus', editable: true, collections: ['bonuses'],
        physicsAdd: 'addBonus', physicsRemove: 'removeBonus',
        createRuntime: createBonusRuntime
    },
    Target: {
        label: 'Target', editable: true, singleton: 'target',
        createRuntime: createTargetRuntime
    },
    Slingshot: {
        label: 'Slingshot', editable: true, singleton: 'slingshot',
        createRuntime: createSlingshotRuntime
    },
    TextObject: {
        label: 'Text', editable: true, collections: ['textObjects'],
        createRuntime: createTextRuntime
    },
    PointingArrow: {
        label: 'Pointing Arrow', editable: true, collections: ['pointingArrows'],
        createRuntime: createPointingArrowRuntime
    },
    Portal: {
        label: 'Portal Pair', editable: true, collections: ['portals'],
        createAuthoringDefinitions: createPortalPairDefinitions,
        createRuntime: createPortalRuntime
    },
    Penguin: { label: 'Penguin', editable: false, singleton: 'penguin' },
    BonusPopup: { label: 'Bonus Popup', editable: false },
    Arrow: { label: 'Launch Arrow', editable: false, singleton: 'arrow' }
};

function definitionFor(className, base) {
    const type = LEVEL_OBJECT_TYPE_BY_CLASS_NAME[className] ?? null;
    const editable = Boolean(base.editable);
    return Object.freeze({
        className,
        type,
        label: base.label || className,
        editable,
        collections: Object.freeze([...(base.collections || [])]),
        physicsAdd: base.physicsAdd,
        physicsRemove: base.physicsRemove,
        singleton: base.singleton,
        properties: Object.freeze([...(OBJECT_PROPERTY_FIELDS[className] || [])]),
        serializedProperties: Object.freeze([...(CLASS_SERIALIZED_OBJECT_PROPERTIES[className] || [])]),
        spriteDefault: EDITOR_OBJECT_SPRITE_DEFAULTS[className] || null,
        createRuntime: base.createRuntime || null,
        createAuthoringDefinitions: base.createAuthoringDefinitions ||
            (SINGLE_AUTHORING_FACTORIES[className]
                ? context => [SINGLE_AUTHORING_FACTORIES[className](context)]
                : null),
        capabilities: Object.freeze({
            create: editable,
            clone: editable && !base.singleton,
            delete: editable,
            orbitSource: Boolean(type && ORBIT_SOURCE_TYPES.includes(type)),
            orbitTarget: Boolean(type && ORBIT_LOOKUP_TARGET_TYPES.includes(type))
        }),
        actions: Object.freeze([
            ...(editable && !base.singleton ? ['clone'] : []),
            ...(editable ? ['center', 'delete'] : [])
        ])
    });
}

export const EDITOR_OBJECT_DEFINITIONS = Object.freeze(
    Object.fromEntries(
        Object.entries(BASE_DEFINITIONS).map(([className, base]) => [
            className,
            definitionFor(className, base)
        ])
    )
);

export const EDITOR_OBJECT_DEFINITIONS_BY_TYPE = Object.freeze(
    Object.fromEntries(
        Object.values(EDITOR_OBJECT_DEFINITIONS)
            .filter(definition => definition.type)
            .map(definition => [definition.type, definition])
    )
);

const UNKNOWN_DEFINITION = Object.freeze({
    className: null,
    type: null,
    label: 'Object',
    editable: false,
    collections: Object.freeze([]),
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

export function getEditorObjectDefinition(classNameOrType) {
    if (EDITOR_OBJECT_DEFINITIONS[classNameOrType]) return EDITOR_OBJECT_DEFINITIONS[classNameOrType];
    const type = normalizeLevelObjectType(classNameOrType);
    return EDITOR_OBJECT_DEFINITIONS_BY_TYPE[type] ?? UNKNOWN_DEFINITION;
}

export function getEditableClassNames(gameObjectClasses = {}) {
    return Object.keys(gameObjectClasses)
        .filter(className => getEditorObjectDefinition(className).editable)
        .sort();
}

export function getEditableLevelTypes() {
    return Object.values(EDITOR_OBJECT_DEFINITIONS_BY_TYPE)
        .filter(definition => definition.editable && definition.type !== LevelObjectType.PENGUIN)
        .map(definition => definition.type);
}
