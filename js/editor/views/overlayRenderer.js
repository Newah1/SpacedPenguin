import { EDITOR_CONFIG } from '../../config/editorConfig.js';
import { LevelOrbitType } from '../../levels/levelSchema.js';
import EditorRuntimeController from '../controllers/editorRuntimeController.js';
import { EditorEventType } from '../state/editorEvents.js';
import { getPortalOutwardDirection } from '../../simulation/portalGeometry.js';

export class LevelEditorOverlayRenderer {
    constructor(editor) {
        this.editor = editor;
        this.runtimeController = new EditorRuntimeController(editor);
        this.unsubscribe = editor.events?.on(
            EditorEventType.DOCUMENT_CHANGED,
            () => this.runtimeController.invalidatePreview()
        );
    }

    render(ctx) {
        const editor = this.editor;
        if (!editor.active || editor.mode !== 'edit') return;
        this.drawBounds(ctx);
        this.drawGrid(ctx);
        this.drawGravitySculpt(ctx);
        this.drawAllOrbitCenters(ctx);
        this.runtimeController.draw(ctx);
        this.drawAllWaypointPaths(ctx);
        this.drawAllPortalDirectionArrows(ctx);
        if (editor.selectedObject && !editor.selectedObject.isLevelSettings) {
            this.drawPortalPairLine(ctx, editor.selectedObject);
            this.drawSelectionHighlight(ctx, editor.selectedObject);
            this.drawArrowTarget(ctx, editor.selectedObject);
        }
    }

