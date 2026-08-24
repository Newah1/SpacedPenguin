import { getEditorObjectDefinition } from '../editorObjectRegistry.js';

export function prepareCloneForInsertion(clone) {
    if (!clone) return clone;
    if ('id' in clone) clone.id = null;
    if ('name' in clone) clone.name = '';
    return clone;
}

export class EditorObjectService {
    constructor(editor) {
        this.editor = editor;
    }

    listRuntimeObjects() {
        const objects = this.editor.runtimeProjector
            ? this.editor.runtimeProjector.listRuntimeObjects()
            : this.editor.getAllGameObjects();
        return objects.filter(object => this.isEditable(object));
    }

    find(id) {
        if (!id) return null;
        return this.editor.runtimeProjector?.getRuntimeObject(id) ||
            this.listRuntimeObjects().find(object => object?.id === id) || null;
    }

    ensureIdentities() {
        const objects = this.listRuntimeObjects();
        for (const object of objects) {
            const className = object.constructor?.name || 'Object';
            if (!object.id) object.id = this.allocateId(className, object);
            if (!object.name) object.name = this.allocateName(className, object);
        }
        this.editor.runtimeProjector?.indexRuntimeObjects();
        return objects;
    }

    allocateName(className, excludedObject = null) {
        const used = this.#usedValues('name', excludedObject);
        let number = 1;
        while (used.has(`${className} ${number}`)) number++;
        return `${className} ${number}`;
    }

    allocateId(className, excludedObject = null) {
        const prefix = className.toLowerCase();
        const used = this.#usedValues('id', excludedObject);
        let number = 1;
        while (used.has(`${prefix}_${number}`)) number++;
        return `${prefix}_${number}`;
    }

    allocateGroupNumber(prefix, suffixes) {
        const used = this.#usedValues('id');
        let number = 1;
        while (suffixes.some(suffix => used.has(`${prefix}_${number}_${suffix}`))) number++;
        return number;
    }

    #usedValues(property, excludedObject = null) {
        if (this.editor.document) {
            return new Set(this.editor.document.listObjects()
                .map(record => record.properties?.[property])
                .filter(Boolean));
        }
        return new Set(this.listRuntimeObjects()
            .filter(object => object !== excludedObject)
            .map(object => object?.[property])
            .filter(Boolean));
    }

    prepareClone(clone) {
        return prepareCloneForInsertion(clone);
    }

    hitTestBody(x, y) {
        const objects = this.listRuntimeObjects();
        for (let index = objects.length - 1; index >= 0; index--) {
            const object = objects[index];
            const displayPosition = this.editor.overlayRenderer?.runtimeController
                ?.getDisplayPosition(object);
            if (this.editor.isPointInObject(x, y, object, displayPosition)) return object;
        }
        return null;
    }

    hitTest(x, y) {
        return this.hitTestBody(x, y) || this.editor.getOrbitCenterAtPosition(x, y);
    }

    isEditable(object) {
        return Boolean(getEditorObjectDefinition(object?.constructor?.name).editable);
    }
}

export default EditorObjectService;
