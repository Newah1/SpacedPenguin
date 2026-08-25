import {
    GAME_OBJECT_DEFINITIONS,
    getGameObjectDefinition,
    getGameObjectDefinitionForRuntime,
    stampGameObjectType
} from './gameObjectRegistry.js';

function addUnique(array, value) {
    if (!Array.isArray(array) || array.includes(value)) return false;
    array.push(value);
    return true;
}

function removeValue(array, value) {
    if (!Array.isArray(array)) return;
    let index = array.indexOf(value);
    while (index !== -1) {
        array.splice(index, 1);
        index = array.indexOf(value);
    }
}

function resolveDefinition(object, identity) {
    if (identity && typeof identity === 'object') return identity;
    return identity ? getGameObjectDefinition(identity) : getGameObjectDefinitionForRuntime(object);
}

function physicsCollectionName(definition) {
    if (definition.physicsCollection) return definition.physicsCollection;
    const suffix = definition.physicsAdd?.match(/^add(.+)$/)?.[1];
    return suffix ? `${suffix[0].toLowerCase()}${suffix.slice(1)}s` : null;
}

/** Keeps the canonical render list and descriptor-defined runtime indexes in sync. */
export class RuntimeObjectMembership {
    constructor(game) {
        this.game = game;
    }

    definitionFor(object, identity) {
        return resolveDefinition(object, identity);
    }

    resetLevelObjects() {
        this.game.gameObjects = [];
        const definitions = Object.values(GAME_OBJECT_DEFINITIONS)
            .filter(definition => definition.exportable);
        for (const collection of new Set(definitions.flatMap(definition => definition.collections || []))) {
            this.game[collection] = [];
        }
        for (const definition of definitions) {
            if (definition.singleton) this.game[definition.singleton] = null;
        }
        this.game.physics?.clear?.();
        this.game._cachedSortedObjects = null;
        this.game._gameObjectsChanged = true;
        this.game.invalidateSimulationState?.();
    }

    add(object, identity) {
        if (!object) return false;
        const definition = this.definitionFor(object, identity);
        stampGameObjectType(object, definition.type ?? identity);
        if (definition.singleton) {
            const existing = this.game[definition.singleton];
            if (existing && existing !== object) return false;
            this.game[definition.singleton] = object;
        }

        const wasPresent = this.game.gameObjects?.includes(object) ?? false;
        if (!wasPresent) this.game.addGameObject(object);
        for (const collection of definition.collections || []) {
            addUnique(this.game[collection], object);
        }
        if (!wasPresent) {
            const addToPhysics = this.game.physics?.[definition.physicsAdd];
            if (typeof addToPhysics === 'function') addToPhysics.call(this.game.physics, object);
        }
        this.game.invalidateSimulationState?.();
        return true;
    }

    remove(object, identity) {
        if (!object) return false;
        const definition = this.definitionFor(object, identity);
        this.game.removeGameObject(object);
        for (const collection of definition.collections || []) removeValue(this.game[collection], object);
        const removeFromPhysics = this.game.physics?.[definition.physicsRemove];
        if (typeof removeFromPhysics === 'function') removeFromPhysics.call(this.game.physics, object);
        if (definition.singleton && this.game[definition.singleton] === object) {
            this.game[definition.singleton] = null;
        }
        this.game.invalidateSimulationState?.();
        return true;
    }

    list() {
        return [...new Set(this.game.gameObjects || [])];
    }

    capturePositions(object, identity) {
        const definition = this.definitionFor(object, identity);
        const positions = new Map();
        for (const collection of ['gameObjects', ...(definition.collections || [])]) {
            const index = this.game[collection]?.indexOf(object) ?? -1;
            if (index >= 0) positions.set(collection, index);
        }
        const physicsCollection = physicsCollectionName(definition);
        const physicsIndex = physicsCollection
            ? this.game.physics?.[physicsCollection]?.findIndex(entry => entry === object || entry.sprite === object) ?? -1
            : -1;
        return { positions, physicsCollection, physicsIndex };
    }

    restorePositions(object, snapshot) {
        for (const [collection, index] of snapshot.positions) {
            const values = this.game[collection];
            const currentIndex = values?.indexOf(object) ?? -1;
            if (currentIndex < 0 || currentIndex === index) continue;
            values.splice(currentIndex, 1);
            values.splice(Math.min(index, values.length), 0, object);
        }
        const values = snapshot.physicsCollection && this.game.physics?.[snapshot.physicsCollection];
        const currentIndex = values?.findIndex(entry => entry === object || entry.sprite === object) ?? -1;
        if (currentIndex >= 0 && snapshot.physicsIndex >= 0 && currentIndex !== snapshot.physicsIndex) {
            const [entry] = values.splice(currentIndex, 1);
            values.splice(Math.min(snapshot.physicsIndex, values.length), 0, entry);
        }
    }

    getSingleton(identity) {
        const singleton = this.definitionFor(null, identity).singleton;
        return singleton ? this.game[singleton] ?? null : null;
    }
}

export default RuntimeObjectMembership;
