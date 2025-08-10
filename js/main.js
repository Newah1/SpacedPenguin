// Main entry point for Spaced Penguin
// Initializes the game and runs the game loop

import { Game } from './game.js';
import { GameState } from './game.js';
import { AssetLoader } from './assetLoader.js';
import { AudioManager } from './audioManager.js';
import { InputActionManager } from './inputActions.js';
import plog from './penguinLogger.js';
import Utils from './utils.js';
import PerformanceUtils from './performanceUtils.js';

plog.info('main.js loaded');

class GameManager {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.game = null;
        this.assetLoader = null;
        this.isRunning = false;
        this.lastTime = 0;
        this.assetsLoaded = false;
        this.isMobile = this.detectMobile();
        this.debugMode = false; // Set to true to enable debug logging
        this.lastStartScreenDraw = 0; // Throttle start screen redraws
        this.performanceUtils = new PerformanceUtils();
        this.inputActionManager = null;
        this.isPageVisible = true;
        this.wasHidden = false;
        
        this.init();
        this.setupPageVisibilityHandling();
    }
    
    detectMobile() {
        // Detect mobile devices
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.innerWidth <= 768 && window.innerHeight <= 1024);
    }
    
    init() {
        // Hide loading screen initially
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
            plog.debug('Loading screen hidden');
        }
        
        // Set up responsive canvas sizing
        this.setupResponsiveCanvas();
        
        // Show loading screen for assets
        this.showLoadingScreen();
        
        // Initialize asset loader
        this.assetLoader = new AssetLoader();
        
        // Load assets first
        this.assetLoader.loadAssets(
            this.onAssetsLoaded.bind(this),
            this.onAssetProgress.bind(this)
        );
    }
    
    setupResponsiveCanvas() {
        const canvas = this.canvas;
        const container = canvas.parentElement;
        
        // Set up responsive sizing
        const resizeCanvas = () => {
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            
            // Target aspect ratio (800x600 = 4:3)
            const targetAspectRatio = 4/3;
            
            let newWidth, newHeight;
            
            if (this.isMobile) {
                // On mobile, use full screen with padding
                const padding = 20;
                newWidth = Math.min(containerWidth - padding, 800);
                newHeight = newWidth / targetAspectRatio;
                
                // If height is too tall, scale down
                if (newHeight > containerHeight - padding) {
                    newHeight = containerHeight - padding;
                    newWidth = newHeight * targetAspectRatio;
                }
            } else {
                // On desktop, maintain original size but scale if needed
                // Set minimum size to prevent infinite shrinking
                const minWidth = 600;
                const minHeight = 450;
                
                // Start with original size
                newWidth = 800;
                newHeight = 600;
                
                // Only scale down if container is smaller than original
                if (containerWidth < 800 + 40) {
                    newWidth = Math.max(containerWidth - 40, minWidth);
                    newHeight = newWidth / targetAspectRatio;
                }
                
                if (containerHeight < 600 + 40) {
                    newHeight = Math.max(containerHeight - 40, minHeight);
                    newWidth = newHeight * targetAspectRatio;
                }
                
                // Ensure we don't go below minimum size
                if (newWidth < minWidth) {
                    newWidth = minWidth;
                    newHeight = minWidth / targetAspectRatio;
                }
                
                if (newHeight < minHeight) {
                    newHeight = minHeight;
                    newWidth = minHeight * targetAspectRatio;
                }
            }
            
            // Debug logging
            if (window.gameManager && window.gameManager.debugMode) {
                plog.debug('Canvas resize:', {
                    container: `${containerWidth}x${containerHeight}`,
                    canvas: `${newWidth}x${newHeight}`,
                    isMobile: this.isMobile,
                    scale: `${(newWidth / 800).toFixed(2)}x${(newHeight / 600).toFixed(2)}`
                });
            }
            
            // Safety check - ensure canvas never gets too small
            const finalWidth = Math.max(newWidth, 800);
            const finalHeight = Math.max(newHeight, 600);
            
            // Set canvas size
            canvas.style.width = finalWidth + 'px';
            canvas.style.height = finalHeight + 'px';
            canvas.width = 800; // Keep internal resolution
            canvas.height = 600;
            
            // Update game scale if game exists
            if (this.game) {
                this.game.setCanvasScale(finalWidth / 800, finalHeight / 600);
            }
        };
        
        // Initial resize
        resizeCanvas();
        
        // Note: Window resize events are now handled by InputActionManager
    }
    
    onAssetProgress(progress, resourceName) {
        // Update loading screen with progress
        const loadingText = document.getElementById('loadingText');
        if (loadingText) {
            loadingText.textContent = `Loading ${resourceName}... ${Math.round(progress)}%`;
        }
    }
    
    async onAssetsLoaded(assetLoader) {
        plog.success('Assets loaded, initializing game...');
        this.assetsLoaded = true;
        
        // Initialize game with loaded assets and audio manager
        const audioManager = assetLoader.getAudioManager();
        this.game = new Game(this.canvas, assetLoader, audioManager);
        
        // Initialize input action manager with root context
        this.inputActionManager = new InputActionManager({
            canvas: this.canvas,
            game: this.game,
            setupResponsiveCanvas: this.setupResponsiveCanvas.bind(this),
            pause: this.pause.bind(this),
            resume: this.resume.bind(this)
        });
        
        // Load levels before starting the game
        plog.info('Loading level definitions...');
        await this.game.levelLoader.loadDefaultLevels();
        plog.success('Level definitions loaded');
        
        // Make game globally accessible for sound effects
        window.game = this.game;
        
        // Load high score
        this.game.loadHighScore();
        
        // Check for level parameter in URL and jump to specific level
        this.checkLevelParameter();
        
        // Set up volume control
        this.setupVolumeControl();
        
        // Hide loading screen
        this.hideLoadingScreen();
        
        // Start game loop
        this.isRunning = true;
        this.gameLoop();
        
        // Show start screen with real graphics (unless jumping to level)
        if (this.game.state === GameState.MENU) {
            this.showStartScreen();
            // Start screen animation now handled by main game loop
        }
    }
    
    showLoadingScreen() {
        // Create loading screen if it doesn't exist
        let loadingScreen = document.getElementById('loadingScreen');
        if (!loadingScreen) {
            loadingScreen = document.createElement('div');
            loadingScreen.id = 'loadingScreen';
            loadingScreen.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                color: #fff;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                font-family: Arial, sans-serif;
                z-index: 1000;
            `;
            
            const title = document.createElement('h1');
            title.textContent = 'SPACED PENGUIN';
            title.style.cssText = 'font-size: 48px; margin-bottom: 20px;';
            
            const loadingText = document.createElement('div');
            loadingText.id = 'loadingText';
            loadingText.textContent = 'Loading assets...';
            loadingText.style.cssText = 'font-size: 16px;';
            
            loadingScreen.appendChild(title);
            loadingScreen.appendChild(loadingText);
            document.body.appendChild(loadingScreen);
        }
        
        loadingScreen.style.display = 'flex';
    }
    
    hideLoadingScreen() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
    }
    
    gameLoop(currentTime = 0) {
        // Continue game loop first to ensure smooth RAF
        requestAnimationFrame((time) => this.gameLoop(time));
        
        if (!this.isRunning || !this.isPageVisible) {
            // Skip updates when tab is hidden but keep RAF running
            return;
        }
        
        // Reset timer after visibility change to prevent large delta jumps
        if (this.wasHidden) {
            this.lastTime = currentTime;
            this.wasHidden = false;
            return; // Skip this frame to avoid timing issues
        }
        
        // Calculate delta time with better precision
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        
        // Cap delta time more intelligently - allow up to 30fps minimum
        const cappedDeltaTime = Math.min(deltaTime, 1/30);
        
        // Skip frame if deltaTime is too small (higher than 120fps)
        if (cappedDeltaTime < 1/120) {
            return;
        }
        
        // Track performance
        this.performanceUtils.recordFrameTime(cappedDeltaTime);
        
        // Update game with performance optimization
        if (this.game && this.assetsLoaded) {
            // Update input actions only when needed
            if (this.inputActionManager && this.game.state !== GameState.MENU) {
                this.inputActionManager.updateActiveActions();
            }
            
            this.game.update(cappedDeltaTime);
            
            // Handle start screen animation within main loop
            if (this.game.state === GameState.MENU) {
                // Throttle start screen redraws to 30fps
                if (!this.lastStartScreenDraw || currentTime - this.lastStartScreenDraw > 33) {
                    this.showStartScreen();
                    this.lastStartScreenDraw = currentTime;
                }
            } else {
                this.game.render();
            }
        }
    }
    
    showStartScreen() {
        if (!this.assetsLoaded || !this.game) return;
        
        plog.info('Showing start screen with real graphics');
        const ctx = this.canvas.getContext('2d');
        
        // Clear canvas
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw stars
        this.game.drawStars();
        
        // The title graphics will be handled by the Game class using real sprites
        // For now, keep the text-based title as fallback
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SPACED PENGUIN', this.canvas.width / 2, 150);
        
        // Draw subtitle
        ctx.font = '24px Arial';
        ctx.fillText('A Gravity Slingshot Adventure', this.canvas.width / 2, 200);
        
        // Draw instructions
        ctx.font = '16px Arial';
        ctx.fillText('Click and drag to pull back the slingshot', this.canvas.width / 2, 300);
        ctx.fillText('Release to launch the penguin', this.canvas.width / 2, 330);
        ctx.fillText('Collect bonuses and land in the target', this.canvas.width / 2, 360);
        ctx.fillText('Avoid crashing into planets', this.canvas.width / 2, 390);
        
        // Draw controls based on device type
        if (this.isMobile) {
            ctx.font = '14px Arial';
            ctx.fillText('Tap START to begin', this.canvas.width / 2, 450);
            ctx.fillText('Tap screen to reset level', this.canvas.width / 2, 480);
        } else {
            ctx.font = '14px Arial';
            ctx.fillText('Press SPACE to start', this.canvas.width / 2, 450);
            ctx.fillText('Press R to reset level', this.canvas.width / 2, 480);
            ctx.fillText('Press Q to quit', this.canvas.width / 2, 510);
        }
        
        // Draw high score
        if (this.game.highScore > 0) {
            ctx.fillText(`High Score: ${Utils.formatScore(this.game.highScore)}`, this.canvas.width / 2, 550);
        }
        
        // Draw penguin animation (now using real sprites)
        this.drawStartPenguin(ctx);
        
        // Add mobile start button if on mobile
        if (this.isMobile) {
            this.createMobileStartButton();
        }
    }
    
    createMobileStartButton() {
        // Remove existing button if any
        const existingButton = document.getElementById('mobileStartButton');
        if (existingButton) {
            existingButton.remove();
        }
        
        // Create mobile start button
        const startButton = document.createElement('button');
        startButton.id = 'mobileStartButton';
        startButton.textContent = 'START GAME';
        startButton.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, 50%);
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 18px;
            font-weight: bold;
            border-radius: 25px;
            cursor: pointer;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            z-index: 100;
            min-width: 150px;
            touch-action: manipulation;
        `;
        
        // Add hover effect for desktop
        if (!this.isMobile) {
            startButton.addEventListener('mouseenter', () => {
                startButton.style.background = 'linear-gradient(45deg, #45a049, #4CAF50)';
            });
            startButton.addEventListener('mouseleave', () => {
                startButton.style.background = 'linear-gradient(45deg, #4CAF50, #45a049)';
            });
        }
        
        // Add click/tap handler
        startButton.addEventListener('click', () => {
            this.startGame();
        });
        
        // Add touch feedback
        startButton.addEventListener('touchstart', () => {
            startButton.style.transform = 'translate(-50%, 50%) scale(0.95)';
        });
        
        startButton.addEventListener('touchend', () => {
            startButton.style.transform = 'translate(-50%, 50%) scale(1)';
        });
        
        document.body.appendChild(startButton);
    }
    
    startGame() {
        // Remove mobile start button
        const startButton = document.getElementById('mobileStartButton');
        if (startButton) {
            startButton.remove();
        }
        
        // Start the game
        if (this.game && this.game.state === GameState.MENU) {
            this.game.startGame();
        }
    }
    
    drawStartPenguin(ctx) {
        // This will be replaced with actual penguin sprite rendering
        // For now, keep the simple animation as fallback
        const time = Date.now() * 0.001;
        const x = this.canvas.width / 2;
        const y = 100;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(time) * 0.1);
        
        // Draw penguin (fallback)
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw features
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-3, -3, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw beak
        ctx.fillStyle = '#FFA500';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(12, -1);
        ctx.lineTo(12, 1);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
    
    setupPageVisibilityHandling() {
        // Handle page visibility changes to prevent performance debt
        const handleVisibilityChange = () => {
            if (document.hidden) {
                this.isPageVisible = false;
                plog.debug('Page hidden - pausing updates');
            } else {
                this.isPageVisible = true;
                this.wasHidden = true; // Flag to reset timers
                plog.debug('Page visible - resuming updates');
            }
        };

        // Add event listeners for visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Also handle window focus/blur as fallback
        window.addEventListener('focus', () => {
            if (!this.isPageVisible) {
                this.isPageVisible = true;
                this.wasHidden = true;
                plog.debug('Window focused - resuming updates');
            }
        });
        
        window.addEventListener('blur', () => {
            this.isPageVisible = false;
            plog.debug('Window blurred - pausing updates');
        });
    }
    
    pause() {
        this.isRunning = false;
    }
    
    resume() {
        this.isRunning = true;
        this.gameLoop();
    }
    
    checkLevelParameter() {
        // Check for level parameter in URL (e.g., ?level=5)
        const levelParam = Utils.getURLParameter('level');
        if (levelParam) {
            const targetLevel = Utils.validateLevel(levelParam, 25);
            if (targetLevel) {
                plog.info(`Jumping to level ${targetLevel} from URL parameter`);
                this.game.jumpToLevel(targetLevel);
                
                // Show level info briefly
                const loadingText = document.getElementById('loadingText');
                if (loadingText) {
                    loadingText.textContent = `Starting Level ${targetLevel}...`;
                    setTimeout(() => {
                        const loadingScreen = document.getElementById('loadingScreen');
                        if (loadingScreen) {
                            loadingScreen.style.display = 'none';
                        }
                    }, 1000);
                }
            } else {
                plog.warn(`Invalid level parameter: ${levelParam}. Must be 1-25.`);
                Utils.removeURLParameter('level');
            }
        }
    }
    
    setupVolumeControl() {
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeValue = document.getElementById('volumeValue');
        const volumeContainer = volumeSlider ? volumeSlider.parentElement : null;
        
        if (volumeSlider && volumeValue && this.game && this.game.assetLoader) {
            const audioManager = this.game.assetLoader.getAudioManager();
            
            if (audioManager) {
                // Set initial volume
                const initialVolume = volumeSlider.value / 100;
                audioManager.setMasterVolume(initialVolume);
                
                // Add event listener for volume changes
                volumeSlider.addEventListener('input', function() {
                    const volume = this.value / 100;
                    volumeValue.textContent = this.value + '%';
                    audioManager.setMasterVolume(volume);
                });
                
                // Hide volume controls on mobile for space
                if (this.isMobile && volumeContainer) {
                    volumeContainer.style.display = 'none';
                }
                
                plog.audio('Volume control initialized');
            }
        }
    }
    
    destroy() {
        this.isRunning = false;
        if (this.inputActionManager) {
            this.inputActionManager.destroy();
        }
        this.game = null;
        this.assetLoader = null;
        this.inputActionManager = null;
    }
}

// Initialize the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    plog.waddle('DOM loaded, starting game manager...');
    const gameManager = new GameManager();
    window.gameManager = gameManager; // Make it globally accessible for debugging
});

// Note: Page visibility and window resize events are now handled by InputActionManager

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameManager;
} 