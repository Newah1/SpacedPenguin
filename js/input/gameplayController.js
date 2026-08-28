import { INPUT_CONFIG, isMobileViewport } from '../config/inputConfig.js';
import { RUNTIME_CONFIG } from '../config/runtimeConfig.js';
import { GameState } from '../runtime/gameState.js';
import { createButton } from '../ui/buttonFramework.js';
import { screenToStage } from '../rendering/viewport.js';

/** Owns gameplay pointer state and the mobile gameplay controls. */
export class GameplayController {
    constructor(game) {
        this.game = game;
        this.mouseDown = false;
        this.mousePosition = { x: 0, y: 0 };
        this.isDragging = false;
        this.mobileUIOverlay = null;
        this.mobileInstructions = null;
        this.launchIndicator = null;
    }

    isMobileDevice() {
        return isMobileViewport();
    }

    setupMobileControls() {
        if (this.isMobileDevice()) this.createMobileControlButtons();
    }

    createMobileControlButtons() {
        document.querySelectorAll('.mobile-control-button, .mobile-ui-overlay')
            .forEach(button => button.remove());
        this.mobileUIOverlay = document.createElement('div');
        this.mobileUIOverlay.className = 'mobile-ui-overlay';
        this.mobileUIOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:150;font-family:Arial,sans-serif;';
        const controlPanel = document.createElement('div');
        controlPanel.style.cssText = 'position:absolute;top:10px;right:10px;display:flex;flex-direction:column;gap:8px;pointer-events:auto;';
        const buttonStyle = 'border:none;padding:12px 16px;border-radius:25px;font-size:14px;font-weight:bold;touch-action:manipulation;min-height:44px;box-shadow:0 2px 8px rgba(0,0,0,.3);backdrop-filter:blur(10px);';
        const resetButton = createButton('TRY AGAIN', () => {
            const game = this.game;
            if (game.state === GameState.PLAYING || (game.state === GameState.LEVEL_EDITOR && game.levelEditor.mode === 'play')) {
                game.tryAgain();
                if ('vibrate' in navigator) navigator.vibrate(INPUT_CONFIG.hapticsMs.mobileControl);
            }
        }, { backgroundColor: 'rgba(255, 100, 100, 0.9)', hoverColor: 'rgba(255, 135, 135, 0.96)', textColor: 'white' });
        resetButton.classList.add('mobile-control-button');
        resetButton.textContent = '↻ TRY AGAIN';
        resetButton.style.cssText += buttonStyle;
        const quitButton = createButton('QUIT', () => {
            const game = this.game;
            if (game.state === GameState.PLAYING || (game.state === GameState.LEVEL_EDITOR && game.levelEditor.mode === 'play')) {
                game.showQuitDialog();
            }
        }, { backgroundColor: 'rgba(128, 128, 128, 0.9)', hoverColor: 'rgba(160, 160, 160, 0.96)', textColor: 'white' });
        quitButton.classList.add('mobile-control-button');
        quitButton.textContent = '✕ QUIT';
        quitButton.style.cssText += buttonStyle;
        controlPanel.append(resetButton, quitButton);

        this.mobileInstructions = document.createElement('div');
        this.mobileInstructions.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.8);color:white;padding:12px 20px;border-radius:25px;font-size:14px;text-align:center;pointer-events:none;max-width:90%;box-shadow:0 2px 8px rgba(0,0,0,.3);backdrop-filter:blur(10px);transition:opacity .3s ease;';
        this.createLaunchFeedback();
        this.mobileUIOverlay.append(controlPanel, this.mobileInstructions);
        document.body.appendChild(this.mobileUIOverlay);
        this.updateMobileInstructions();
        setTimeout(() => {
            if (this.mobileInstructions) this.mobileInstructions.style.opacity = '0.6';
        }, RUNTIME_CONFIG.mobileInstructionsFadeDelayMs);
    }

    createLaunchFeedback() {
        this.launchIndicator = document.createElement('div');
        this.launchIndicator.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:100px;height:100px;border:3px solid rgba(0,255,255,.8);border-radius:50%;pointer-events:none;opacity:0;transition:all .2s ease;box-shadow:0 0 20px rgba(0,255,255,.5);';
        this.mobileUIOverlay.appendChild(this.launchIndicator);
    }

    updateMobileInstructions() {
        if (!this.mobileInstructions || !this.isMobileDevice()) return;
        const game = this.game;
        let text = '👆 Touch to interact';
        if (game.state === GameState.MENU) text = '👆 Tap anywhere to start';
        else if (game.state === GameState.LEVEL_EDITOR) {
            text = game.levelEditor?.mode === 'play'
                ? '🎮 Testing level - drag to launch'
                : '✏️ Level Editor - long press to add objects';
        } else if (game.state === GameState.PLAYING) {
            const state = game.penguin?.state;
            if (state === 'idle') text = '🎯 Drag penguin to aim, release to launch';
            else if (state === 'pullback') text = '🎯 Release to launch!';
            else if (state === 'soaring') text = '👆 Tap to try again';
            else text = '🐧 Ready to launch!';
        }
        this.mobileInstructions.textContent = text;
    }

    showLaunchFeedback(show = true) {
        if (!this.launchIndicator) return;
        this.launchIndicator.style.opacity = show ? '1' : '0';
        this.launchIndicator.style.transform = show
            ? 'translate(-50%, -50%) scale(1.2)'
            : 'translate(-50%, -50%) scale(1)';
    }

    getMousePosition(event) {
        const game = this.game;
        return screenToStage(game.canvas, game.viewport, event.clientX, event.clientY, game.getActiveCamera());
    }

    handleMouseDown(event) {
        const game = this.game;
        this.mouseDown = true;
        this.mousePosition = this.getMousePosition(event);
        if (game.state === GameState.MENU) return game.startGame();
        if (game.state === GameState.LEVEL_EDITOR && game.levelEditor.active && game.levelEditor.mode === 'edit') {
            return game.levelEditor.handleMouseDown(event);
        }
        const canUseSlingshot = game.state === GameState.PLAYING ||
            (game.state === GameState.LEVEL_EDITOR && game.levelEditor.mode === 'play');
        if (canUseSlingshot && game.penguin.state === 'idle') {
            this.isDragging = true;
            game.slingshot.startPull(this.mousePosition.x, this.mousePosition.y);
            game.penguin.setState('pullback');
            game.updateAimAssistPreview();
            if (this.isMobileDevice()) {
                this.showLaunchFeedback(true);
                this.updateMobileInstructions();
            }
        }
    }

    handleMouseMove(event) {
        const game = this.game;
        this.mousePosition = this.getMousePosition(event);
        if (game.state === GameState.LEVEL_EDITOR && game.levelEditor.active && game.levelEditor.mode === 'edit') {
            return game.levelEditor.handleMouseMove(event);
        }
        if (this.isDragging && game.slingshot.isPulling) {
            game.slingshot.updatePullback(this.mousePosition.x, this.mousePosition.y);
            game.updateAimAssistPreview();
        }
    }

    handleMouseUp(event) {
        const game = this.game;
        this.mouseDown = false;
        if (game.state === GameState.LEVEL_EDITOR && game.levelEditor.active && game.levelEditor.mode === 'edit') {
            return game.levelEditor.handleMouseUp(event);
        }
        if (this.isDragging) {
            this.isDragging = false;
            game.aimAssistPoints = [];
            const velocity = game.slingshot.release();
            game.launchPenguin(velocity, game.slingshot.lastLaunch);
            if (this.isMobileDevice()) {
                this.showLaunchFeedback(false);
                this.updateMobileInstructions();
            }
        } else {
            const canUseSlingshot = game.state === GameState.PLAYING ||
                (game.state === GameState.LEVEL_EDITOR && game.levelEditor.mode === 'play');
            if (canUseSlingshot && game.penguin?.state === 'soaring') game.tryAgain();
        }
    }

    handleTouchStart(event) {
        event.preventDefault();
        event.stopPropagation();
        const touch = event.touches[0];
        if (touch) this.handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    }

    handleTouchMove(event) {
        event.preventDefault();
        event.stopPropagation();
        const touch = event.touches[0];
        if (touch) this.handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }

    handleTouchEnd(event) {
        event.preventDefault();
        event.stopPropagation();
        this.handleMouseUp({ clientX: 0, clientY: 0 });
    }

    handleKeyDown(event) {
        const game = this.game;
        if (event.key === '`') {
            event.preventDefault();
            game.console.toggle();
            return;
        }
        if (game.console.visible) return;
        const canUsePlayKeys = game.state === GameState.PLAYING ||
            (game.state === GameState.LEVEL_EDITOR && game.levelEditor.mode === 'play');
        switch (event.key.toLowerCase()) {
            case 'q':
                if (canUsePlayKeys) game.showQuitDialog();
                break;
            case 'r':
                if (canUsePlayKeys) game.tryAgain();
                break;
            case ' ':
                if (game.state === GameState.MENU && !this.isMobileDevice() && !event.defaultPrevented) game.startGame();
                break;
            default:
                if (canUsePlayKeys && game.penguin?.state === 'soaring') game.tryAgain();
        }
    }
}

export default GameplayController;
