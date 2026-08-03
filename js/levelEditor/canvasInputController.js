import { EDITOR_CONFIG } from '../config/editorConfig.js';
import { INPUT_CONFIG } from '../config/inputConfig.js';
import plog from '../penguinLogger.js';
import { screenToStage, stageToScreen } from '../viewport.js';

export class LevelEditorCanvasInputController {
    constructor(editor) {
        this.editor = editor;
        this.touchStart = null;
        this.longPressTimer = null;
        this.indicator = null;
    }

    handlePointerDown(event) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        event.preventDefault();
        if (Number.isInteger(event.pointerId)) event.currentTarget?.setPointerCapture?.(event.pointerId);
        const position = this.getEventCoordinates(event);
        if (event.pointerType === 'touch') this.startLongPress(position);
        const hit = editor.getObjectAtPosition(position.x, position.y);
        plog.debug('Level Editor PointerDown:', position.x, position.y, 'Found object:', hit);
        if (hit?.type === 'orbitCenter') {
            editor.selectObject(hit.object);
            editor.startOrbitCenterDragging(position.x, position.y, hit.object);
        } else if (hit) {
            editor.selectObject(hit);
            editor.startDragging(position.x, position.y);
        } else {
            editor.selectObject(null);
        }
    }

    handlePointerMove(event) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        const position = this.getEventCoordinates(event);
        if (event.pointerType === 'touch' && this.touchStart) {
            const distance = Math.hypot(position.x - this.touchStart.x, position.y - this.touchStart.y);
            if (distance > EDITOR_CONFIG.interaction.orbitCenterHitRadius.touch) this.cancelLongPress();
        }
        if (!editor.dragging && !editor.draggingOrbitCenter) return;
        event.preventDefault();
        if (editor.draggingOrbitCenter) editor.updateOrbitCenterDragging(position.x, position.y);
        else editor.updateDragging(position.x, position.y);
    }

    handlePointerUp(event) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        event.preventDefault();
        this.cancelLongPress();
        if (Number.isInteger(event.pointerId) && event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        editor.stopDragging();
        editor.stopOrbitCenterDragging();
    }

    handleContextMenu(event) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        event.preventDefault();
        const position = this.getEventCoordinates(event);
        editor.showContextMenu(position.x, position.y);
    }

    startLongPress(position) {
        this.cancelLongPress();
        this.touchStart = position;
        this.showIndicator(position);
        this.longPressTimer = setTimeout(() => {
            if (!this.touchStart || this.editor.mode !== 'edit') return;
            navigator.vibrate?.(INPUT_CONFIG.hapticsMs.contextMenu);
            this.editor.showContextMenu(this.touchStart.x, this.touchStart.y);
            this.cancelLongPress();
        }, EDITOR_CONFIG.interaction.longPressMs);
    }

    cancelLongPress() {
        if (this.longPressTimer) clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
        this.touchStart = null;
        this.indicator?.remove();
        this.indicator = null;
    }

    showIndicator(position) {
        this.indicator?.remove();
        const screen = stageToScreen(this.editor.game.canvas, this.editor.game.viewport, position.x, position.y);
        this.indicator = document.createElement('div');
        this.indicator.style.cssText = `
            position: fixed; width: 60px; height: 60px; border: 3px solid #00ff00;
            border-radius: 50%; pointer-events: none; z-index: 1001;
            transform: translate(-50%, -50%); left: ${screen.x}px; top: ${screen.y}px;
        `;
        document.body.appendChild(this.indicator);
    }

    getEventCoordinates(event) {
        const pointer = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
        return screenToStage(
            this.editor.game.canvas,
            this.editor.game.viewport,
            pointer.clientX,
            pointer.clientY
        );
    }
}

export default LevelEditorCanvasInputController;
