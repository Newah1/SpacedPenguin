import { RENDER_CONFIG } from '../config/renderConfig.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from './viewport.js';

export class KevinCamRenderer {
    constructor(config = {}) {
        this.config = { ...RENDER_CONFIG.kevinCam, ...config };
    }

    draw({ ctx, enabled = true, arrowVisible = false, penguin = null }) {
        if (!enabled || !arrowVisible || !penguin || penguin.state !== PenguinState.SOARING) return;

        const config = this.config;
        const viewRect = { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };
        const width = Math.max(
            config.minWidth,
            Math.min(viewRect.width * config.widthRatio, config.maxWidth)
        );
        const height = width / config.aspectRatio;
        const x = viewRect.x + config.margin;
        const y = viewRect.y + viewRect.height - height - config.margin;
        const contentY = y + config.headerHeight;
        const contentHeight = height - config.headerHeight;
        const centerX = x + width / 2;
        const centerY = contentY + contentHeight / 2;

        ctx.save();

        // Frame and header.
        ctx.shadowColor = config.shadowColor;
        ctx.shadowBlur = config.shadowBlur;
        ctx.fillStyle = config.backgroundColor;
        ctx.fillRect(x, y, width, height);
        ctx.shadowBlur = 0;
        ctx.fillStyle = config.headerColor;
        ctx.fillRect(x, y, width, config.headerHeight);

        // A deliberately goofy, hand-lettered label.
        const label = config.label;
        const colors = config.labelColors;
        ctx.font = config.labelFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const letterSpacing = config.labelLetterSpacing;
        const labelStart = centerX - ((label.length - 1) * letterSpacing) / 2;
        for (let i = 0; i < label.length; i++) {
            ctx.save();
            ctx.translate(labelStart + i * letterSpacing, y + config.headerHeight / 2 + (i % 2 ? 2 : -1));
            ctx.rotate((i % 2 ? 1 : -1) * 0.08);
            ctx.fillStyle = colors[i % colors.length];
            ctx.fillText(label[i], 0, 0);
            ctx.restore();
        }

        // Clip the live view so Kevin and his trail cannot cover the frame.
        ctx.beginPath();
        ctx.rect(x + 3, contentY, width - 6, contentHeight - 3);
        ctx.clip();

        // Wrapping parallax stars keep the inset moving beyond the stage.
        ctx.fillStyle = config.starColor;
        for (let i = 0; i < config.starCount; i++) {
            const rawX = i * 67.31 - penguin.x * 0.12;
            const rawY = i * i * 19.17 - penguin.y * 0.12;
            const starX = x + 4 + ((rawX % (width - 8)) + (width - 8)) % (width - 8);
            const starY = contentY + 3 + ((rawY % (contentHeight - 6)) + (contentHeight - 6)) % (contentHeight - 6);
            const size = i % 7 === 0 ? 2 : 1;
            ctx.globalAlpha = i % 3 === 0 ? 0.9 : 0.55;
            ctx.fillRect(starX, starY, size, size);
        }
        ctx.globalAlpha = 1;

        // Reuse the current animation frame rather than advancing another one.
        ctx.translate(centerX - penguin.x * config.zoom, centerY - penguin.y * config.zoom);
        ctx.scale(config.zoom, config.zoom);
        penguin.draw(ctx);
        ctx.restore();

        // Draw the crisp border above the clipped camera view.
        ctx.save();
        ctx.strokeStyle = config.borderColor;
        ctx.lineWidth = config.borderWidth;
        ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
        ctx.restore();
    }
}
import { PenguinState } from '../runtime/penguinState.js';
