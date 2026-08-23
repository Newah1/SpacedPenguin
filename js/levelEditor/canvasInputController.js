import { EDITOR_CONFIG } from '../config/editorConfig.js';
import { INPUT_CONFIG } from '../config/inputConfig.js';
import plog from '../penguinLogger.js';
import { screenToStage, stageToScreen } from '../viewport.js';
import EditorInteractionState, { EditorInteractionType } from './editorInteractionState.js';

export class LevelEditorCanvasInputController {
    constructor(editor) {
        this.editor = editor;
        this.interaction = new EditorInteractionState();
        this.touchStart = null;
        this.longPressTimer = null;
        this.indicator = null;
        this.activePointerId = null;
    }

    handlePointerDown(event) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        event.preventDefault();
        if (this.activePointerId !== null || !this.interaction.idle) return;
        this.activePointerId = Number.isInteger(event.pointerId) ? event.pointerId : null;
        if (Number.isInteger(event.pointerId)) event.currentTarget?.setPointerCapture?.(event.pointerId);

        if (event.button === 1 || editor.spacePan) {
            if (this.interaction.begin(EditorInteractionType.PAN)) {
                editor.startPanning(event.clientX, event.clientY);
            }
            return;
        }

        const position = this.getEventCoordinates(event);
        if (editor.gravitySculptController.state.drawing) {
            if (this.interaction.begin(EditorInteractionType.GRAVITY_SCULPT)) {
                editor.gravitySculptController.addWaypoint(position);
            }
            return;
        }

        if (event.pointerType === 'touch') this.startLongPress(position);
        const hit = editor.getObjectAtPosition(position.x, position.y);
        plog.debug('Level Editor PointerDown:', position.x, position.y, 'Found object:', hit);

        if (hit?.type === 'orbitCenter') {
            editor.selectObject(hit.object);
            if (this.interaction.begin(EditorInteractionType.ORBIT_CENTER_DRAG, { object: hit.object })) {
                editor.startOrbitCenterDragging(position.x, position.y, hit.object);
            }
        } else if (hit) {
            editor.selectObject(hit);
            if (this.interaction.begin(EditorInteractionType.OBJECT_DRAG, { object: hit })) {
                editor.startDragging(position.x, position.y);
            }
        } else {
            editor.selectObject(null);
            if (event.pointerType === 'touch' && this.interaction.begin(EditorInteractionType.PAN)) {
                editor.startPanning(event.clientX, event.clientY);
            }
        }
    }

    handlePointerMove(event) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
        const position = this.getEventCoordinates(event);

        switch (this.interaction.type) {
            case EditorInteractionType.PAN: {
                event.preventDefault();
                editor.updatePanning(event.clientX, event.clientY);
                const distance = this.touchStart
                    ? Math.hypot(position.x - this.touchStart.x, position.y - this.touchStart.y)
                    : 0;
                if (distance > EDITOR_CONFIG.interaction.orbitCenterHitRadius.touch) this.cancelLongPress();
                return;
            }
            case EditorInteractionType.GRAVITY_SCULPT:
                event.preventDefault();
                return;
            case EditorInteractionType.ORBIT_CENTER_DRAG:
                event.preventDefault();
                editor.updateOrbitCenterDragging(position.x, position.y);
                return;
            case EditorInteractionType.OBJECT_DRAG:
                event.preventDefault();
                editor.updateDragging(position.x, position.y);
                return;
            default:
                break;
        }

        if (event.pointerType === 'touch' && this.touchStart) {
            const distance = Math.hypot(position.x - this.touchStart.x, position.y - this.touchStart.y);
            if (distance > EDITOR_CONFIG.interaction.orbitCenterHitRadius.touch) this.cancelLongPress();
        }
    }

    handlePointerUp(event) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        this.cancelLongPress();
        if (Number.isInteger(event.pointerId) && event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        this.activePointerId = null;

        const completed = this.interaction.end();
        switch (completed?.type) {
            case EditorInteractionType.PAN:
                editor.stopPanning();
                break;
            case EditorInteractionType.OBJECT_DRAG:
                editor.stopDragging();
                break;
            case EditorInteractionType.ORBIT_CENTER_DRAG:
                editor.stopOrbitCenterDragging();
                break;
            default:
                break;
        }
    }

    handleContextMenu(event) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        event.preventDefault();
        const position = this.getEventCoordinates(event);
        editor.showContextMenu(position.x, position.y);
    }

    cancelPointer() {
        this.activePointerId = null;
        const cancelled = this.interaction.cancel();
        switch (cancelled?.type) {
            case EditorInteractionType.PAN:
                this.editor.stopPanning();
                break;
            case EditorInteractionType.OBJECT_DRAG:
                this.editor.stopDragging();
                break;
            case EditorInteractionType.ORBIT_CENTER_DRAG:
                this.editor.stopOrbitCenterDragging();
                break;
            default:
                break;
        }
        this.cancelLongPress();
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
        const screen = stageToScreen(
            this.editor.game.canvas,
            this.editor.game.viewport,
            position.x,
            position.y,
            this.editor.editorCamera
        );
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
            pointer.clientY,
            this.editor.editorCamera
        );
    }
}

export default LevelEditorCanvasInputController;
