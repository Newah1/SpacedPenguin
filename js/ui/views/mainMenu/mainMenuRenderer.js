import Utils from '../../../platform/utils.js';
import { STAGE_HEIGHT, STAGE_WIDTH } from '../../../rendering/viewport.js';
import { Penguin } from '../../../runtime/entities/penguin.js';

export class MainMenuRenderer {
    constructor(assetLoader) {
        this.assetLoader = assetLoader;
        this.kevin = new Penguin(assetLoader);
    }

    render(ctx, time, model, buttons, highScore) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
        this.drawTitle(ctx);
        this.drawConsole(ctx, time, model, buttons, highScore);
    }

    roundedRectPath(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    drawTitle(ctx) {
        const title = this.assetLoader.createTitle();
        const spaced = title.spacedText;
        const penguin = title.penguinText;
        const kevinShip = this.assetLoader.getGameSprite('ship_closed');
        ctx.save();
        if (kevinShip) ctx.drawImage(kevinShip, 22, 51, 92, 64);
        if (spaced && penguin) {
            const spacedWidth = 242;
            const spacedHeight = spacedWidth * (spaced.height / spaced.width);
            const penguinWidth = 310;
            const penguinHeight = penguinWidth * (penguin.height / penguin.width);
            const spacedY = 68;
            const penguinY = spacedY + spacedHeight + 3;
            ctx.drawImage(spaced, 105, spacedY, spacedWidth, spacedHeight);
            ctx.drawImage(penguin, 34, penguinY, penguinWidth, penguinHeight);
        } else {
            ctx.fillStyle = '#ff9c23';
            ctx.font = 'italic 900 46px Georgia, serif';
            ctx.textAlign = 'left';
            ctx.fillText('SPACED', 105, 105);
            ctx.fillText('PENGUIN!', 34, 158);
        }
        ctx.restore();
    }

    drawConsole(ctx, time, model, buttons, highScore) {
        this.drawHowToPlayCard(ctx);
        this.drawTryItVignette(ctx, time, model);
        buttons.highScores.render(ctx);
        buttons.levelEditor.render(ctx);
        buttons.loadLevel.render(ctx);
        buttons.start.render(ctx);
        for (const planet of model.getStartPlanets(time)) {
            const glow = ctx.createRadialGradient(planet.x - 4, planet.y - 5, 2, planet.x, planet.y, 18);
            glow.addColorStop(0, '#56a8ff');
            glow.addColorStop(0.45, '#174cff');
            glow.addColorStop(1, '#3113d0');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, 18, 0, Math.PI * 2);
            ctx.fill();
        }
        if (highScore > 0) {
            ctx.fillStyle = '#ffb343';
            ctx.font = '700 13px Arial, sans-serif';
            ctx.fillText(`BEST  ${Utils.formatScore(highScore)}`, 123, 590);
        }
    }

    drawHowToPlayCard(ctx) {
        const x = 385;
        const y = 50;
        const width = 365;
        const height = 337;
        this.roundedRectPath(ctx, x, y, width, height, 30);
        ctx.fillStyle = '#f99a3e';
        ctx.fill();
        ctx.fillStyle = '#151515';
        ctx.textAlign = 'left';
        ctx.font = '900 23px Arial, sans-serif';
        ctx.fillText('How to Play', x + 20, y + 32);
        ctx.font = '15px Arial, sans-serif';
        [
            'Hey there, space cadet! Kevin took a wrong',
            'turn and ended up lost in space! Use the',
            'highly advanced GPS (Giant Penguin',
            'Slingshot) to launch him back to the ship.',
            "Here's how:"
        ].forEach((line, index) => ctx.fillText(line, x + 20, y + 57 + index * 17));
        this.roundedRectPath(ctx, x + 20, y + 142, width - 40, 103, 15);
        ctx.fillStyle = '#fff4bb';
        ctx.fill();
        ctx.fillStyle = '#3b3120';
        ctx.font = '15px Arial, sans-serif';
        [
            '1. Click on Kevin and hold down',
            '   your mouse button',
            '2. Drag your mouse to pull him back',
            '3. Release the button to launch Kevin!'
        ].forEach((line, index) => ctx.fillText(line, x + 38, y + 164 + index * 22));
        ctx.fillStyle = '#2e2419';
        ctx.fillText('Use the gravity of nearby planets to help send', x + 20, y + 273);
        ctx.fillText('Kevin in the right direction.', x + 20, y + 291);
        ctx.font = '900 15px Arial, sans-serif';
        ctx.fillText('Good luck!', x + 62, y + 322);
        this.drawTipsBadge(ctx, x + width - 85, y + height - 41);
    }

    drawTryItVignette(ctx, time, model) {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.font = '900 22px Arial, sans-serif';
        ctx.fillText('Try it!', 42, 333);
        ctx.font = '16px Arial, sans-serif';
        ctx.fillText('Click and pull on', 42, 358);
        ctx.fillText('Kevin to test the', 42, 377);
        ctx.fillText('GPS!', 42, 396);
        ctx.save();
        ctx.translate(model.anchor.x, model.anchor.y);
        ctx.rotate(-0.08);
        ctx.strokeStyle = '#16dff3';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 17, 39, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (!model.launched) {
            const targetX = model.position.x - model.anchor.x;
            const targetY = model.position.y - model.anchor.y;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-2, -22);
            ctx.lineTo(targetX, targetY);
            ctx.moveTo(-2, 22);
            ctx.lineTo(targetX, targetY);
            ctx.stroke();
        }
        ctx.restore();
        this.drawKevin(ctx, time, model);
    }

    drawKevin(ctx, time, model) {
        this.kevin.x = model.position.x;
        this.kevin.y = model.position.y;
        this.kevin.trail = model.trail;
        this.kevin.aniFrame = Math.floor(time * 8) % 12;
        const rotation = model.launched
            ? Math.atan2(model.velocity.y, model.velocity.x)
            : Math.sin(time * 5) * 0.08;
        this.kevin.drawTrailCanvas(ctx);
        ctx.save();
        ctx.translate(model.position.x, model.position.y);
        ctx.rotate(rotation);
        ctx.translate(-model.position.x, -model.position.y);
        if (this.kevin.realSpritesLoaded && this.kevin.spriteSheets?.[this.kevin.currentAnimationType]) {
            this.kevin.drawRealSprite(ctx);
        } else {
            this.kevin.drawFallbackSprite(ctx);
        }
        ctx.restore();
    }

    drawOriginalButton(ctx, x, y, width, height, text, fontSize, icon, button = {}) {
        ctx.save();
        this.roundedRectPath(ctx, x, y, width, height, 8);
        ctx.fillStyle = button.isPressed ? '#e46d12' : button.isHovered ? '#ffb24d' : '#f79433';
        ctx.fill();
        this.roundedRectPath(ctx, x + 6, y + 6, width - 12, height - 12, 4);
        ctx.fillStyle = '#fff3bb';
        ctx.fill();
        ctx.fillStyle = '#f47b20';
        ctx.font = `900 ${fontSize}px "Trebuchet MS", Arial, sans-serif`;
        ctx.letterSpacing = `${Math.max(0.3, fontSize * 0.025)}px`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const centerY = y + height / 2;
        const iconSize = 16;
        const iconLabelGap = 10;
        const labelWidth = ctx.measureText(text).width;
        const contentWidth = iconSize + iconLabelGap + labelWidth;
        const contentX = x + (width - contentWidth) / 2;
        this.drawIcon(ctx, icon, contentX + iconSize / 2, centerY, iconSize);
        ctx.fillText(text, contentX + iconSize + iconLabelGap, centerY);
        ctx.restore();
    }

    drawTipsBadge(ctx, x, y) {
        ctx.save();
        ctx.fillStyle = '#fff3bb';
        ctx.beginPath();
        ctx.arc(x + 14, y + 14, 14, 0, Math.PI * 2);
        ctx.fill();
        this.drawIcon(ctx, 'bulb', x + 14, y + 14, 14);
        ctx.fillStyle = '#2e2419';
        ctx.font = '900 15px Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('TIPS', x + 33, y + 19);
        ctx.restore();
    }

    drawIcon(ctx, icon, x, y, size, options = {}) {
        ctx.save();
        ctx.translate(x, y);
        const color = options.color || '#f47b20';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(2, size * 0.14);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (icon === 'trophy') {
            ctx.strokeRect(-size * 0.32, -size * 0.45, size * 0.64, size * 0.48);
            ctx.beginPath();
            ctx.moveTo(-size * 0.32, -size * 0.3);
            ctx.quadraticCurveTo(-size * 0.72, -size * 0.3, -size * 0.48, size * 0.08);
            ctx.moveTo(size * 0.32, -size * 0.3);
            ctx.quadraticCurveTo(size * 0.72, -size * 0.3, size * 0.48, size * 0.08);
            ctx.moveTo(0, size * 0.03);
            ctx.lineTo(0, size * 0.36);
            ctx.moveTo(-size * 0.3, size * 0.46);
            ctx.lineTo(size * 0.3, size * 0.46);
            ctx.stroke();
        } else if (icon === 'pencil') {
            ctx.rotate(-0.72);
            ctx.translate(0, size * 0.1);
            ctx.strokeRect(-size * 0.15, -size * 0.42, size * 0.3, size * 0.84);
            ctx.beginPath();
            ctx.moveTo(-size * 0.15, -size * 0.42);
            ctx.lineTo(0, -size * 0.65);
            ctx.lineTo(size * 0.15, -size * 0.42);
            ctx.moveTo(-size * 0.15, size * 0.28);
            ctx.lineTo(size * 0.15, size * 0.28);
            ctx.stroke();
        } else if (icon === 'folder') {
            ctx.beginPath();
            ctx.moveTo(-size * 0.55, -size * 0.34);
            ctx.lineTo(-size * 0.12, -size * 0.34);
            ctx.lineTo(size * 0.03, -size * 0.15);
            ctx.lineTo(size * 0.55, -size * 0.15);
            ctx.lineTo(size * 0.46, size * 0.4);
            ctx.lineTo(-size * 0.46, size * 0.4);
            ctx.closePath();
            ctx.stroke();
        } else if (icon === 'bulb') {
            ctx.beginPath();
            ctx.arc(0, -size * 0.12, size * 0.34, Math.PI * 0.78, Math.PI * 0.22);
            ctx.quadraticCurveTo(size * 0.2, size * 0.24, size * 0.16, size * 0.34);
            ctx.lineTo(-size * 0.16, size * 0.34);
            ctx.quadraticCurveTo(-size * 0.2, size * 0.24, -size * 0.24, size * 0.16);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-size * 0.14, size * 0.5);
            ctx.lineTo(size * 0.14, size * 0.5);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawStartButton(ctx, button) {
        ctx.save();
        ctx.translate(655, 512);
        ctx.rotate(-0.08);
        ctx.fillStyle = button.isPressed ? '#e46d12' : button.isHovered ? '#ffb24d' : '#f79433';
        ctx.beginPath();
        ctx.ellipse(0, 0, 92, 48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff3bb';
        ctx.beginPath();
        ctx.ellipse(0, 0, 84, 40, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f47b20';
        ctx.font = '900 39px Arial, sans-serif';
        ctx.letterSpacing = '0.8px';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.beginPath();
        ctx.moveTo(-58, -13);
        ctx.lineTo(-58, 13);
        ctx.lineTo(-38, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillText('Start', 18, 13);
        ctx.restore();
    }
}
