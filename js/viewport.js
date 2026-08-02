import { WORLD_CONFIG } from './config/gameConfig.js';

export const STAGE_WIDTH = WORLD_CONFIG.stage.width;
export const STAGE_HEIGHT = WORLD_CONFIG.stage.height;

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

export function clearViewport(ctx, canvas, color = '#000000') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function screenToStage(canvas, viewport, screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    const backingX = (screenX - rect.left) * (viewport.backingWidth / rect.width);
    const backingY = (screenY - rect.top) * (viewport.backingHeight / rect.height);

    return {
        x: (backingX - viewport.offsetX) / viewport.scale,
        y: (backingY - viewport.offsetY) / viewport.scale
    };
}

export function stageToScreen(canvas, viewport, stageX, stageY) {
    const rect = canvas.getBoundingClientRect();
    const backingX = stageX * viewport.scale + viewport.offsetX;
    const backingY = stageY * viewport.scale + viewport.offsetY;

    return {
        x: rect.left + backingX * (rect.width / viewport.backingWidth),
        y: rect.top + backingY * (rect.height / viewport.backingHeight)
    };
}