    drawGravitySculpt(ctx) {
        const sculpt = this.editor.gravitySculptController.state;
        if (!sculpt?.active) return;
        const drawPath = (points, color, width, dash = []) => {
            if (points.length < 2) return;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.setLineDash(dash);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
            ctx.stroke();
            ctx.restore();
        };
        sculpt.path.forEach((point, index) => {
            const start = index === 0;
            const tolerance = Number(this.editor.gravitySculptView?.checkpointTolerance?.value) ||
                EDITOR_CONFIG.gravitySculpt.checkpointTolerance;
            const candidate = sculpt.result?.candidates?.[sculpt.candidateIndex] || null;
            const match = start ? null : candidate?.waypointMatches?.[index - 1];
            const reached = match && !match.virtual && match.distance <= tolerance;
            ctx.save();
            if (!start) {
                ctx.fillStyle = match
                    ? (reached ? 'rgba(76, 210, 120, .10)' : 'rgba(255, 75, 75, .10)')
                    : 'rgba(255, 166, 40, .08)';
                ctx.strokeStyle = match
                    ? (reached ? 'rgba(76, 230, 120, .8)' : 'rgba(255, 75, 75, .85)')
                    : 'rgba(255, 166, 40, .55)';
                ctx.lineWidth = 2;
                ctx.setLineDash([7, 5]);
                ctx.beginPath();
                ctx.arc(point.x, point.y, tolerance, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                const closest = sculpt.preview?.[match?.index];
                if (closest && !reached) {
                    ctx.setLineDash([3, 4]);
                    ctx.beginPath();
                    ctx.moveTo(point.x, point.y);
                    ctx.lineTo(closest.x, closest.y);
                    ctx.stroke();
                }
            }
            ctx.setLineDash([]);
            ctx.fillStyle = start ? '#59e6ff' : (match ? (reached ? '#4ce078' : '#ff4b4b') : '#ffa628');
            ctx.beginPath();
            ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#08101a';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(start ? 'S' : String(index), point.x, point.y);
            ctx.restore();
        });
        drawPath(sculpt.preview, 'rgba(80, 235, 255, .95)', 3);
    }

    drawSelectionHighlight(ctx, object) {
        const position = this.runtimeController.getDisplayPosition(object);
        if (!position) return;
        const radius = object.radius || object.collisionRadius || 20;
        ctx.save();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        if (object.constructor.name === 'Portal') {
            ctx.ellipse(
                position.x,
                position.y,
                object.width / 2 + 10,
                object.height / 2 + 10,
                (object.rotation || 0) * Math.PI / 180,
                0,
                Math.PI * 2
            );
        } else {
            ctx.arc(position.x, position.y, radius + 10, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawPortalPairLine(ctx, object) {
        if (object.constructor.name !== 'Portal') return;
        const pair = (this.editor.game.portals || []).find(portal => portal.id === object.pairedPortalId);
        if (!pair) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(180, 210, 255, 0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(object.position.x, object.position.y);
        ctx.lineTo(pair.position.x, pair.position.y);
        ctx.stroke();
        ctx.restore();
    }

    drawAllPortalDirectionArrows(ctx) {
        for (const portal of this.editor.game.portals || []) {
            this.drawPortalDirectionArrow(ctx, portal);
        }
    }

    drawPortalDirectionArrow(ctx, portal) {
        const outward = getPortalOutwardDirection(portal);
        const perpendicular = { x: -outward.y, y: outward.x };
        const startDistance = portal.height / 2 + 5;
        const tipDistance = startDistance + 24;
        const headLength = 8;
        const headWidth = 5;
        const start = {
            x: portal.position.x + outward.x * startDistance,
            y: portal.position.y + outward.y * startDistance
        };
        const tip = {
            x: portal.position.x + outward.x * tipDistance,
            y: portal.position.y + outward.y * tipDistance
        };

        ctx.save();
        ctx.strokeStyle = portal.tint;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.moveTo(
            tip.x - outward.x * headLength + perpendicular.x * headWidth,
            tip.y - outward.y * headLength + perpendicular.y * headWidth
        );
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(
            tip.x - outward.x * headLength - perpendicular.x * headWidth,
            tip.y - outward.y * headLength - perpendicular.y * headWidth
        );
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

    drawAllWaypointPaths(ctx) {
        for (const object of this.editor.getAllGameObjects()) {
            const path = object.waypointSystem;
            if (!path || path.waypoints?.length < 2) continue;
            const selected = object === this.editor.selectedObject;
            const scale = this.editor.editorCamera?.scale || 1;
            ctx.save();
            ctx.strokeStyle = selected ? '#ffcf4a' : 'rgba(255, 207, 74, 0.55)';
            ctx.fillStyle = selected ? '#ffcf4a' : 'rgba(255, 207, 74, 0.8)';
            ctx.lineWidth = (selected ? 3 : 2) / scale;
            ctx.setLineDash(path.mode === 'pingpong' ? [8 / scale, 5 / scale] : []);
            ctx.beginPath();
            ctx.moveTo(path.waypoints[0].x, path.waypoints[0].y);
            for (const point of path.waypoints.slice(1)) ctx.lineTo(point.x, point.y);
            if (path.mode === 'loop') ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
            path.waypoints.forEach((point, index) => {
                const interaction = this.editor.state?.interaction;
                const active = interaction?.type === 'drag-waypoint' &&
                    interaction.objectId === object.id &&
                    interaction.waypointIndex === index;
                const radius = (active ? 11 : selected ? 9 : 7) / scale;
                ctx.fillStyle = active
                    ? '#ff7a33'
                    : selected
                        ? '#ffcf4a'
                        : 'rgba(255, 207, 74, 0.8)';
                ctx.strokeStyle = active || selected ? '#fff3bd' : 'rgba(30, 30, 30, 0.8)';
                ctx.lineWidth = 2 / scale;
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#111827';
                ctx.font = `bold ${Math.max(9, 11 / scale)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(index + 1), point.x, point.y);
            });
            ctx.restore();
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
        const stage = this.editor.game.stageRect;
        const view = this.editor.editorCamera?.viewRect || stage;
        const gridSize = EDITOR_CONFIG.overlay.gridSize;
        const majorEvery = gridSize * 5;
        const startX = Math.max(stage.x, Math.floor(view.x / gridSize) * gridSize);
        const endX = Math.min(stage.x + stage.width, view.x + view.width);
        const startY = Math.max(stage.y, Math.floor(view.y / gridSize) * gridSize);
        const endY = Math.min(stage.y + stage.height, view.y + view.height);
        const inverseScale = 1 / (this.editor.editorCamera?.scale || 1);
        ctx.save();
        ctx.lineWidth = inverseScale;
        for (let x = startX; x <= endX; x += gridSize) {
            ctx.strokeStyle = x % majorEvery === 0
                ? 'rgba(100, 220, 255, 0.24)'
                : 'rgba(255, 255, 255, 0.09)';
            ctx.beginPath();
            ctx.moveTo(x, Math.max(stage.y, view.y));
            ctx.lineTo(x, Math.min(stage.y + stage.height, view.y + view.height));
            ctx.stroke();
        }
        for (let y = startY; y <= endY; y += gridSize) {
            ctx.strokeStyle = y % majorEvery === 0
                ? 'rgba(100, 220, 255, 0.24)'
                : 'rgba(255, 255, 255, 0.09)';
            ctx.beginPath();
            ctx.moveTo(Math.max(stage.x, view.x), y);
            ctx.lineTo(Math.min(stage.x + stage.width, view.x + view.width), y);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawBounds(ctx) {
        const stage = this.editor.game.stageRect;
        const flight = this.editor.game.flightRect;
        const inverseScale = 1 / (this.editor.editorCamera?.scale || 1);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 180, 55, 0.75)';
        ctx.lineWidth = 2 * inverseScale;
        ctx.setLineDash([10 * inverseScale, 7 * inverseScale]);
        ctx.strokeRect(flight.x, flight.y, flight.width, flight.height);
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(81, 239, 255, 0.9)';
        ctx.lineWidth = 3 * inverseScale;
        ctx.strokeRect(stage.x, stage.y, stage.width, stage.height);
        ctx.restore();
    }
}

export default LevelEditorOverlayRenderer;
