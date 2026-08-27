import { EditorEventType } from './editorEvents.js';

export const EditorSelectionKind = Object.freeze({
    NONE: 'none',
    LEVEL_SETTINGS: 'level-settings',
    OBJECT: 'object'
});

const NONE = Object.freeze({ kind: EditorSelectionKind.NONE });
const LEVEL_SETTINGS = Object.freeze({ kind: EditorSelectionKind.LEVEL_SETTINGS });

export class EditorSelection {
    constructor({ events, resolveObject, levelSettingsNode } = {}) {
        this.events = events;
        this.resolveObject = resolveObject || (() => null);
        this.levelSettingsNode = levelSettingsNode || { isLevelSettings: true };
        this.value = NONE;
    }

    select(id) {
        if (!id || !this.resolveObject(id)) return this.clear();
        return this.#set(Object.freeze({ kind: EditorSelectionKind.OBJECT, id }));
    }

    selectLevelSettings() {
        return this.#set(LEVEL_SETTINGS);
    }

    selectValue(value) {
        if (!value) return this.clear();
        if (value.isLevelSettings) return this.selectLevelSettings();
        return this.select(value.id);
    }

    clear() {
        return this.#set(NONE);
    }

    get() {
        if (this.value.kind === EditorSelectionKind.LEVEL_SETTINGS) return this.levelSettingsNode;
        if (this.value.kind !== EditorSelectionKind.OBJECT) return null;
        const object = this.resolveObject(this.value.id);
        if (object) return object;
        this.value = NONE;
        this.events?.emit(EditorEventType.SELECTION_CHANGED, {
            selection: NONE,
            object: null
        });
        return null;
    }

    isSelected(id) {
        return this.value.kind === EditorSelectionKind.OBJECT && this.value.id === id;
    }

    #set(next) {
        if (this.value.kind === next.kind && this.value.id === next.id) return this.get();
        this.value = next;
        this.events?.emit(EditorEventType.SELECTION_CHANGED, {
            selection: next,
            object: this.get()
        });
        return this.get();
    }
}

export default EditorSelection;
