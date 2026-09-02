import { INPUT_CONFIG, isMobileViewport } from '../config/inputConfig.js';
import { RUNTIME_CONFIG } from '../config/runtimeConfig.js';
import { GameState } from '../runtime/gameState.js';
import { PenguinState } from '../runtime/penguinState.js';
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
        this.mobileLookAroundButton = null;
        this.lookAroundMode = false;
        this.lookAroundPointerActive = false;
        this.lookAroundLastClientPosition = null;
    }

    isMobileDevice() {
        return isMobileViewport();
    }

    setupMobileControls() {
        if (this.isMobileDevice()) this.createMobileControlButtons();
    }

    clearMobileControls() {
        if (this.lookAroundMode) this.game.resetWorldCamera?.();
        this.lookAroundMode = false;
        this.mouseDown = false;
        this.isDragging = false;
        this.lookAroundPointerActive = false;
        this.lookAroundLastClientPosition = null;
        this.mobileUIOverlay?.remove();
        this.mobileUIOverlay = null;
        this.mobileInstructions = null;
        this.mobileLookAroundButton = null;
    }

    createMobileControlButtons() {
        this.clearMobileControls();
        document.querySelectorAll('.mobile-ui-overlay').forEach(overlay => overlay.remove());
        this.mobileUIOverlay = document.createElement('div');
        this.mobileUIOverlay.className = 'mobile-ui-overlay';
        this.mobileUIOverlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:150;font-family:Arial,sans-serif;';
        const controlPanel = document.createElement('div');
        controlPanel.className = 'mobile-control-panel';
        controlPanel.style.cssText = 'position:absolute;display:flex;flex-direction:column;pointer-events:auto;';
        const buttonStyle = 'border:none;border-radius:25px;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,.3);backdrop-filter:blur(10px);';
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

        const lookAroundButton = createButton('LOOK AROUND', () => {
            this.setLookAroundMode(!this.lookAroundMode);
            if ('vibrate' in navigator) navigator.vibrate(INPUT_CONFIG.hapticsMs.mobileControl);
        }, {
            backgroundColor: 'rgba(54, 128, 196, 0.92)',
            hoverColor: 'rgba(79, 157, 222, 0.96)',
            textColor: 'white'
        });
        lookAroundButton.classList.add('mobile-control-button', 'mobile-look-around-button');
        lookAroundButton.textContent = '👀 LOOK AROUND';
        lookAroundButton.setAttribute('aria-pressed', 'false');
        lookAroundButton.style.cssText += buttonStyle;
        this.mobileLookAroundButton = lookAroundButton;

        controlPanel.append(resetButton, lookAroundButton, quitButton);

        this.mobileInstructions = document.createElement('div');
        this.mobileInstructions.className = 'mobile-instructions';
        this.mobileInstructions.style.cssText = 'position:absolute;transform:none;background:rgba(0,0,0,.8);color:white;border-radius:25px;text-align:center;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.3);backdrop-filter:blur(10px);transition:opacity .3s ease;';
        this.mobileUIOverlay.append(controlPanel, this.mobileInstructions);
        document.body.appendChild(this.mobileUIOverlay);
        this.updateMobileInstructions();
        setTimeout(() => {
            if (this.mobileInstructions) this.mobileInstructions.style.opacity = '0.6';
        }, RUNTIME_CONFIG.mobileInstructionsFadeDelayMs);
    }

    // Kept as a no-op for the browser facade's legacy method contract. Mobile
    // launch feedback is now communicated by the instruction pill.
    createLaunchFeedback() {}

    // Kept as a no-op for callers from older game lifecycle paths.
    showLaunchFeedback() {}

    setLookAroundMode(enabled) {
        const nextMode = Boolean(enabled);
        if (nextMode === this.lookAroundMode) return;

        this.lookAroundMode = nextMode;
        this.isDragging = false;
        this.lookAroundPointerActive = false;
        this.lookAroundLastClientPosition = null;

        if (!nextMode) this.game.resetWorldCamera?.();
        if (this.mobileLookAroundButton) {
            this.mobileLookAroundButton.textContent = nextMode ? '✓ AIM' : '👀 LOOK AROUND';
            this.mobileLookAroundButton.setAttribute('aria-pressed', String(nextMode));
        }
        this.updateMobileInstructions();
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
            if (this.lookAroundMode) text = '👀 Drag to look around · tap ✓ AIM to return';
            else {
                const state = game.penguin?.state;
                if (state === PenguinState.IDLE) text = '🎯 Drag penguin to aim, release to launch';
                else if (state === PenguinState.PULLBACK) text = '🎯 Release to launch!';
                else if (state === PenguinState.SOARING) text = '👆 Tap to try again';
                else text = '🐧 Ready to launch!';
            }
        }
        this.mobileInstructions.textContent = text;
    }

    getMousePosition(event) {
        const game = this.game;
        return screenToStage(game.canvas, game.viewport, event.clientX, event.clientY, game.getActiveCamera());
    }

    handleMouseDown(event) {
        const game = this.game;
        this.mouseDown = true;
        if (this.lookAroundMode) {
            this.lookAroundPointerActive = true;
            this.lookAroundLastClientPosition = { x: event.clientX, y: event.clientY };
            return;
        }
        this.mousePosition = this.getMousePosition(event);
        if (game.state === GameState.MENU) return game.startGame();
        if (game.state === GameState.LEVEL_EDITOR && game.levelEditor.active && game.levelEditor.mode === 'edit') {
            return game.levelEditor.handleMouseDown(event);
        }
        const canUseSlingshot = game.state === GameState.PLAYING ||
            (game.state === GameState.LEVEL_EDITOR && game.levelEditor.mode === 'play');
        if (canUseSlingshot && game.penguin.state === PenguinState.IDLE) {
            // A persistent Wasm runtime owns the immutable simulation state
            // between frames. Pullback is an interactive, pre-launch state
            // owned by the pointer, so discard any idle runtime snapshot
            // before changing Kevin's live position/state. The next frame
            // will create the runtime from the current pullback state instead
            // of applying an old idle patch back over the pointer drag.
            game.invalidateSimulationState?.();
            this.isDragging = true;
            game.slingshot.startPull(this.mousePosition.x, this.mousePosition.y);
            game.penguin.setState(PenguinState.PULLBACK);
            game.updateAimAssistPreview();
            if (this.isMobileDevice()) {
                this.updateMobileInstructions();
            }
        }
    }

    handleMouseMove(event) {
        const game = this.game;
        if (this.lookAroundMode) {
            if (!this.lookAroundPointerActive || !this.lookAroundLastClientPosition) return;
            const clientX = event.clientX;
            const clientY = event.clientY;
            const dx = clientX - this.lookAroundLastClientPosition.x;
            const dy = clientY - this.lookAroundLastClientPosition.y;
            this.lookAroundLastClientPosition = { x: clientX, y: clientY };
            if ((dx || dy) && typeof game.panPortraitCameraByClientDelta === 'function') {
                game.panPortraitCameraByClientDelta(dx, dy);
            }
            return;
        }
        this.mousePosition = this.getMousePosition(event);
        if (game.state === GameState.LEVEL_EDITOR && game.levelEditor.active && game.levelEditor.mode === 'edit') {
            return game.levelEditor.handleMouseMove(event);
        }
        if (this.isDragging && game.slingshot.isPulling) {
            game.slingshot.updatePullback(this.mousePosition.x, this.mousePosition.y);
            // Keep a runtime that may have been created by an animation frame
            // during the drag from replaying a stale pre-pointer snapshot.
            // Pullback is interactive input, so the next frame must capture
            // this exact live position/state before stepping.
            game.invalidateSimulationState?.();
            game.updateAimAssistPreview();
        }
    }

    handleMouseUp(event) {
        const game = this.game;
        this.mouseDown = false;
        if (this.lookAroundMode) {
            this.lookAroundPointerActive = false;
            this.lookAroundLastClientPosition = null;
            return;
        }
        if (game.state === GameState.LEVEL_EDITOR && game.levelEditor.active && game.levelEditor.mode === 'edit') {
            return game.levelEditor.handleMouseUp(event);
        }
        if (this.isDragging) {
            this.isDragging = false;
            game.aimAssistPoints = [];
            const velocity = game.slingshot.release();
            game.launchPenguin(velocity, game.slingshot.lastLaunch);
            if (this.isMobileDevice()) {
                this.updateMobileInstructions();
            }
        } else {
            const canUseSlingshot = game.state === GameState.PLAYING ||
                (game.state === GameState.LEVEL_EDITOR && game.levelEditor.mode === 'play');
            if (canUseSlingshot && game.penguin?.state === PenguinState.SOARING) game.tryAgain();
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
                if (canUsePlayKeys && game.penguin?.state === PenguinState.SOARING) game.tryAgain();
        }
    }
}

export default GameplayController;
