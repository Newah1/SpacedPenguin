// Input Action System for Spaced Penguin
// Centralized input handling with contextual actions

import { GameState } from './game.js';

export class InputAction {
    constructor(rootContext) {
        this.rootContext = rootContext;
        this.active = false;
        this.listeners = [];
    }
    
    activate() {
        if (this.active) return;
        this.active = true;
        this.setupListeners();
    }
    
    deactivate() {
        if (!this.active) return;
        this.active = false;
        this.removeListeners();
    }
    
    setupListeners() {
        // Override in subclasses
    }
    
    removeListeners() {
        this.listeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        this.listeners = [];
    }
    
    addListener(element, event, handler, options = false) {
        const boundHandler = handler.bind(this);
        element.addEventListener(event, boundHandler, options);
        this.listeners.push({ element, event, handler: boundHandler, options });
    }
    
    getGameState() {
        return this.rootContext.game?.state || 'unknown';
    }
    
    getGame() {
        return this.rootContext.game;
    }
    
    getCanvas() {
        return this.rootContext.canvas;
    }
    
    isLevelEditorActive() {
        return this.rootContext.game?.levelEditor?.active || false;
    }
}

export class GameplayInputAction extends InputAction {
    setupListeners() {
        const canvas = this.getCanvas();
        if (!canvas) return;
        
        this.addListener(canvas, 'mousedown', this.handleMouseDown);
        this.addListener(canvas, 'mousemove', this.handleMouseMove);
        this.addListener(canvas, 'mouseup', this.handleMouseUp);
        this.addListener(canvas, 'touchstart', this.handleTouchStart, { passive: false });
        this.addListener(canvas, 'touchmove', this.handleTouchMove, { passive: false });
        this.addListener(canvas, 'touchend', this.handleTouchEnd, { passive: false });
    }
    
    handleMouseDown(e) {
        const game = this.getGame();
        if (!game || this.getGameState() !== GameState.PLAYING) return;
        
        game.handleMouseDown(e);
    }
    
    handleMouseMove(e) {
        const game = this.getGame();
        if (!game || this.getGameState() !== GameState.PLAYING) return;
        
        game.handleMouseMove(e);
    }
    
    handleMouseUp(e) {
        const game = this.getGame();
        if (!game || this.getGameState() !== GameState.PLAYING) return;
        
        game.handleMouseUp(e);
    }
    
    handleTouchStart(e) {
        const game = this.getGame();
        if (!game || this.getGameState() !== GameState.PLAYING) return;
        
        game.handleTouchStart(e);
    }
    
    handleTouchMove(e) {
        const game = this.getGame();
        if (!game || this.getGameState() !== GameState.PLAYING) return;
        
        game.handleTouchMove(e);
    }
    
    handleTouchEnd(e) {
        const game = this.getGame();
        if (!game || this.getGameState() !== GameState.PLAYING) return;
        
        game.handleTouchEnd(e);
    }
}

export class MenuInputAction extends InputAction {
    setupListeners() {
        const canvas = this.getCanvas();
        if (!canvas) return;
        
        this.addListener(canvas, 'click', this.handleClick);
        this.addListener(canvas, 'touchstart', this.handleTouchStart, { passive: false });
        this.addListener(canvas, 'touchend', this.handleTouchEnd, { passive: false });
    }
    
    handleClick(e) {
        const game = this.getGame();
        if (!game || this.getGameState() !== GameState.MENU) return;

        if (game.state === GameState.MENU) {
            game.startGame();
            return;
        }
        
        // Handle menu navigation
        game.uiManager?.handleClick(e);
    }
    
    handleTouchStart(e) {
        this.touchStartTime = Date.now();
        this.touchStartPos = this.getEventCoordinates(e);
    }
    
    handleTouchEnd(e) {
        const game = this.getGame();
        if (!game || this.getGameState() !== GameState.MENU) return;
        
        // Convert touch to click for menu interaction
        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - this.touchStartTime;
        
        if (touchDuration < 300) { // Quick tap
            const syntheticClick = new MouseEvent('click', {
                clientX: e.changedTouches[0].clientX,
                clientY: e.changedTouches[0].clientY,
                bubbles: true
            });
            e.target.dispatchEvent(syntheticClick);
        }
    }
    
