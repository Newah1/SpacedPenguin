export const EditorMode = Object.freeze({
    EDIT: 'edit',
    PLAY: 'play'
});

export const EditorTool = Object.freeze({
    SELECT: 'select',
    GRAVITY_SCULPT: 'gravity-sculpt'
});

export const EditorInteractionType = Object.freeze({
    IDLE: 'idle',
    TOUCH_PENDING: 'touch-pending',
    PAN: 'pan',
    DRAG_OBJECT: 'drag-object',
    ROTATE_OBJECT: 'rotate-object',
    DRAG_ORBIT_CENTER: 'drag-orbit-center',
    DRAG_WAYPOINT: 'drag-waypoint',
    GRAVITY_WAYPOINT: 'gravity-waypoint'
});

const IDLE_INTERACTION = Object.freeze({ type: EditorInteractionType.IDLE });

export class EditorState {
    constructor() {
        this.active = false;
        this.mode = EditorMode.EDIT;
        this.camera = null;
        this.primaryTool = EditorTool.SELECT;
        this.interaction = IDLE_INTERACTION;
        this.spacePan = false;
    }

    setInteraction(interaction) {
        if (!interaction?.type || !Object.values(EditorInteractionType).includes(interaction.type)) {
            throw new TypeError('Editor interactions require a supported discriminant');
        }
        this.interaction = interaction.type === EditorInteractionType.IDLE
            ? IDLE_INTERACTION
            : Object.freeze({ ...interaction });
        return this.interaction;
    }

    clearInteraction() {
        this.interaction = IDLE_INTERACTION;
    }

    ownsPointer(pointerId) {
        return this.interaction.type === EditorInteractionType.IDLE ||
            this.interaction.pointerId === pointerId;
    }
}

export default EditorState;
