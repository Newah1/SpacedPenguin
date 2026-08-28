import { RENDER_CONFIG } from '../config/renderConfig.js';
import {
    applyCameraTransform,
    applyViewportTransform,
    clearViewport,
    STAGE_HEIGHT,
    STAGE_WIDTH
} from './viewport.js';

/** Owns frame composition, draw ordering, and render-cache invalidation. */
export class GameRenderer {
    constructor(game) {
        this.game = game;
        this.cachedSortedObjects = null;
        this.renderedWorldRevision = -1;
    }

    beginFrame() {
        clearViewport(this.game.ctx, this.game.canvas);
        applyViewportTransform(this.game.ctx, this.game.viewport);
    }

    sortedObjects() {
        const world = this.game.runtimeWorld();
        if (!this.cachedSortedObjects || this.renderedWorldRevision !== world.revision) {
            this.cachedSortedObjects = [...world.renderables()].sort((a, b) =>
                (a.renderOrder || 0) - (b.renderOrder || 0)
            );
            this.renderedWorldRevision = world.revision;
        }
        return this.cachedSortedObjects;
    }

    render() {
        const game = this.game;
        this.beginFrame();
        const camera = game.getActiveCamera();
        game.viewRect = camera.viewRect;
        game.arrow?.setStageRect(game.viewRect);
        game.ctx.save();
        applyCameraTransform(game.ctx, camera);

        game.drawStars();
        game.drawPlayfieldTraces();

        for (const object of this.sortedObjects()) {
            if (object === game.penguin) {
                game.drawPenguinInPlayfield();
                for (const portal of game.portals || []) portal.drawForeground?.(game.ctx);
            } else if (!game.levelEditor?.shouldDeferRuntimeObjectDraw?.(object)) {
                object.draw(game.ctx);
            }
        }

        if (game.levelEditor?.gravitySculptController?.isTesting()) {
            game.levelEditor.gravitySculptController.onTestTargetHit();
            game.ctx.restore();
            return;
        }

        game.levelEditor.render(game.ctx);
        game.ctx.restore();
        game.kevinCamRenderer.draw({
            ctx: game.ctx,
            enabled: game.settingsManager?.get('kevinCamEnabled') !== false,
            arrowVisible: Boolean(game.arrow?.visible),
            penguin: game.penguin
        });
        game.drawUI();
        game.uiManager.render();
    }

    drawPlayfieldTraces() {
        const game = this.game;
        const playfield = game.stageRect || { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };
        game.ctx.save();
        game.ctx.beginPath();
        game.ctx.rect(playfield.x, playfield.y, playfield.width, playfield.height);
        game.ctx.clip();
        game.drawAllShotPaths(game.ctx);
        game.drawAlphaMasks(game.ctx);
        game.physics.drawTrace(game.ctx);
        game.drawAimAssist?.(game.ctx);
        game.ctx.restore();
    }

    drawAimAssist(ctx) {
        const game = this.game;
        if (game.aimAssistPoints.length < 2 ||
            !game.settingsManager.get('aimAssistEnabled') ||
            game.penguin?.state !== 'pullback') return;
        const config = RENDER_CONFIG.aimAssist;
        ctx.save();
        ctx.globalAlpha = config.alpha;
        ctx.strokeStyle = config.color;
        ctx.lineWidth = config.lineWidth;
        ctx.lineCap = 'round';
        ctx.shadowColor = config.color;
        ctx.shadowBlur = config.glowBlur;
        ctx.setLineDash(config.dash);
        ctx.beginPath();
        ctx.moveTo(game.aimAssistPoints[0].x, game.aimAssistPoints[0].y);
        for (let index = 1; index < game.aimAssistPoints.length; index++) {
            const point = game.aimAssistPoints[index];
            if (point.move) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawPenguinInPlayfield() {
        const game = this.game;
        if (!game.penguin) return;
        const playfield = game.stageRect || { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };
        game.ctx.save();
        game.ctx.beginPath();
        game.ctx.rect(playfield.x, playfield.y, playfield.width, playfield.height);
        game.ctx.clip();
        for (const crashedPenguin of game.crashedPenguins || []) crashedPenguin.draw(game.ctx);
        if (!game.drawPortalTransition?.(game.ctx)) game.penguin.draw(game.ctx);
        game.ctx.restore();
    }
}

export default GameRenderer;
