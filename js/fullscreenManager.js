// Fullscreen Manager for Spaced Penguin
// Handles fullscreen toggle with level editor compatibility

import { createViewport, screenToStage } from './viewport.js';

class FullscreenManager {
    constructor(canvas, gameContainer, onViewportChange = null) {
        this.canvas = canvas;
        this.gameContainer = gameContainer;
        this.isFullscreen = false;
        this.originalCanvasSize = { width: canvas.width, height: canvas.height };
        this.fullscreenButton = null;
        this.onViewportChange = onViewportChange;
        
        // Store original styles
        this.originalStyles = {
            gameContainer: {
                position: gameContainer.style.position,
                width: gameContainer.style.width,
                height: gameContainer.style.height,
                maxWidth: gameContainer.style.maxWidth,
                maxHeight: gameContainer.style.maxHeight,
                minWidth: gameContainer.style.minWidth,
                minHeight: gameContainer.style.minHeight,
                border: gameContainer.style.border
            },
            canvas: {
                width: canvas.style.width,
                height: canvas.style.height,
                maxWidth: canvas.style.maxWidth,
                maxHeight: canvas.style.maxHeight
            }
        };
        
        this.createFullscreenButton();
        this.bindEvents();
    }
    
    createFullscreenButton() {
        this.fullscreenButton = document.createElement('button');
        this.fullscreenButton.id = 'fullscreenButton';
        this.fullscreenButton.innerHTML = '⛶';
        this.fullscreenButton.title = 'Toggle Fullscreen (F11)';
        this.fullscreenButton.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 15;
            background: rgba(0, 0, 0, 0.7);
            color: rgb(72, 247, 72);
            border: 1px solid rgb(72, 247, 72);
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 16px;
            font-family: monospace;
            transition: background-color 0.2s;
        `;
        
        // Hide in level editor mode
        this.fullscreenButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.toggle();
        });
        
        this.gameContainer.appendChild(this.fullscreenButton);
    }
    
    bindEvents() {
        // Listen for fullscreen change events
        document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.onFullscreenChange());
        
        // F11 key support
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F11') {
                e.preventDefault();
                this.toggle();
            }
        });
        
        // ESC key to exit fullscreen (only prevent default when in fullscreen)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isFullscreen) {
                e.preventDefault();
                this.exit();
            }
        });
    }
    
    toggle() {
        if (this.isFullscreen) {
            this.exit();
        } else {
            this.enter();
        }
    }
    
    async enter() {
        try {
            // Request fullscreen on the game container
            if (this.gameContainer.requestFullscreen) {
                await this.gameContainer.requestFullscreen();
            } else if (this.gameContainer.webkitRequestFullscreen) {
                await this.gameContainer.webkitRequestFullscreen();
            } else if (this.gameContainer.mozRequestFullScreen) {
                await this.gameContainer.mozRequestFullScreen();
            } else if (this.gameContainer.msRequestFullscreen) {
                await this.gameContainer.msRequestFullscreen();
            } else {
                // Fallback for unsupported browsers
                this.applyFullscreenStyles();
                this.isFullscreen = true;
                this.updateButton();
            }
        } catch (error) {
            console.warn('Fullscreen request failed:', error);
            // Fallback to manual fullscreen styling
            this.applyFullscreenStyles();
            this.isFullscreen = true;
            this.updateButton();
        }
    }
    
    exit() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else {
            // Fallback for manual fullscreen
            this.restoreOriginalStyles();
            this.isFullscreen = false;
            this.updateButton();
        }
    }
    
    onFullscreenChange() {
        const isNowFullscreen = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );
        
        if (isNowFullscreen && !this.isFullscreen) {
            this.applyFullscreenStyles();
            this.isFullscreen = true;
        } else if (!isNowFullscreen && this.isFullscreen) {
            this.restoreOriginalStyles();
            this.isFullscreen = false;
        }
        
        this.updateButton();
    }
    
    applyFullscreenStyles() {
        // Apply fullscreen styles to game container
        this.gameContainer.style.position = 'fixed';
        this.gameContainer.style.top = '0';
        this.gameContainer.style.left = '0';
        this.gameContainer.style.width = '100vw';
        this.gameContainer.style.height = '100vh';
        this.gameContainer.style.maxWidth = 'none';
        this.gameContainer.style.maxHeight = 'none';
        this.gameContainer.style.minWidth = 'none';
        this.gameContainer.style.minHeight = 'none';
        this.gameContainer.style.border = 'none';
        this.gameContainer.style.zIndex = '9999';
        
        // Scale canvas to fit screen while maintaining aspect ratio
        this.scaleCanvasToFitScreen();
    }
    
    restoreOriginalStyles() {
        // Restore original styles
        Object.assign(this.gameContainer.style, this.originalStyles.gameContainer);
        Object.assign(this.canvas.style, this.originalStyles.canvas);
        
        this.notifyViewportChange();
    }
    
    scaleCanvasToFitScreen() {
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.maxWidth = 'none';
        this.canvas.style.maxHeight = 'none';
        this.notifyViewportChange();
    }

    notifyViewportChange() {
        requestAnimationFrame(() => this.onViewportChange?.());
    }
    
    updateButton() {
        if (this.fullscreenButton) {
            this.fullscreenButton.innerHTML = this.isFullscreen ? '⛶' : '⛶';
            this.fullscreenButton.title = this.isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen (F11)';
            this.fullscreenButton.style.backgroundColor = this.isFullscreen ? 
                'rgba(72, 247, 72, 0.2)' : 'rgba(0, 0, 0, 0.7)';
        }
    }
    
    // Hide fullscreen button when level editor is active
    setLevelEditorMode(isActive) {
        if (this.fullscreenButton) {
            this.fullscreenButton.style.display = isActive ? 'none' : 'block';
        }
        
        // Exit fullscreen if level editor is being activated
        if (isActive && this.isFullscreen) {
            this.exit();
        }
    }
    
    // Get scaling factors for input handling
    getCanvasScaling() {
        const viewport = this.canvas.viewport;
        if (!viewport) return { scaleX: 1, scaleY: 1 };
        const stageUnitsPerCssPixel = viewport.pixelRatio / viewport.scale;
        return { scaleX: stageUnitsPerCssPixel, scaleY: stageUnitsPerCssPixel };
    }
    
    // Convert screen coordinates to canvas coordinates
    screenToCanvas(screenX, screenY) {
        const viewport = this.canvas.viewport || createViewport(
            this.canvas.clientWidth,
            this.canvas.clientHeight,
            window.devicePixelRatio || 1
        );
        return screenToStage(this.canvas, viewport, screenX, screenY);
    }
}

export default FullscreenManager;
