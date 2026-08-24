export class EditorRuntimeProjector {
    constructor(game) {
        this.game = game;
        this.runtimeById = new Map();
        this.indexRuntimeObjects();
    }

    listRuntimeObjects() {
        const objects = [];
        for (const collection of [
            this.game.planets,
            this.game.bonuses,
            this.game.gameObjects
        ]) {
            for (const object of collection || []) {
                if (!objects.includes(object)) objects.push(object);
            }
        }
        return objects;
    }

    indexRuntimeObjects() {
        this.runtimeById = new Map();
        for (const object of this.listRuntimeObjects()) {
            if (object?.id && !this.runtimeById.has(object.id)) this.runtimeById.set(object.id, object);
        }
        return this.runtimeById;
    }

    getRuntimeObject(id) {
        return this.runtimeById.get(id) || null;
    }

    rebuild(definition) {
        this.game.loadLevel(structuredClone(definition));
        this.indexRuntimeObjects();
        return this;
    }
}

export default EditorRuntimeProjector;
