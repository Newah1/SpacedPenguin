import { assetPath } from '../config/assetConfig.js';
import { RENDER_CONFIG } from '../config/renderConfig.js';
import plog from '../diagnostics/penguinLogger.js';
import Utils from '../platform/utils.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from './viewport.js';

/** Owns non-authoritative flight traces, portal transitions, masks, and stars. */
export class FlightPresentation {
    constructor(game, { initializeAssets = true } = {}) {
        this.game = game;
        this.shotPaths = [];
        this.currentShotPath = [];
        this.currentShotRenderPath = null;
        this.portalTransition = null;
        this.shotColors = RENDER_CONFIG.shotTrails.colors;
        this.currentColorIndex = 0;
        this.isRecordingPath = false;
        this.alphaMasks = [];
        this.alphaMaskImage = null;
        this.alphaMaskStencil = null;
        this.coloredAlphaMaskCanvases = new Map();
        this.stars = [];
        this.starfieldTime = 0;
        this.starDriftSpeed = RENDER_CONFIG.starfield.drift;
        const hostProvidedStars = Object.prototype.hasOwnProperty.call(game, 'stars');
        for (const key of [
            'shotPaths', 'currentShotPath', 'currentShotRenderPath', 'portalTransition',
            'shotColors', 'currentColorIndex', 'isRecordingPath', 'alphaMasks',
            'alphaMaskImage', 'alphaMaskStencil', 'coloredAlphaMaskCanvases',
            'stars', 'starfieldTime', 'starDriftSpeed'
        ]) {
            if (!Object.prototype.hasOwnProperty.call(game, key)) continue;
            this[key] = game[key];
            delete game[key];
            Object.defineProperty(game, key, {
                configurable: true,
                get: () => this[key],
                set: value => { this[key] = value; }
            });
        }
        if (!hostProvidedStars) this.generateStars();
        if (initializeAssets) this.loadAlphaMask();
    }

    startPath() {
        this.isRecordingPath = true;
        this.currentShotPath = [];
        this.currentShotRenderPath = typeof Path2D === 'function' ? new Path2D() : null;
    }

    recordPoint(x, y) {
        if (!this.isRecordingPath || this.game.penguin?.state === 'crashed') return;
        const previous = this.currentShotPath.at(-1);
        if (previous && x === previous.x && y === previous.y) return;
        if (this.currentShotRenderPath) {
            if (previous) this.currentShotRenderPath.lineTo(x, y);
            else this.currentShotRenderPath.moveTo(x, y);
        }
        this.currentShotPath.push({ x, y });
    }

    recordPortalTransit(entryPosition, exitPosition) {
        if (!this.isRecordingPath) return;
        this.recordPoint(entryPosition.x, entryPosition.y);
        this.currentShotRenderPath?.moveTo(exitPosition.x, exitPosition.y);
        this.currentShotPath.push({ x: exitPosition.x, y: exitPosition.y, move: true });
    }

    endPath() {
        if (this.isRecordingPath && this.currentShotPath.length > 1) {
            this.shotPaths.push({
                points: this.currentShotPath,
                renderPath: this.currentShotRenderPath,
                color: this.shotColors[this.currentColorIndex],
                shotNumber: this.shotPaths.length + 1
            });
            if (this.shotPaths.length > RENDER_CONFIG.shotTrails.maximumCompletedPaths) this.shotPaths.shift();
            this.currentColorIndex = (this.currentColorIndex + 1) % this.shotColors.length;
        }
        this.isRecordingPath = false;
        this.currentShotPath = [];
        this.currentShotRenderPath = null;
    }

    clearPaths() {
        this.shotPaths = [];
        this.currentShotPath = [];
        this.currentShotRenderPath = null;
        this.currentColorIndex = 0;
        this.isRecordingPath = false;
    }

