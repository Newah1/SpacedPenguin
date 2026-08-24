import { EditorInteractionType } from '../state/editorState.js';
import { prepareCloneForInsertion } from '../services/editorObjectService.js';
import OrbitPreviewService, {
    isMovingOrbit,
    runtimeObjectPosition
} from '../services/orbitPreviewService.js';

export { prepareCloneForInsertion };

export function findObjectBodyAtPosition(editor, x, y) {
    if (editor.objectService) return editor.objectService.hitTestBody(x, y);
    const objects = editor.getAllGameObjects();
    for (let index = objects.length - 1; index >= 0; index--) {
        if (editor.isPointInObject(x, y, objects[index])) return objects[index];
    }
    return null;
}

export function findOrbitTargetObject(editor, object = editor?.selectedObject) {
    const targetId = object?.orbitSystem?.orbitTargetId;
    if (!targetId) return null;
    return editor.objectService?.find(targetId) ||
        editor.getAllGameObjects().find(candidate => candidate?.id === targetId) || null;
}

function isEditableTarget(target) {
    return Boolean(
        target?.matches?.('input, textarea, select, [contenteditable="true"]') ||
        target?.closest?.('[contenteditable="true"]')
    );
}

export function shouldSuppressEditorKey(event, editor) {
    return Boolean(
        editor?.active &&
        editor.mode === 'edit' &&
        event?.code === 'KeyR' &&
        !isEditableTarget(event?.target) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
    );
}

export class EditorRuntimeController {
    constructor(editor, options = {}) {
        this.editor = editor;
        this.preview = new OrbitPreviewService({
            getObjects: () => editor.objectService?.listRuntimeObjects() || editor.getAllGameObjects(),
            now: options.now
        });
    }

    invalidatePreview() {
        this.preview.invalidate();
    }

    getPreviewPosition(object) {
        return this.preview.getPosition(object);
    }

    shouldRenderPreviewObject(object) {
        if (!isMovingOrbit(object?.orbitSystem)) return false;
        const interaction = this.editor.state?.interaction;
        if (
            (interaction?.type === EditorInteractionType.DRAG_OBJECT ||
                interaction?.type === EditorInteractionType.DRAG_ORBIT_CENTER) &&
            interaction.objectId === object.id
        ) return false;
        this.preview.sync();
        return Boolean(this.preview.getPosition(object.id, { advance: false }));
    }

    getDisplayPosition(object) {
        if (this.shouldRenderPreviewObject(object)) {
            return this.preview.getPosition(object.id, { advance: false });
        }
        return runtimeObjectPosition(object);
    }

    drawOrbitTargetHighlight(ctx) {
        const editor = this.editor;
        const source = editor.selectedObject;
        const target = findOrbitTargetObject(editor, source);
        const sourcePosition = this.getDisplayPosition(source);
        const targetPosition = this.getDisplayPosition(target);
        if (!sourcePosition || !targetPosition) return;

        const scale = editor.editorCamera?.scale || 1;
        const targetRadius = Math.max(target.radius || target.collisionRadius || 18, 18);
        const ringPadding = 12 / scale;

        ctx.save();
        ctx.strokeStyle = '#59e6ff';
        ctx.fillStyle = 'rgba(89, 230, 255, 0.12)';
        ctx.lineWidth = 3 / scale;
        ctx.setLineDash([8 / scale, 5 / scale]);
        ctx.beginPath();
        ctx.arc(targetPosition.x, targetPosition.y, targetRadius + ringPadding, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 1.5 / scale;
        ctx.setLineDash([5 / scale, 6 / scale]);
        ctx.beginPath();
        ctx.moveTo(sourcePosition.x, sourcePosition.y);
        ctx.lineTo(targetPosition.x, targetPosition.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${Math.max(10, 12 / scale)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#bff6ff';
        ctx.fillText('ORBIT TARGET', targetPosition.x, targetPosition.y - targetRadius - 16 / scale);
        ctx.restore();
    }

    draw(ctx) {
        this.preview.advance();
        this.drawOrbitTargetHighlight(ctx);

        for (const object of this.preview.objects) {
            if (!this.shouldRenderPreviewObject(object)) continue;
            const position = this.preview.getPosition(object.id, { advance: false });
            const authoredPosition = runtimeObjectPosition(object);
            if (!position || !authoredPosition || typeof object.draw !== 'function') continue;

            ctx.save();
            ctx.translate(position.x - authoredPosition.x, position.y - authoredPosition.y);
            object.draw(ctx);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = '#7fe7ff';
            ctx.lineWidth = 1.5 / (this.editor.editorCamera?.scale || 1);
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(position.x, position.y, Math.max(5, (object.radius || 12) * 0.35), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}

export default EditorRuntimeController;
