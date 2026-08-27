import { normalizeLevelDefinition, normalizeLevelObjectType } from '../../levels/levelSchema.js';
import { assertValidLevelDefinition } from '../../levels/levelValidation.js';

const TYPE_LABELS = Object.freeze({
    planet: 'Planet',
    blackhole: 'Black Hole',
    bonus: 'Bonus',
    target: 'Target',
    slingshot: 'Slingshot',
    textobject: 'Text',
    pointingarrow: 'Pointing Arrow',
    portal: 'Portal',
    penguin: 'Penguin'
});

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function idPrefix(type) {
    return normalizeLevelObjectType(type)?.replaceAll(/[^a-z0-9]+/g, '_') || 'object';
}

function allocateIdentity(objects) {
    const usedIds = new Set();
    const usedNames = new Set();
    for (const object of objects) {
        const id = object.properties?.id;
        const name = object.properties?.name;
        if (id) usedIds.add(id);
        if (name) usedNames.add(name);
    }

    for (const object of objects) {
        object.properties ||= {};
        const prefix = idPrefix(object.type);
        if (!object.properties.id) {
            let number = 1;
            while (usedIds.has(`${prefix}_${number}`)) number++;
            object.properties.id = `${prefix}_${number}`;
            usedIds.add(object.properties.id);
        }
        if (!object.properties.name) {
            const label = TYPE_LABELS[normalizeLevelObjectType(object.type)] || 'Object';
            let number = 1;
            while (usedNames.has(`${label} ${number}`)) number++;
            object.properties.name = `${label} ${number}`;
            usedNames.add(object.properties.name);
        }
    }
}

function mergeRecord(target, changes = {}) {
    const next = { ...target, ...clone(changes) };
    if (target.position || changes.position) {
        next.position = { ...(target.position || {}), ...(clone(changes.position) || {}) };
    }
    if (target.properties || changes.properties) {
        next.properties = { ...(target.properties || {}), ...(clone(changes.properties) || {}) };
    }
    return next;
}

export class LevelDocument {
    static fromDefinition(definition, { validate = true } = {}) {
        if (validate) assertValidLevelDefinition(definition, 'editor source level');
        const normalized = normalizeLevelDefinition(clone(definition));
        allocateIdentity(normalized.objects);
        if (validate) assertValidLevelDefinition(normalized, 'normalized editor level');
        return new LevelDocument(normalized);
    }

    constructor(definition) {
        this.definition = clone(definition);
        this.revision = 0;
        this.#reindex();
        this.#synchronizeSingletonPositions();
    }

    listObjects() {
        return this.definition.objects;
    }

    getObject(id) {
        return this.objectById.get(id) || null;
    }

    toDefinition() {
        this.#synchronizeSingletonPositions();
        return clone(this.definition);
    }

    fingerprint() {
        return JSON.stringify(this.toDefinition());
    }

    replace(definition, { validate = true } = {}) {
        const replacement = LevelDocument.fromDefinition(definition, { validate });
        this.definition = replacement.definition;
        this.revision += 1;
        this.#reindex();
        return this;
    }

    applyPatch(patch) {
        if (!patch?.type) throw new TypeError('Document patches require a type');
        switch (patch.type) {
            case 'object.update': {
                const object = this.getObject(patch.id);
                if (!object) return false;
                const next = mergeRecord(object, patch.changes);
                const index = this.definition.objects.indexOf(object);
                this.definition.objects[index] = next;
                break;
            }
            case 'object.replace': {
                const object = this.getObject(patch.id);
                if (!object) return false;
                const replacement = clone(patch.object);
                if (replacement?.properties?.id !== patch.id) return false;
                this.definition.objects[this.definition.objects.indexOf(object)] = replacement;
                break;
            }
            case 'object.add': {
                const object = clone(patch.object);
                object.properties ||= {};
                if (!object.properties.id || this.objectById.has(object.properties.id)) return false;
                const index = patch.index == null
                    ? this.definition.objects.length
                    : Math.max(0, Math.min(patch.index, this.definition.objects.length));
                this.definition.objects.splice(index, 0, object);
                break;
            }
            case 'object.remove': {
                const object = this.getObject(patch.id);
                if (!object) return false;
                this.definition.objects.splice(this.definition.objects.indexOf(object), 1);
                break;
            }
            case 'level.update':
                this.definition = mergeRecord(this.definition, patch.changes);
                break;
            case 'document.replace':
                this.definition = clone(patch.definition);
                break;
            default:
                throw new TypeError(`Unknown document patch type: ${patch.type}`);
        }
        this.revision += 1;
        this.#reindex();
        this.#synchronizeSingletonPositions();
        return true;
    }

    validate(source = 'editor document') {
        return assertValidLevelDefinition(this.toDefinition(), source);
    }

    #reindex() {
        this.objectById = new Map();
        for (const object of this.definition.objects || []) {
            const id = object.properties?.id;
            if (id) this.objectById.set(id, object);
        }
    }

    #synchronizeSingletonPositions() {
        for (const [type, key] of [['slingshot', 'startPosition'], ['target', 'targetPosition']]) {
            const object = this.definition.objects.find(candidate =>
                normalizeLevelObjectType(candidate.type) === type
            );
            if (object?.position) this.definition[key] = { ...object.position };
        }
    }
}

export default LevelDocument;
