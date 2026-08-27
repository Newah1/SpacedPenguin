import { getGameObjectDefinition } from '../../gameObjectRegistry.js';
import { EDITOR_CONFIG } from '../../config/editorConfig.js';

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

    hitTestWaypoint(x, y, { selectedOnly = false, pointerType = 'mouse' } = {}) {
        const selectedId = this.editor.selectedObject?.id;
        const objects = this.listRuntimeObjects();
        const ordered = selectedOnly
            ? objects.filter(object => object.id === selectedId)
            : objects.filter(object => object.id !== selectedId);
        const configuredRadius = pointerType === 'touch'
            ? EDITOR_CONFIG.interaction.waypointHitRadius.touch
            : EDITOR_CONFIG.interaction.waypointHitRadius.pointer;
        const radius = configuredRadius / (this.editor.editorCamera?.scale || 1);
        for (let objectIndex = ordered.length - 1; objectIndex >= 0; objectIndex--) {
            const object = ordered[objectIndex];
            const waypoints = object.waypointSystem?.waypoints;
            if (!Array.isArray(waypoints)) continue;
            for (let index = waypoints.length - 1; index >= 0; index--) {
                const point = waypoints[index];
                if (Math.hypot(x - point.x, y - point.y) <= radius) {
                    return { type: 'waypoint', object, waypointIndex: index, point: { ...point } };
                }
            }
        }
        return null;
    }

    hitTest(x, y, options = {}) {
        return this.hitTestWaypoint(x, y, { ...options, selectedOnly: true }) ||
            this.hitTestBody(x, y) ||
            this.hitTestWaypoint(x, y, options) ||
            this.editor.getOrbitCenterAtPosition(x, y);
    }

    isEditable(object) {
        return Boolean(getGameObjectDefinition(
            object?.levelType ?? object?.constructor?.name
        ).editable);
    }
}

export default EditorObjectService;
