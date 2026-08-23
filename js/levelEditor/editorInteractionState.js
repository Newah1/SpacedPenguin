export const EditorInteractionType = Object.freeze({
    IDLE: 'idle',
    PAN: 'pan',
    OBJECT_DRAG: 'object-drag',
    ORBIT_CENTER_DRAG: 'orbit-center-drag',
    GRAVITY_SCULPT: 'gravity-sculpt'
});

const VALID_TYPES = new Set(Object.values(EditorInteractionType));

export class EditorInteractionState {
    constructor() {
        this.current = Object.freeze({ type: EditorInteractionType.IDLE, data: null });
    }

    get type() {
        return this.current.type;
    }

    get data() {
        return this.current.data;
    }

    get idle() {
        return this.type === EditorInteractionType.IDLE;
    }

    is(type) {
        return this.type === type;
    }

    begin(type, data = null) {
        if (!VALID_TYPES.has(type) || type === EditorInteractionType.IDLE) {
            throw new Error(`Invalid editor interaction type: ${type}`);
        }
        if (!this.idle) return false;
        this.current = Object.freeze({ type, data });
        return true;
    }

    end(expectedType = null) {
        if (this.idle) return null;
        if (expectedType && this.type !== expectedType) return null;
        const completed = this.current;
        this.current = Object.freeze({ type: EditorInteractionType.IDLE, data: null });
        return completed;
    }

    cancel() {
        return this.end();
    }
}

export default EditorInteractionState;