    getEventCoordinates(event) {
        const canvas = this.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const touch = event.touches[0] || event.changedTouches[0];
        
        return {
            x: (touch.clientX - rect.left) * (canvas.width / rect.width),
            y: (touch.clientY - rect.top) * (canvas.height / rect.height)
        };
    }
}

export class KeyboardInputAction extends InputAction {
    setupListeners() {
        this.addListener(document, 'keydown', this.handleKeyDown);
    }
    
    handleKeyDown(e) {
        const game = this.getGame();
        if (!game) return;
        
        const gameState = this.getGameState();
        
        // Don't interfere with browser shortcuts (Ctrl+R, Ctrl+Shift+R, etc.)
        if (e.ctrlKey || e.metaKey) {
            return;
        }
        
        // Don't intercept keys when console is open - let console handle input
        if (game.console && game.console.visible) {
            return;
        }
        
        // Global keyboard shortcuts
        switch (e.code) {
            case 'Escape':
                if (this.isLevelEditorActive()) {
                    game.levelEditor.toggle();
                } else if (gameState === GameState.PLAYING) {
                    game.setState(GameState.PAUSED);
                }
                break;
                
            case 'F1':
                e.preventDefault();
                if (game.levelEditor) {
                    game.levelEditor.toggle();
                }
                break;
        }
        
        // State-specific keyboard handling
        switch (gameState) {
            case GameState.MENU:
                this.handleMenuKeys(e);
                break;
            case GameState.PLAYING:
                this.handleGameplayKeys(e);
                break;
            case GameState.PAUSED:
                this.handlePausedKeys(e);
                break;
        }
        
        // Fallback to game's handleKeyDown for unhandled keys (like backtick for console)
        // Only call if the event wasn't prevented by previous handlers
        if (!e.defaultPrevented && game.handleKeyDown) {
            game.handleKeyDown(e);
        }
    }
    
    handleMenuKeys(e) {
        const game = this.getGame();
        
        switch (e.code) {
            case 'Space':
            case 'Enter':
                e.preventDefault();
                game.startGame();
                break;
        }
    }
    
    handleGameplayKeys(e) {
        const game = this.getGame();
        
        switch (e.code) {
            case 'KeyR':
                e.preventDefault();
                game.resetLevel();
                break;
            case 'KeyQ':
                e.preventDefault();
                game.showQuitConfirmation();
                break;
            case 'Space':
                if (game.penguin.state === 'crashed' || game.penguin.state === 'hitTarget') {
                    e.preventDefault();
                    game.resetLevel();
                }
                break;
        }
    }
    
    handlePausedKeys(e) {
        const game = this.getGame();
        
        switch (e.code) {
            case 'Space':
            case 'Enter':
                e.preventDefault();
                game.setState(GameState.PLAYING);
                break;
        }
    }
}

export class LevelEditorInputAction extends InputAction {
    setupListeners() {
        const canvas = this.getCanvas();
        if (!canvas) return;
        
        this.addListener(canvas, 'mousedown', this.handleMouseDown);
        this.addListener(canvas, 'mousemove', this.handleMouseMove);
        this.addListener(canvas, 'mouseup', this.handleMouseUp);
        this.addListener(canvas, 'click', this.handleClick);
        this.addListener(document, 'keydown', this.handleKeyDown);
    }
    
    handleMouseDown(e) {
        const game = this.getGame();
        if (!game || !this.isLevelEditorActive()) return;
        
        game.levelEditor.handleMouseDown(e);
    }
    
    handleMouseMove(e) {
        const game = this.getGame();
        if (!game || !this.isLevelEditorActive()) return;
        
        game.levelEditor.handleMouseMove(e);
    }
    
    handleMouseUp(e) {
        const game = this.getGame();
        if (!game || !this.isLevelEditorActive()) return;
        
        game.levelEditor.handleMouseUp(e);
    }
    
    handleClick(e) {
        const game = this.getGame();
        if (!game || !this.isLevelEditorActive()) return;
        
        game.levelEditor.handleClick(e);
    }
    
