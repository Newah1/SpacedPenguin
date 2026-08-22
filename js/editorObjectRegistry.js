import { BlackHole } from './blackHole.js';

const DEFINITIONS = {
    Planet: {
        editable: true,
        collections: ['planets'],
        physicsAdd: 'addPlanet',
        physicsRemove: 'removePlanet'
    },
    BlackHole: {
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
    Portal: {
        editable: true,
        collections: ['portals']
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
    // BlackHole lives in its own module instead of gameObjects.js. Register it
    // lazily here so every editor creation surface (toolbar/context menu) sees
    // the same class without duplicating editor-only wiring in Game.
    gameObjectClasses.BlackHole ??= BlackHole;

    return Object.keys(gameObjectClasses)
        .filter(className => getEditorObjectDefinition(className).editable)
        .sort();
}
