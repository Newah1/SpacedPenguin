import * as coreGameObjects from './gameObjects.js';
import * as blackHoleObjects from './blackHole.js';
import * as penguinObjects from './penguin.js';

// Browser-only runtime composition. The domain registry remains safe to import
// from Node, while runtime classes exported by a composed module are discovered
// without another per-class entry in LevelLoader.
const RUNTIME_MODULES = Object.freeze([
    coreGameObjects,
    blackHoleObjects,
    penguinObjects
]);

export const RUNTIME_CONSTRUCTOR_CATALOG = Object.freeze(Object.assign({}, ...RUNTIME_MODULES));

export function getRuntimeConstructor(className) {
    const Constructor = RUNTIME_CONSTRUCTOR_CATALOG[className];
    if (typeof Constructor !== 'function') {
        throw new Error(`No browser runtime constructor is bound for "${className}"`);
    }
    return Constructor;
}
