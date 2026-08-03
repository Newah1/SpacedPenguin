import { getEditorObjectDefinition } from './editorObjectRegistry.js';

function addUnique(array, value) {
    if (Array.isArray(array) && !array.includes(value)) {
        array.push(value);
    }
}

function removeValue(array, value) {
    if (!Array.isArray(array)) return;
    let index = array.indexOf(value);
    while (index !== -1) {
        array.splice(index, 1);
        index = array.indexOf(value);
    }
}

/**
 * Owns structural edits to the running level. The live Game remains the source
 * of truth; this class only keeps its render, type-specific, singleton, and
 * physics collections in sync.
 */
export class LiveLevelMutator {
    constructor(game) {
        this.game = game;
    }

    addObject(object, className = object?.constructor?.name) {
        if (!object || !className) return false;

        const definition = getEditorObjectDefinition(className);
        if (definition.singleton) {
            const existing = this.game[definition.singleton];
            if (existing && existing !== object) return false;
            this.game[definition.singleton] = object;
        }

        if (!this.game.gameObjects?.includes(object)) {
            this.game.addGameObject(object);
        }

        for (const collection of definition.collections) {
            addUnique(this.game[collection], object);
        }

        const addToPhysics = this.game.physics?.[definition.physicsAdd];
        if (typeof addToPhysics === 'function') {
            addToPhysics.call(this.game.physics, object);
        }

        return true;
    }

    removeObject(object, className = object?.constructor?.name) {
        if (!object || !className) return false;

        const definition = getEditorObjectDefinition(className);
        this.game.removeGameObject(object);

        for (const collection of definition.collections) {
            removeValue(this.game[collection], object);
        }

        const removeFromPhysics = this.game.physics?.[definition.physicsRemove];
        if (typeof removeFromPhysics === 'function') {
            removeFromPhysics.call(this.game.physics, object);
        }

        if (definition.singleton && this.game[definition.singleton] === object) {
            this.game[definition.singleton] = null;
        }

        return true;
    }

    getSingleton(className) {
        const singleton = getEditorObjectDefinition(className).singleton;
        return singleton ? this.game[singleton] ?? null : null;
    }
}

export default LiveLevelMutator;
