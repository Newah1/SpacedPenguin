import { EDITOR_CONFIG } from '../../config/editorConfig.js';
import { EditorEventType } from '../state/editorEvents.js';
import {
    EditorInteractionType,
    EditorTool
} from '../state/editorState.js';

function point(value) {
    return value ? { x: value.x, y: value.y } : null;
}

function pointerId(event) {
    return Number.isInteger(event.pointerId) ? event.pointerId : 0;
}

export class EditorToolManager {
    constructor(editor) {
        this.editor = editor;
        this.longPressTimer = null;
    }

    setPrimaryTool(tool) {
        if (!Object.values(EditorTool).includes(tool)) throw new TypeError(`Unknown editor tool: ${tool}`);
        if (this.editor.state.primaryTool === tool) return;
        this.cancelInteraction();
        this.editor.state.primaryTool = tool;
        this.editor.events.emit(EditorEventType.TOOL_CHANGED, { tool });
    }

    setSpacePan(active) {
        this.editor.state.spacePan = Boolean(active);
        if (this.editor.state.interaction.type === EditorInteractionType.IDLE) {
            this.editor.game.canvas.style.cursor = active ? 'grab' : '';
        }
    }

    handlePointerDown(input) {
        if (this.editor.state.interaction.type !== EditorInteractionType.IDLE) return false;
        const { event, world, screen } = input;
        const id = pointerId(event);

        if (event.button === 1 || this.editor.state.spacePan) {
            this.#startPan(id, screen);
            return true;
        }
        if (this.editor.gravitySculptController.state.drawing) {
            this.editor.state.setInteraction({ type: EditorInteractionType.GRAVITY_WAYPOINT, pointerId: id });
            this.editor.gravitySculptController.addWaypoint(world);
            return true;
        }

        const hit = this.editor.objectService.hitTest(world.x, world.y);
        if (event.pointerType === 'touch') {
            this.#startTouchPending(id, input, hit);
            return true;
        }
        return this.#startFromHit(id, world, screen, hit);
    }

    handlePointerMove(input) {
        const interaction = this.editor.state.interaction;
        if (interaction.type === EditorInteractionType.IDLE || interaction.pointerId !== pointerId(input.event)) {
            return false;
        }
        if (interaction.type === EditorInteractionType.TOUCH_PENDING) {
            const distance = Math.hypot(
                input.world.x - interaction.startWorld.x,
                input.world.y - interaction.startWorld.y
            );
            if (distance <= EDITOR_CONFIG.interaction.touchMovementThreshold) return true;
            this.#clearLongPress();
            this.editor.canvasInput?.hideLongPressIndicator();
            if (interaction.hit) {
                this.#startFromHit(interaction.pointerId, interaction.startWorld, interaction.startScreen, interaction.hit);
            } else {
                this.#startPan(interaction.pointerId, interaction.startScreen);
            }
            return this.handlePointerMove(input);
        }
        if (interaction.type === EditorInteractionType.PAN) {
            this.#updatePan(input.screen);
        } else if (interaction.type === EditorInteractionType.DRAG_OBJECT) {
            this.#updateObjectDrag(input.world);
        } else if (interaction.type === EditorInteractionType.DRAG_ORBIT_CENTER) {
            this.#updateOrbitCenterDrag(input.world);
        }
        return true;
    }

    handlePointerUp(input) {
        const interaction = this.editor.state.interaction;
        if (interaction.type === EditorInteractionType.IDLE || interaction.pointerId !== pointerId(input.event)) {
            return false;
        }
        this.#clearLongPress();
        this.editor.canvasInput?.hideLongPressIndicator();
        if (interaction.type === EditorInteractionType.DRAG_OBJECT) {
            this.editor.commandBus.commit();
            this.editor.updateObjectList();
        } else if (interaction.type === EditorInteractionType.DRAG_ORBIT_CENTER) {
            this.editor.commandBus.commit();
            this.editor.updateObjectList();
        }
        this.editor.state.clearInteraction();
        this.editor.game.canvas.style.cursor = this.editor.state.spacePan ? 'grab' : '';
        return true;
    }

    handlePointerCancel(input) {
        const interaction = this.editor.state.interaction;
        if (interaction.type === EditorInteractionType.IDLE || interaction.pointerId !== pointerId(input.event)) {
            return false;
        }
        this.cancelInteraction();
        return true;
    }

    handleContextMenu(input) {
        this.cancelInteraction();
        this.editor.showContextMenu(input.world.x, input.world.y);
        return true;
    }

    cancelInteraction() {
        const interaction = this.editor.state.interaction;
        this.#clearLongPress();
        this.editor.canvasInput?.hideLongPressIndicator();
        if (interaction.type === EditorInteractionType.DRAG_OBJECT) {
            this.editor.commandBus.cancel();
        } else if (interaction.type === EditorInteractionType.DRAG_ORBIT_CENTER) {
            this.editor.commandBus.cancel();
        }
        this.editor.state.clearInteraction();
        this.editor.game.canvas.style.cursor = this.editor.state.spacePan ? 'grab' : '';
        this.editor.game.invalidateSimulationState?.();
        this.editor.overlayRenderer?.runtimeController?.invalidatePreview();
    }