    drawPaths(ctx) {
        const drawPath = (shotPath, alpha) => {
            if (shotPath.points.length < 2) return;
            ctx.save();
            ctx.strokeStyle = shotPath.color;
            ctx.lineWidth = RENDER_CONFIG.shotTrails.lineWidth;
            ctx.globalAlpha = alpha;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            if (shotPath.renderPath) ctx.stroke(shotPath.renderPath);
            else {
                ctx.moveTo(shotPath.points[0].x, shotPath.points[0].y);
                for (let index = 1; index < shotPath.points.length; index++) {
                    const point = shotPath.points[index];
                    if (point.move) ctx.moveTo(point.x, point.y);
                    else ctx.lineTo(point.x, point.y);
                }
                ctx.stroke();
            }
            ctx.restore();
        };
        for (const path of this.shotPaths) drawPath(path, RENDER_CONFIG.shotTrails.completedAlpha);
        if (this.isRecordingPath) {
            drawPath({
                points: this.currentShotPath,
                renderPath: this.currentShotRenderPath,
                color: this.shotColors[this.currentColorIndex]
            }, RENDER_CONFIG.shotTrails.activeAlpha);
        }
    }

    drawAlphaMasks(ctx) {
        for (let index = this.alphaMasks.length - 1; index >= 0; index--) {
            const mask = this.alphaMasks[index];
            if (!mask.renderCanvas) continue;
            ctx.save();
            ctx.globalAlpha = mask.alpha;
            ctx.translate(mask.x, mask.y);
            ctx.drawImage(mask.renderCanvas, -8, -13);
            ctx.restore();
        }
    }

    beginPortalTransition(event) {
        this.portalTransition = { ...event, startedAt: globalThis.performance?.now?.() ?? Date.now() };
    }

    drawPortalTransition(ctx) {
        const game = this.game;
        const transition = this.portalTransition;
        if (!transition || !game.penguin) return false;
        const progress = Math.min(1, ((globalThis.performance?.now?.() ?? Date.now()) - transition.startedAt) /
            (RENDER_CONFIG.entities.portal.transitionSeconds * 1000));
        if (progress >= 1) {
            this.portalTransition = null;
            return false;
        }
        const source = game.portals.find(portal => portal.id === transition.sourcePortalId);
        const destination = game.portals.find(portal => portal.id === transition.destinationPortalId);
        if (!source || !destination) return false;
        const length = Math.hypot(transition.incomingVelocity?.x || 0, transition.incomingVelocity?.y || 0) || 1;
        const incoming = {
            x: (transition.incomingVelocity?.x || 1) / length,
            y: (transition.incomingVelocity?.y || 0) / length
        };
        const distance = game.penguin.radius * 2.2 * (1 - progress);
        const entry = {
            x: transition.entryPosition.x - incoming.x * distance,
            y: transition.entryPosition.y - incoming.y * distance
        };
        const exit = {
            x: destination.position.x + (transition.exitPosition.x - destination.position.x) * progress,
            y: destination.position.y + (transition.exitPosition.y - destination.position.y) * progress
        };
        ctx.save();
        ctx.translate(source.position.x, source.position.y);
        ctx.rotate(Utils.toRadians(source.rotation));
        ctx.beginPath();
        ctx.ellipse(0, 0, source.width / 2, source.height / 2, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.rotate(-Utils.toRadians(source.rotation));
        ctx.translate(-source.position.x, -source.position.y);
        game.penguin.drawBodyAt(ctx, entry.x, entry.y);
        ctx.restore();
        game.penguin.drawBodyAt(ctx, exit.x, exit.y);
        return true;
    }

    generateStars() {
        this.stars = [];
        for (let index = 0; index < RENDER_CONFIG.starfield.count; index++) {
            let attempts = 0;
            let candidate;
            do {
                candidate = {
                    x: Math.random() * STAGE_WIDTH,
                    y: Math.random() * STAGE_HEIGHT,
                    size: RENDER_CONFIG.starfield.minimumSize +
                        Math.floor(Math.random() * RENDER_CONFIG.starfield.sizeVariants)
                };
                attempts++;
            } while (attempts < RENDER_CONFIG.starfield.placementAttempts && this.stars.some(star =>
                Math.hypot(star.x - candidate.x, star.y - candidate.y) < RENDER_CONFIG.starfield.minimumDistance
            ));
            this.stars.push(candidate);
        }
    }

    drawStars() {
        const game = this.game;
        const view = game.getActiveCamera?.().viewRect || game.viewRect || game.stageRect ||
            { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };
        const firstTileX = Math.floor(view.x / STAGE_WIDTH);
        const lastTileX = Math.floor((view.x + view.width - 1e-9) / STAGE_WIDTH);
        const firstTileY = Math.floor(view.y / STAGE_HEIGHT);
        const lastTileY = Math.floor((view.y + view.height - 1e-9) / STAGE_HEIGHT);
        game.ctx.save();
        game.ctx.fillStyle = RENDER_CONFIG.starfield.color;
        for (let tileY = firstTileY; tileY <= lastTileY; tileY++) {
            for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
                for (const star of this.stars) {
                    const rawX = star.x + this.starfieldTime * this.starDriftSpeed.x * star.size;
                    const rawY = star.y + this.starfieldTime * this.starDriftSpeed.y * star.size;
                    const x = tileX * STAGE_WIDTH + ((rawX % STAGE_WIDTH) + STAGE_WIDTH) % STAGE_WIDTH;
                    const y = tileY * STAGE_HEIGHT + ((rawY % STAGE_HEIGHT) + STAGE_HEIGHT) % STAGE_HEIGHT;
                    game.ctx.globalAlpha = RENDER_CONFIG.starfield.baseAlpha + star.size * RENDER_CONFIG.starfield.sizeAlpha;
                    game.ctx.fillRect(x, y, star.size, star.size);
                }
            }
        }
        game.ctx.globalAlpha = 1;
        game.ctx.restore();
    }

