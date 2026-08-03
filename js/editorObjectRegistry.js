const DEFINITIONS = {
    Planet: {
        editable: true,
        collections: ['planets'],
        physicsAdd: 'addPlanet',
        physicsRemove: 'removePlanet'
    },
    Bonus: {
        editable: true,
        collections: ['bonuses'],
        physicsAdd: 'addBonus',
        physicsRemove: 'removeBonus'
    },
    Target: {
        editable: true,
        singleton: 'target'
    },
    Slingshot: {
        editable: true,
        singleton: 'slingshot'
    },
    TextObject: {
        editable: true,
        collections: ['textObjects']
    },
    PointingArrow: {
        editable: true,
        collections: ['pointingArrows']
    },
    Penguin: {
        editable: false,
        singleton: 'penguin'
    },
    BonusPopup: { editable: false },
    Arrow: { editable: false, singleton: 'arrow' }
};

export const EDITOR_OBJECT_DEFINITIONS = Object.freeze(
    Object.fromEntries(
        Object.entries(DEFINITIONS).map(([className, definition]) => [
            className,
            Object.freeze({ collections: [], ...definition })
        ])
    )
);

export function getEditorObjectDefinition(className) {
    return EDITOR_OBJECT_DEFINITIONS[className] ?? Object.freeze({
        editable: false,
        collections: []
    });
}

export function getEditableClassNames(gameObjectClasses = {}) {
    return Object.keys(gameObjectClasses)
        .filter(className => getEditorObjectDefinition(className).editable)
        .sort();
}
