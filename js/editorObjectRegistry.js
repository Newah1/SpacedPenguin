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

const BASE_DEFINITIONS = {
    Planet: {
        label: 'Planet', editable: true, collections: ['planets'],
        physicsAdd: 'addPlanet', physicsRemove: 'removePlanet'
    },
    BlackHole: {
        label: 'Black Hole', editable: true, collections: ['planets'],
        physicsAdd: 'addPlanet', physicsRemove: 'removePlanet'
    },
    Bonus: {
        label: 'Bonus', editable: true, collections: ['bonuses'],
        physicsAdd: 'addBonus', physicsRemove: 'removeBonus'
    },
    Target: { label: 'Target', editable: true, singleton: 'target' },
    Slingshot: { label: 'Slingshot', editable: true, singleton: 'slingshot' },
    TextObject: { label: 'Text', editable: true, collections: ['textObjects'] },
    PointingArrow: { label: 'Pointing Arrow', editable: true, collections: ['pointingArrows'] },
    Portal: { label: 'Portal Pair', editable: true, collections: ['portals'] },
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
