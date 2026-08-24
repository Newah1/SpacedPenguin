export const EditorEventType = Object.freeze({
    SELECTION_CHANGED: 'selectionChanged',
    DOCUMENT_CHANGED: 'documentChanged',
    MODE_CHANGED: 'modeChanged',
    HISTORY_CHANGED: 'historyChanged',
    TOOL_CHANGED: 'toolChanged'
});

const EVENT_TYPES = new Set(Object.values(EditorEventType));

export class EditorEvents {
    constructor() {
        this.listeners = new Map(
            [...EVENT_TYPES].map(type => [type, new Set()])
        );
    }

    on(type, listener) {
        if (!EVENT_TYPES.has(type)) throw new TypeError(`Unknown editor event: ${type}`);
        if (typeof listener !== 'function') throw new TypeError('Editor listeners must be functions');
        const listeners = this.listeners.get(type);
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    emit(type, detail) {
        if (!EVENT_TYPES.has(type)) throw new TypeError(`Unknown editor event: ${type}`);
        for (const listener of [...this.listeners.get(type)]) listener(detail);
    }

    clear() {
        for (const listeners of this.listeners.values()) listeners.clear();
    }
}

export default EditorEvents;