    #startTouchPending(id, input, hit) {
        if (hit?.type === 'orbitCenter') this.editor.selectObject(hit.object);
        else this.editor.selectObject(hit || null);
        this.editor.state.setInteraction({
            type: EditorInteractionType.TOUCH_PENDING,
            pointerId: id,
            startWorld: point(input.world),
            startScreen: point(input.screen),
            hit
        });
        this.editor.canvasInput?.showLongPressIndicator(input.world);
        this.#clearLongPress();
        this.longPressTimer = setTimeout(() => {
            const current = this.editor.state.interaction;
            if (current.type !== EditorInteractionType.TOUCH_PENDING || current.pointerId !== id) return;
            navigator.vibrate?.(EDITOR_CONFIG.interaction.longPressHapticsMs || 50);
            this.editor.showContextMenu(current.startWorld.x, current.startWorld.y);
            this.editor.state.clearInteraction();
            this.editor.canvasInput?.hideLongPressIndicator();
        }, EDITOR_CONFIG.interaction.longPressMs);
    }

    #startFromHit(id, world, screen, hit) {
        if (hit?.type === 'orbitCenter') {
            this.editor.selectObject(hit.object);
            return this.#startOrbitCenterDrag(id, world, hit.object);
        }
        if (hit) {
            this.editor.selectObject(hit);
            return this.#startObjectDrag(id, world, hit);
        }
        this.editor.selectObject(null);
        if (screen && this.editor.state.spacePan) this.#startPan(id, screen);
        return true;
    }

    #startObjectDrag(id, world, object) {
        const position = this.editor.getObjectPosition(object);
        if (!position) return false;
        this.editor.state.setInteraction({
            type: EditorInteractionType.DRAG_OBJECT,
            pointerId: id,
            objectId: object.id,
            startPosition: point(position),
            offset: { x: world.x - position.x, y: world.y - position.y }
        });
        this.editor.commandBus.begin('object.move', {
            objectId: object.id,
            before: point(position),
            after: point(position),
            label: `Move ${object.constructor?.name || 'object'}`
        }, { source: 'canvas-drag' });
        return true;
    }

    #startOrbitCenterDrag(id, world, object) {
        const center = object?.orbitSystem?.orbitCenter;
        if (!center) return false;
        this.editor.state.setInteraction({
            type: EditorInteractionType.DRAG_ORBIT_CENTER,
            pointerId: id,
            objectId: object.id,
            startCenter: point(center),
            offset: { x: world.x - center.x, y: world.y - center.y }
        });
        this.editor.commandBus.begin('orbit-center.move', {
            objectId: object.id,
            before: point(center),
            after: point(center)
        }, { source: 'orbit-center-drag' });
        return true;
    }

    #startPan(id, screen) {
        if (!this.editor.editorCamera) this.editor.fitEditorCamera();
        const view = this.editor.editorCamera.viewRect;
        this.editor.state.setInteraction({
            type: EditorInteractionType.PAN,
            pointerId: id,
            startScreen: point(screen),
            startCenter: { x: view.x + view.width / 2, y: view.y + view.height / 2 },
            zoom: this.editor.editorCamera.scale
        });
        this.editor.game.canvas.style.cursor = 'grabbing';
    }

    #updatePan(screen) {
        const interaction = this.editor.state.interaction;
        const rect = this.editor.game.canvas.getBoundingClientRect();
        const logicalDeltaX = (screen.x - interaction.startScreen.x) *
            (this.editor.game.viewport.backingWidth / rect.width) / this.editor.game.viewport.scale;
        const logicalDeltaY = (screen.y - interaction.startScreen.y) *
            (this.editor.game.viewport.backingHeight / rect.height) / this.editor.game.viewport.scale;
        this.editor.setEditorCamera({
            x: interaction.startCenter.x - logicalDeltaX / interaction.zoom,
            y: interaction.startCenter.y - logicalDeltaY / interaction.zoom
        }, interaction.zoom);
    }

    #updateObjectDrag(world) {
        const interaction = this.editor.state.interaction;
        const position = {
            x: world.x - interaction.offset.x,
            y: world.y - interaction.offset.y
        };
        this.editor.commandBus.update({ after: position });
        this.editor.setDisplayedPropertyValue('x', position.x);
        this.editor.setDisplayedPropertyValue('y', position.y);
    }

    #updateOrbitCenterDrag(world) {
        const interaction = this.editor.state.interaction;
        const center = {
            x: world.x - interaction.offset.x,
            y: world.y - interaction.offset.y
        };
        this.editor.commandBus.update({ after: center });
        this.editor.setDisplayedPropertyValue('orbitCenterX', center.x);
        this.editor.setDisplayedPropertyValue('orbitCenterY', center.y);
    }

    #clearLongPress() {
        if (this.longPressTimer) clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
    }
}

export default EditorToolManager;
