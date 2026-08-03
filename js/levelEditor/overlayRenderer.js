import { EDITOR_CONFIG } from '../config/editorConfig.js';
import { LevelOrbitType } from '../levelSchema.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../viewport.js';

export class LevelEditorOverlayRenderer {
    constructor(editor) {
        this.editor = editor;
    }

    render(ctx) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        this.drawGrid(ctx);
        this.drawAllOrbitCenters(ctx);
        if (editor.selectedObject && !editor.selectedObject.isLevelSettings) {
            this.drawSelectionHighlight(ctx, editor.selectedObject);
            this.drawArrowTarget(ctx, editor.selectedObject);
        }
    }

    drawSelectionHighlight(ctx, object) {
        const position = this.editor.getObjectPosition(object);
        if (!position) return;
        const radius = object.radius || object.collisionRadius || 20;
        ctx.save();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawAllOrbitCenters(ctx) {
        for (const object of this.editor.getAllGameObjects()) {
            if (object.orbitSystem?.orbitCenter && object.orbitSystem.orbitRadius > 0) {
                this.drawOrbitCenter(ctx, object);
            }
        }
    }

    drawOrbitCenter(ctx, object) {
        const orbit = object.orbitSystem;
        const center = orbit?.orbitCenter;
        if (!center || orbit.orbitRadius <= 0) return;

        const isDragging = this.editor.draggingOrbitCenter && this.editor.orbitCenterObject === object;
        const baseColor = isDragging ? '#ff6600' : '#ff9900';
        const highlightColor = isDragging ? '#ffaa33' : '#ffbb33';
        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = highlightColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(center.x, center.y, isDragging ? 12 : 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(center.x, center.y, isDragging ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(center.x - 3, center.y);
        ctx.lineTo(center.x + 3, center.y);
        ctx.moveTo(center.x, center.y - 3);
        ctx.lineTo(center.x, center.y + 3);
        ctx.stroke();

        ctx.strokeStyle = baseColor;
        ctx.lineWidth = isDragging ? 3 : 2;
        ctx.setLineDash(isDragging ? [10, 5] : []);
        ctx.beginPath();
        this.drawOrbitPath(ctx, object, center);
        ctx.stroke();

        const position = this.editor.getObjectPosition(object);
        if (position) {
            ctx.strokeStyle = baseColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(position.x, position.y);
            ctx.lineTo(center.x, center.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawOrbitPath(ctx, object, center) {
        const orbit = object.orbitSystem;
        switch (orbit.orbitType) {
            case LevelOrbitType.ELLIPTICAL: {
                const major = orbit.orbitParams?.semiMajorAxis || orbit.orbitRadius;
                const minor = orbit.orbitParams?.semiMinorAxis || orbit.orbitRadius;
                ctx.ellipse(center.x, center.y, major, minor, orbit.orbitParams?.rotation || 0, 0, Math.PI * 2);
                break;
            }
            case LevelOrbitType.FIGURE_8:
                for (let t = 0; t <= Math.PI * 2; t += EDITOR_CONFIG.overlay.figure8StepRadians) {
                    const denominator = 1 + Math.sin(t) ** 2;
                    const x = center.x + orbit.orbitRadius * Math.cos(t) / denominator;
                    const y = center.y + orbit.orbitRadius * Math.sin(t) * Math.cos(t) / denominator;
                    if (t === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                break;
            case LevelOrbitType.GRAVITY:
                ctx.setLineDash([10, 10]);
                ctx.arc(center.x, center.y, orbit.orbitRadius || EDITOR_CONFIG.overlay.gravityPreviewRadius, 0, Math.PI * 2);
                this.drawVelocityVector(ctx, object);
                break;
            default:
                ctx.arc(center.x, center.y, orbit.orbitRadius, 0, Math.PI * 2);
        }
    }

    drawVelocityVector(ctx, object) {
        const position = this.editor.getObjectPosition(object);
        const velocity = object.orbitSystem.velocity;
        if (!position || !velocity) return;
        const scale = EDITOR_CONFIG.overlay.velocityVectorScale;
        const endX = position.x + velocity.x * scale;
        const endY = position.y + velocity.y * scale;
        const angle = Math.atan2(velocity.y, velocity.x);
        ctx.save();
        ctx.strokeStyle = '#FF6600';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(position.x, position.y);
        ctx.lineTo(endX, endY);
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 10 * Math.cos(angle - Math.PI / 6), endY - 10 * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 10 * Math.cos(angle + Math.PI / 6), endY - 10 * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        ctx.restore();
    }

    drawArrowTarget(ctx, object) {
        const target = object.pointingAt;
        const position = this.editor.getObjectPosition(object);
        if (object.constructor.name !== 'PointingArrow' || !target || !position) return;
        ctx.save();
        ctx.strokeStyle = '#00ff99';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(target.x, target.y, 8, 0, Math.PI * 2);
        ctx.moveTo(target.x - 10, target.y);
        ctx.lineTo(target.x + 10, target.y);
        ctx.moveTo(target.x, target.y - 10);
        ctx.lineTo(target.x, target.y + 10);
        ctx.moveTo(position.x, position.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
    }

    drawGrid(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= STAGE_WIDTH; x += EDITOR_CONFIG.overlay.gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, STAGE_HEIGHT);
            ctx.stroke();
        }
        for (let y = 0; y <= STAGE_HEIGHT; y += EDITOR_CONFIG.overlay.gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(STAGE_WIDTH, y);
            ctx.stroke();
        }
        ctx.restore();
    }
}

export default LevelEditorOverlayRenderer;
