import { WORLD_CONFIG } from './config/gameConfig.js';

export const STAGE_WIDTH = WORLD_CONFIG.stage.width;
export const STAGE_HEIGHT = WORLD_CONFIG.stage.height;

export const CameraMode = Object.freeze({
    LEGACY: 'legacy',
    FIT: 'fit',
    FOLLOW: 'follow'
});

function positiveDimension(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createViewport(cssWidth, cssHeight, devicePixelRatio = 1) {
    const width = positiveDimension(cssWidth, STAGE_WIDTH);
    const height = positiveDimension(cssHeight, STAGE_HEIGHT);
    const pixelRatio = positiveDimension(devicePixelRatio, 1);
    const backingWidth = Math.max(1, Math.round(width * pixelRatio));
    const backingHeight = Math.max(1, Math.round(height * pixelRatio));
    // Preserve every authored gameplay coordinate. The backing buffer still
    // follows the real display resolution, while aspect-ratio differences are
    // absorbed by centered gutters instead of hiding part of the stage.
    const scale = Math.min(backingWidth / STAGE_WIDTH, backingHeight / STAGE_HEIGHT);
    const rawOffsetX = (backingWidth - STAGE_WIDTH * scale) / 2;
    const rawOffsetY = (backingHeight - STAGE_HEIGHT * scale) / 2;
    const offsetX = Object.is(rawOffsetX, -0) ? 0 : rawOffsetX;
    const offsetY = Object.is(rawOffsetY, -0) ? 0 : rawOffsetY;

    return {
        cssWidth: width,
        cssHeight: height,
        pixelRatio,
        backingWidth,
        backingHeight,
        scale,
        offsetX,
        offsetY,
        viewRect: {
            x: 0,
            y: 0,
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT
        }
    };
}

export function applyViewportTransform(ctx, viewport) {
    ctx.setTransform(viewport.scale, 0, 0, viewport.scale, viewport.offsetX, viewport.offsetY);
}

function normalizeRect(rect) {
    return {
        x: Number.isFinite(rect?.x) ? rect.x : 0,
        y: Number.isFinite(rect?.y) ? rect.y : 0,
        width: positiveDimension(rect?.width, STAGE_WIDTH),
        height: positiveDimension(rect?.height, STAGE_HEIGHT)
    };
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(value, maximum));
}

function cameraFromCenter(bounds, scale, centerX, centerY, mode, zoom) {
    const visibleWidth = STAGE_WIDTH / scale;
    const visibleHeight = STAGE_HEIGHT / scale;
    const minimumCenterX = bounds.x + visibleWidth / 2;
    const maximumCenterX = bounds.x + bounds.width - visibleWidth / 2;
    const minimumCenterY = bounds.y + visibleHeight / 2;
    const maximumCenterY = bounds.y + bounds.height - visibleHeight / 2;
    const x = clamp(centerX, minimumCenterX, maximumCenterX) - visibleWidth / 2;
    const y = clamp(centerY, minimumCenterY, maximumCenterY) - visibleHeight / 2;
    return {
        mode,
        zoom,
        scale,
        offsetX: -x * scale,
        offsetY: -y * scale,
        viewRect: { x, y, width: visibleWidth, height: visibleHeight },
        bounds
    };
}

export function createWorldCamera(stageBounds, cameraConfig = null, focus = null) {
    const bounds = normalizeRect(stageBounds);
    if (!cameraConfig) {
        return {
            mode: CameraMode.LEGACY,
            zoom: 1,
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            viewRect: { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT },
            bounds
        };
    }

    const mode = cameraConfig.mode === CameraMode.FOLLOW ? CameraMode.FOLLOW : CameraMode.FIT;
    const fitScale = Math.min(STAGE_WIDTH / bounds.width, STAGE_HEIGHT / bounds.height);
    if (mode === CameraMode.FIT) {
        const offsetX = (STAGE_WIDTH - bounds.width * fitScale) / 2 - bounds.x * fitScale;
        const offsetY = (STAGE_HEIGHT - bounds.height * fitScale) / 2 - bounds.y * fitScale;
        return {
            mode,
            zoom: fitScale,
            scale: fitScale,
            offsetX,
            offsetY,
            viewRect: { ...bounds },
            bounds
        };
    }

    const minimumScale = Math.max(STAGE_WIDTH / bounds.width, STAGE_HEIGHT / bounds.height);
    const requestedZoom = positiveDimension(cameraConfig.zoom, 1);
    const scale = Math.max(minimumScale, requestedZoom);
    const centerX = Number.isFinite(focus?.x) ? focus.x : bounds.x + bounds.width / 2;
    const centerY = Number.isFinite(focus?.y) ? focus.y : bounds.y + bounds.height / 2;
    return cameraFromCenter(bounds, scale, centerX, centerY, mode, requestedZoom);
}

