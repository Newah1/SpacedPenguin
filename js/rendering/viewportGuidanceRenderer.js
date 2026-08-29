import { STAGE_HEIGHT, STAGE_WIDTH } from './viewport.js';

const DEFAULT_INSET = 38;

export function calculateViewportIndicator(camera, point, inset = DEFAULT_INSET) {
    if (!camera || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
    const displayX = point.x * camera.scale + camera.offsetX;
    const displayY = point.y * camera.scale + camera.offsetY;
    if (displayX >= 0 && displayX <= STAGE_WIDTH && displayY >= 0 && displayY <= STAGE_HEIGHT) {
        return null;
    }

    const centerX = STAGE_WIDTH / 2;
    const centerY = STAGE_HEIGHT / 2;
    const dx = displayX - centerX;
    const dy = displayY - centerY;
    if (dx === 0 && dy === 0) return null;
    const horizontalLimit = (centerX - inset) / Math.max(Math.abs(dx), Number.EPSILON);
    const verticalLimit = (centerY - inset) / Math.max(Math.abs(dy), Number.EPSILON);
    const distanceScale = Math.min(horizontalLimit, verticalLimit);

    return {
        x: centerX + dx * distanceScale,
        y: centerY + dy * distanceScale,
        angle: Math.atan2(dy, dx)
    };
}

function drawMarker(ctx, marker, { color, label }) {
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.rotate(marker.angle);
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 11px "Trebuchet MS", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 5, 18, 0.9)';
    ctx.fillStyle = color;
    const labelY = marker.y < STAGE_HEIGHT / 2 ? marker.y + 22 : marker.y - 22;
    ctx.strokeText(label, marker.x, labelY);
    ctx.fillText(label, marker.x, labelY);
    ctx.restore();
}

function positionOf(object) {
    if (Number.isFinite(object?.x) && Number.isFinite(object?.y)) {
        return { x: object.x, y: object.y };
    }
    return object?.position || null;
}

export class ViewportGuidanceRenderer {
    draw({ ctx, camera, target, bonuses = [], requiredBonuses = null, enabled = false }) {
        if (!enabled) return;
        const targetMarker = calculateViewportIndicator(camera, positionOf(target));
        if (targetMarker) drawMarker(ctx, targetMarker, { color: '#72ff72', label: 'GOAL' });

        if (!Number.isFinite(requiredBonuses) || requiredBonuses <= 0) return;
        const remaining = bonuses.filter(bonus => bonus?.state !== 'Hit');
        for (const bonus of remaining.slice(0, Math.min(requiredBonuses, 2))) {
            const marker = calculateViewportIndicator(camera, positionOf(bonus), DEFAULT_INSET + 8);
            if (marker) drawMarker(ctx, marker, { color: '#ffe45c', label: 'BONUS' });
        }
    }
}

export default ViewportGuidanceRenderer;
