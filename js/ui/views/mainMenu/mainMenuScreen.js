import { isMobileViewport } from '../../../config/inputConfig.js';
import { screenToStage } from '../../../rendering/viewport.js';
import { CanvasButton, createButton } from '../../buttonFramework.js';
import { MainMenuRenderer } from './mainMenuRenderer.js';
import { MenuSlingshotModel } from './menuSlingshotModel.js';

export class MainMenuScreen {
    constructor(options) {
        this.canvas = options.canvas;
        this.assetLoader = options.assetLoader;
        this.beginFrame = options.beginFrame;
        this.getHighScore = options.getHighScore;
        this.hasActiveScreens = options.hasActiveScreens;
        this.actions = options.actions;
        this.isMobile = options.isMobile ?? isMobileViewport();
        this.model = options.model || new MenuSlingshotModel();
        this.renderer = options.renderer || new MainMenuRenderer(this.assetLoader);
        this.buttons = this.createButtons();
        this.active = false;
        this.mobileStartButton = null;
    }

    createButtons() {
        const originalButton = (x, y, width, height, label, action, fontSize, icon) =>
            new CanvasButton(x, y, width, height, label, action, {
                hitTest: (pointX, pointY) => pointX >= x && pointX <= x + width &&
                    pointY >= y && pointY <= y + height,
                renderButton: (ctx, button) => this.renderer.drawOriginalButton(
                    ctx, x, y, width, height, button.text, fontSize, icon, button
                )
            });
        const buttonsStartX = -30;
        const gap = 40;
        return {
            highScores: originalButton(buttonsStartX + 40, 517, 186, 54, 'High Scores',
                this.actions.showHighScores, 15, 'trophy'),
            levelEditor: originalButton(buttonsStartX + 200 + gap, 517, 176, 54, 'Level Editor',
                this.actions.openLevelEditor, 15, 'pencil'),
            loadLevel: originalButton(buttonsStartX + 390 + gap, 517, 156, 54, 'Browse Levels',
                this.actions.showLevelBrowser, 15, 'folder'),
            start: new CanvasButton(563, 464, 184, 96, 'Start', () => this.start(), {
                hitTest: (x, y) => this.model.containsStartButton({ x, y }),
                renderButton: (ctx, button) => this.renderer.drawStartButton(ctx, button)
            })
        };
    }

    show() {
        if (this.active) return;
        this.active = true;
        document.body.classList.add('is-menu');
        if (this.isMobile) this.ensureMobileStartButton();
    }

    hide() {
        if (!this.active && !this.mobileStartButton) return;
        this.active = false;
        document.body.classList.remove('is-menu');
        this.mobileStartButton?.remove();
        this.mobileStartButton = null;
        this.model.reset();
        this.canvas.style.cursor = 'default';
        Object.values(this.buttons).forEach(button => button.handlePointerUp());
    }

    render(time) {
        if (!this.active) return;
        this.model.update(time);
        this.beginFrame();
        this.renderer.render(
            this.canvas.getContext('2d'),
            time,
            this.model,
            this.buttons,
            this.getHighScore()
        );
    }

    start() {
        if (!this.active) return false;
        this.actions.startGame();
        return true;
    }

    getStagePoint(event) {
        return screenToStage(
            this.canvas,
            this.canvas.viewport,
            event.clientX,
            event.clientY
        );
    }

    handlePointerDown(event) {
        if (!this.canInteract()) return false;
        const point = this.getStagePoint(event);
        for (const button of Object.values(this.buttons)) {
            if (button.handlePointerDown(point.x, point.y)) {
                this.model.clearClickSuppression();
                this.canvas.style.cursor = 'pointer';
                return true;
            }
        }
        return this.model.beginDrag(point);
    }

    handlePointerMove(event) {
        if (!this.canInteract()) return false;
        const point = this.getStagePoint(event);
        if (this.model.dragging) {
            this.model.dragTo(point);
            this.canvas.style.cursor = 'grabbing';
            return true;
        }
        const hovered = Object.values(this.buttons).some(button =>
            button.handlePointerMove(point.x, point.y)
        );
        this.canvas.style.cursor = hovered ? 'pointer' : 'default';
        return hovered;
    }

    handlePointerUp(event) {
        if (!this.canInteract()) return false;
        const point = this.getStagePoint(event);
        if (Object.values(this.buttons).some(button => button.isPressed)) {
            Object.values(this.buttons).forEach(button => button.handlePointerUp());
            this.handlePointerMove(event);
            return true;
        }
        return this.model.release(point);
    }

    handleClick(event) {
        if (!this.canInteract()) return false;
        if (this.model.consumeClickSuppression()) return false;
        const point = this.getStagePoint(event);
        if (Object.values(this.buttons).some(button => button.handleClick(point.x, point.y, event))) {
            return true;
        }
        if (!this.model.containsStartButton(point)) return false;
        return this.start();
    }

    canInteract() {
        return this.active && !this.hasActiveScreens();
    }

    ensureMobileStartButton() {
        if (this.mobileStartButton?.isConnected) return;
        const button = createButton('▶  TAP TO LAUNCH', () => this.start(), {
            backgroundColor: '#fff3bb',
            hoverColor: '#fff9d7',
            activeColor: '#f5df91',
            textColor: '#f47b20',
            borderColor: '#f79433'
        });
        button.id = 'mobileStartButton';
        button.setAttribute('aria-label', 'TAP TO LAUNCH');
        button.style.cssText += `
            position: absolute;
            top: 82%;
            left: 81%;
            transform: translate(-50%, -50%);
            padding: 14px 24px;
            font-family: Arial, sans-serif;
            font-size: 18px;
            font-weight: 900;
            letter-spacing: .5px;
            border-radius: 50%;
            box-shadow: 0 0 0 2px #ffca69;
            z-index: 100;
            min-width: 170px;
            touch-action: manipulation;
        `;
        this.mobileStartButton = button;
        this.canvas.parentElement.appendChild(button);
    }

    destroy() {
        this.hide();
    }
}
