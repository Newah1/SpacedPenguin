import LiveLevelMutator from '../../runtime/liveLevelMutator.js';
import { GameObjectFactory, LevelRules } from '../../levels/levelLoader.js';
import { normalizeLevelObjectType } from '../../levels/levelSchema.js';

function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

export class EditorRuntimeProjector {
    constructor(game) {
        this.game = game;
        this.mutator = new LiveLevelMutator(game);
        this.runtimeById = new Map();
        this.indexRuntimeObjects();
    }

    listRuntimeObjects() {
        return this.mutator.membership.list();
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

    applyDefinition(previousDefinition, nextDefinition) {
        const previousObjects = new Map((previousDefinition.objects || []).map(object =>
            [object.properties?.id, object]
        ));
        const nextObjects = new Map((nextDefinition.objects || []).map(object =>
            [object.properties?.id, object]
        ));
        const structural = previousObjects.size !== nextObjects.size ||
            [...previousObjects.keys()].some(id => !nextObjects.has(id));
        if (structural) {
            this.rebuild(nextDefinition);
            return this;
        }

        for (const [id, record] of nextObjects) {
            if (!same(previousObjects.get(id), record)) this.#replaceRuntimeObject(id, record);
        }
        this.#applyLevelDefinition(nextDefinition);
        this.indexRuntimeObjects();
        this.#refreshOrbitLookups();
        this.game.invalidateSimulationState?.();
        return this;
    }

    rebuild(definition) {
        this.game.loadLevel(structuredClone(definition));
        this.indexRuntimeObjects();
        this.#refreshOrbitLookups();
        return this;
    }

    #replaceRuntimeObject(id, record) {
        const current = this.getRuntimeObject(id);
        if (!current) throw new Error(`Runtime projection is missing authored object ${id}`);
        const positions = this.mutator.membership.capturePositions(current, record.type);
        const replacement = GameObjectFactory.create(
            record,
            this.game.assetLoader,
            this.game,
            targetId => this.getRuntimeObject(targetId)
        );
        if (!replacement) throw new Error(`Could not project authored object ${id}`);
        this.#applySerializableProperties(replacement, record.properties);
        if (!this.mutator.membership.remove(current, record.type)) {
            throw new Error(`Could not remove stale runtime object ${id}`);
        }
        if (!this.mutator.membership.add(replacement, record.type)) {
            this.mutator.membership.add(current, record.type);
            throw new Error(`Could not insert projected runtime object ${id}`);
        }
        this.mutator.membership.restorePositions(replacement, positions);
        if (replacement === this.game.slingshot) {
            replacement.setPenguin?.(this.game.penguin);
            this.game.penguin?.setPosition?.(replacement.position.x, replacement.position.y);
        }
        this.runtimeById.set(id, replacement);
    }

    #applySerializableProperties(object, properties = {}) {
        for (const [key, value] of Object.entries(properties)) {
            if (key === 'orbit' || key === 'waypointPath' || key === 'id') continue;
            if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
                object[key] = value;
            } else if (key === 'pointingAt' && value) {
                object.pointingAt = { ...value };
            }
        }
        object.id = properties.id;
        if (object.constructor.name === 'TextObject' && object.parseHTMLContent) {
            object.parsedContent = object.parseHTMLContent(object.content);
            if (properties.width != null) {
                object.width = properties.width;
                object.maxWidth = Math.max(1, properties.width - object.padding * 2);
            }
        }
    }

    #applyLevelDefinition(definition) {
        const saveId = this.game.levelMetadata?.saveId;
        const catalogReference = this.game.levelMetadata?.catalogReference;
        this.game.levelMetadata = {
            name: definition.name || '',
            description: definition.description ?? '',
            ...(saveId === undefined ? {} : { saveId }),
            ...(catalogReference === undefined ? {} : { catalogReference })
        };
        if (definition.bounds?.stage) this.game.stageRect = { ...definition.bounds.stage };
        if (definition.bounds?.flight) this.game.flightRect = { ...definition.bounds.flight };
        this.game.cameraConfig = definition.camera ? { ...definition.camera } : null;
        new LevelRules(definition.rules).applyToGame(this.game);
        const hasSlingshot = definition.objects?.some(object =>
            normalizeLevelObjectType(object.type) === 'slingshot'
        );
        if (!hasSlingshot && this.game.slingshot?.position && definition.startPosition) {
            Object.assign(this.game.slingshot.position, definition.startPosition);
            if (this.game.slingshot.resetPosition) {
                Object.assign(this.game.slingshot.resetPosition, definition.startPosition);
            }
            this.game.penguin?.setPosition?.(definition.startPosition.x, definition.startPosition.y);
        }
        const hasTarget = definition.objects?.some(object =>
            normalizeLevelObjectType(object.type) === 'target'
        );
        if (!hasTarget && this.game.target?.position && definition.targetPosition) {
            Object.assign(this.game.target.position, definition.targetPosition);
        }
        this.game.arrow?.setFlightRect?.(this.game.flightRect);
        this.game.resetWorldCamera?.();
    }

    #refreshOrbitLookups() {
        for (const object of this.listRuntimeObjects()) {
            if (object?.orbitSystem) {
                object.orbitSystem.gameObjectLookup = id => this.getRuntimeObject(id);
            }
        }
    }
}

export default EditorRuntimeProjector;
