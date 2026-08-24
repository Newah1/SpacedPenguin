import { screenToStage, stageToScreen } from '../viewport.js';

export class LevelEditorCanvasInputController {
    constructor(editor) {
        this.editor = editor;
        this.capturedPointerId = null;
        this.indicator = null;
    }

    handlePointerDown(event) {
        if (!this.#canHandle(event, true)) return;
        event.preventDefault();
        const input = this.#normalize(event);
        if (!this.editor.toolManager.handlePointerDown(input)) return;
        this.capturedPointerId = Number.isInteger(event.pointerId) ? event.pointerId : 0;
        if (Number.isInteger(event.pointerId)) event.currentTarget?.setPointerCapture?.(event.pointerId);
    }

    handlePointerMove(event) {
        if (!this.#canHandle(event)) return;
        if (this.editor.toolManager.handlePointerMove(this.#normalize(event))) event.preventDefault();
    }

    handlePointerUp(event) {
        if (!this.#canHandle(event)) return;
        event.preventDefault();
        this.editor.toolManager.handlePointerUp(this.#normalize(event));
        this.#releasePointer(event);
    }

    handlePointerCancel(event) {
        if (!this.#canHandle(event)) return;
        this.editor.toolManager.handlePointerCancel(this.#normalize(event));
        this.#releasePointer(event);
    }

    handleContextMenu(event) {
        if (!this.editor.active || this.editor.mode !== 'edit') return;
        event.preventDefault();
        this.editor.toolManager.handleContextMenu(this.#normalize(event));
    }

    cancelPointer() {
        this.editor.toolManager.cancelInteraction();
        this.capturedPointerId = null;
        this.hideLongPressIndicator();
    }

    cancelLongPress() {
        this.hideLongPressIndicator();
    }

    showLongPressIndicator(position) {
        this.hideLongPressIndicator();
        const screen = stageToScreen(
            this.editor.game.canvas,
            this.editor.game.viewport,
            position.x,
            position.y,
            this.editor.editorCamera
        );
        this.indicator = document.createElement('div');
        this.indicator.className = 'editor-long-press-indicator';
        Object.assign(this.indicator.style, { left: `${screen.x}px`, top: `${screen.y}px` });
        document.body.appendChild(this.indicator);
    }

    hideLongPressIndicator() {
        this.indicator?.remove();
        this.indicator = null;
    }

    getEventCoordinates(event) {
        const pointer = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
        return screenToStage(
            this.editor.game.canvas,
            this.editor.game.viewport,
            pointer.clientX,
            pointer.clientY,
            this.editor.editorCamera
        );
    }

    #normalize(event) {
        const pointer = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
        return {
            event,
            screen: { x: pointer.clientX, y: pointer.clientY },
            world: this.getEventCoordinates(event)
        };
    }

    #canHandle(event, starting = false) {
        if (!this.editor.active || this.editor.mode !== 'edit') return false;
        const id = Number.isInteger(event.pointerId) ? event.pointerId : 0;
        if (starting) return this.capturedPointerId === null;
        return this.capturedPointerId === null || this.capturedPointerId === id;
    }

    #releasePointer(event) {
        if (Number.isInteger(event.pointerId) && event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        this.capturedPointerId = null;
    }
}

export default LevelEditorCanvasInputController;