export function updateFollowCamera(camera, target, deltaTime, options = {}) {
    if (!camera || camera.mode !== CameraMode.FOLLOW || !target) return camera;
    const deadZoneRatio = options.deadZoneRatio ?? 0.6;
    const easing = options.easing ?? 7;
    const lookAheadSeconds = options.lookAheadSeconds ?? 0.18;
    const maximumLookAhead = options.maximumLookAhead ?? 100;
    const view = camera.viewRect;
    const center = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    const velocity = target.velocity || { x: 0, y: 0 };
    const lookX = clamp((velocity.x || 0) * lookAheadSeconds, -maximumLookAhead, maximumLookAhead);
    const lookY = clamp((velocity.y || 0) * lookAheadSeconds, -maximumLookAhead, maximumLookAhead);
    const targetX = target.x + lookX;
    const targetY = target.y + lookY;
    const halfDeadWidth = view.width * deadZoneRatio / 2;
    const halfDeadHeight = view.height * deadZoneRatio / 2;
    let desiredX = center.x;
    let desiredY = center.y;
    if (targetX < center.x - halfDeadWidth) desiredX = targetX + halfDeadWidth;
    if (targetX > center.x + halfDeadWidth) desiredX = targetX - halfDeadWidth;
    if (targetY < center.y - halfDeadHeight) desiredY = targetY + halfDeadHeight;
    if (targetY > center.y + halfDeadHeight) desiredY = targetY - halfDeadHeight;
    const blend = 1 - Math.exp(-easing * Math.max(0, deltaTime || 0));
    return cameraFromCenter(
        camera.bounds,
        camera.scale,
        center.x + (desiredX - center.x) * blend,
        center.y + (desiredY - center.y) * blend,
        camera.mode,
        camera.zoom
    );
}

export function applyCameraTransform(ctx, camera) {
    if (!camera) return;
    ctx.transform(camera.scale, 0, 0, camera.scale, camera.offsetX, camera.offsetY);
}

export function clearViewport(ctx, canvas, color = '#000000') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function screenToStage(canvas, viewport, screenX, screenY, camera = null) {
    const rect = canvas.getBoundingClientRect();
    const backingX = (screenX - rect.left) * (viewport.backingWidth / rect.width);
    const backingY = (screenY - rect.top) * (viewport.backingHeight / rect.height);

    const logical = {
        x: (backingX - viewport.offsetX) / viewport.scale,
        y: (backingY - viewport.offsetY) / viewport.scale
    };
    if (!camera) return logical;
    return {
        x: (logical.x - camera.offsetX) / camera.scale,
        y: (logical.y - camera.offsetY) / camera.scale
    };
}

export function stageToScreen(canvas, viewport, stageX, stageY, camera = null) {
    const rect = canvas.getBoundingClientRect();
    const logicalX = camera ? stageX * camera.scale + camera.offsetX : stageX;
    const logicalY = camera ? stageY * camera.scale + camera.offsetY : stageY;
    const backingX = logicalX * viewport.scale + viewport.offsetX;
    const backingY = logicalY * viewport.scale + viewport.offsetY;

    return {
        x: rect.left + backingX * (rect.width / viewport.backingWidth),
        y: rect.top + backingY * (rect.height / viewport.backingHeight)
    };
}