    handleKeyDown(e) {
        const game = this.getGame();
        if (!game || !this.isLevelEditorActive()) return;
        
        switch (e.code) {
            case 'Delete':
                e.preventDefault();
                game.levelEditor.deleteSelectedObject();
                break;
            case 'KeyS':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    game.levelEditor.saveLevel();
                }
                break;
            case 'KeyZ':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        game.levelEditor.redo();
                    } else {
                        game.levelEditor.undo();
                    }
                }
                break;
        }
    }
}

export class UIInputAction extends InputAction {
    setupListeners() {
        const canvas = this.getCanvas();
        if (!canvas) return;
        
        this.addListener(canvas, 'click', this.handleClick);
        this.addListener(canvas, 'touchstart', this.handleTouchStart, { passive: false });
        this.addListener(canvas, 'touchend', this.handleTouchEnd, { passive: false });
        this.addListener(window, 'keydown', this.handleKeyPress);
    }
    
    handleClick(e) {
        const game = this.getGame();
        if (!game?.uiManager) return;
        
        game.uiManager.handleClick(e);
    }
    
    handleTouchStart(e) {
        const game = this.getGame();
        if (!game?.uiManager) return;
        
        game.uiManager.handleTouchStart(e);
    }
    
    handleTouchEnd(e) {
        const game = this.getGame();
        if (!game?.uiManager) return;
        
        game.uiManager.handleTouchEnd(e);
    }
    
    handleKeyPress(e) {
        const game = this.getGame();
        if (!game?.uiManager) return;
        
        game.uiManager.handleKeyPress(e);
    }
}

export class WindowInputAction extends InputAction {
    setupListeners() {
        this.addListener(window, 'resize', this.handleResize);
        this.addListener(window, 'orientationchange', this.handleOrientationChange);
        this.addListener(document, 'visibilitychange', this.handleVisibilityChange);
    }
    
    handleResize() {
        if (this.rootContext.setupResponsiveCanvas) {
            this.rootContext.setupResponsiveCanvas();
        }
    }
    
    handleOrientationChange() {
        setTimeout(() => {
            this.handleResize();
        }, 100);
    }
    
    handleVisibilityChange() {
        if (document.hidden) {
            this.rootContext.pause?.();
        } else {
            this.rootContext.resume?.();
        }
    }
}

export class InputActionManager {
    constructor(rootContext) {
        this.rootContext = rootContext;
        this.actions = new Map();
        this.activeActions = new Set();
        
        this.initializeActions();
    }
    
    initializeActions() {
        this.actions.set('gameplay', new GameplayInputAction(this.rootContext));
        this.actions.set('menu', new MenuInputAction(this.rootContext));
        this.actions.set('keyboard', new KeyboardInputAction(this.rootContext));
        this.actions.set('levelEditor', new LevelEditorInputAction(this.rootContext));
        this.actions.set('ui', new UIInputAction(this.rootContext));
        this.actions.set('window', new WindowInputAction(this.rootContext));
    }
    
    activateAction(actionName) {
        const action = this.actions.get(actionName);
        if (action && !this.activeActions.has(actionName)) {
            action.activate();
            this.activeActions.add(actionName);
        }
    }
    
    deactivateAction(actionName) {
        const action = this.actions.get(actionName);
        if (action && this.activeActions.has(actionName)) {
            action.deactivate();
            this.activeActions.delete(actionName);
        }
    }
    
    updateActiveActions() {
        const game = this.rootContext.game;
        if (!game) return;
        
        const gameState = game.state;
        const isLevelEditorActive = game.levelEditor?.active;
        
        // Always active actions
        this.activateAction('keyboard');
        this.activateAction('window');
        this.activateAction('ui');
        
        // State-specific actions
        if (isLevelEditorActive) {
            this.activateAction('levelEditor');
            this.deactivateAction('gameplay');
            this.deactivateAction('menu');
        } else {
            this.deactivateAction('levelEditor');
            
            switch (gameState) {
                case GameState.MENU:
                    this.activateAction('menu');
                    this.deactivateAction('gameplay');
                    break;
                case GameState.PLAYING:
                case GameState.PAUSED:
                    this.activateAction('gameplay');
                    this.deactivateAction('menu');
                    break;
                default:
                    this.deactivateAction('gameplay');
                    this.deactivateAction('menu');
                    break;
            }
        }
    }
    
    destroy() {
        this.actions.forEach(action => action.deactivate());
        this.actions.clear();
        this.activeActions.clear();
    }
}