    createAlphaMask(position = this.game.penguin) {
        if (!position) return;
        const color = this.shotColors[this.currentColorIndex];
        const renderCanvas = Object.prototype.hasOwnProperty.call(this.game, 'getColoredAlphaMaskCanvas')
            ? this.game.getColoredAlphaMaskCanvas(color)
            : this.getColoredAlphaMaskCanvas(color);
        const mask = { x: position.x, y: position.y, color, alpha: 0.6, renderCanvas };
        this.alphaMasks.unshift(mask);
        this.alphaMasks.length = Math.min(this.alphaMasks.length, RENDER_CONFIG.shotTrails.alphaMaskHistory);
    }

    clearAlphaMasks() { this.alphaMasks = []; }

    loadAlphaMask() {
        const cached = this.game.assetLoader?.getUI('alpha_mask');
        this.alphaMaskImage = cached || new Image();
        const prepare = () => {
            try { this.prepareAlphaMaskStencil(); } catch (error) { plog.error('Failed to prepare alpha mask image:', error); }
        };
        if (cached) prepare();
        else {
            this.alphaMaskImage.onload = prepare;
            this.alphaMaskImage.onerror = () => plog.error('Failed to load alpha mask image');
            this.alphaMaskImage.src = assetPath('ui/alpha_mask.png');
        }
    }

    prepareAlphaMaskStencil() {
        const width = this.alphaMaskImage.naturalWidth || this.alphaMaskImage.width;
        const height = this.alphaMaskImage.naturalHeight || this.alphaMaskImage.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(this.alphaMaskImage, 0, 0);
        const imageData = context.getImageData(0, 0, width, height);
        for (let index = 0; index < imageData.data.length; index += 4) {
            const gray = (imageData.data[index] + imageData.data[index + 1] + imageData.data[index + 2]) / 3;
            imageData.data[index] = 255;
            imageData.data[index + 1] = 255;
            imageData.data[index + 2] = 255;
            imageData.data[index + 3] = 255 - gray;
        }
        context.putImageData(imageData, 0, 0);
        this.alphaMaskStencil = canvas;
        this.coloredAlphaMaskCanvases.clear();
    }

    getColoredAlphaMaskCanvas(color) {
        if (!this.alphaMaskStencil) return null;
        if (this.coloredAlphaMaskCanvases.has(color)) return this.coloredAlphaMaskCanvases.get(color);
        const canvas = document.createElement('canvas');
        canvas.width = this.alphaMaskStencil.width;
        canvas.height = this.alphaMaskStencil.height;
        const context = canvas.getContext('2d');
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(this.alphaMaskStencil, 0, 0);
        this.coloredAlphaMaskCanvases.set(color, canvas);
        return canvas;
    }
}

export default FlightPresentation;
