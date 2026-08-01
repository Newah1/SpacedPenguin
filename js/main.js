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
import { STAGE_WIDTH, createViewport } from './viewport.js';

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
        this.isPageVisible = !document.hidden;
        this.animationFrameId = null;
        this.handlePageVisibilityChange = null;
        this.viewport = null;
        this.lastInputContextKey = null;
        
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
        const cssWidth = container.clientWidth || window.innerWidth || 800;
        const cssHeight = container.clientHeight || window.innerHeight || 600;
        this.viewport = createViewport(cssWidth, cssHeight, window.devicePixelRatio || 1);

        canvas.style.width = `${this.viewport.cssWidth}px`;
        canvas.style.height = `${this.viewport.cssHeight}px`;
        canvas.width = this.viewport.backingWidth;
        canvas.height = this.viewport.backingHeight;
        canvas.viewport = this.viewport;

        if (this.debugMode) {
            plog.debug('Canvas viewport:', this.viewport);
        }

        this.game?.setViewport(this.viewport);
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
        
        // Initialize input actions for the current game state
        this.inputActionManager.updateActiveActions();

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
        
        // Start exactly one animation-frame chain.
        this.resume();
        
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
        // The scheduled callback has fired; a new one may now be queued.
        this.animationFrameId = null;

        if (!this.isRunning || !this.isPageVisible) {
            return;
        }

        this.scheduleNextFrame();
        
        // Calculate delta time with better precision
        const deltaTime = this.lastTime === 0 ? 0 : (currentTime - this.lastTime) / 1000;
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
            // Update input actions when needed
            if (this.inputActionManager) {
                const inputContextKey = [
                    this.game.state,
                    this.game.levelEditor?.active ? 'active' : 'inactive',
                    this.game.levelEditor?.mode || 'none'
                ].join(':');
                if (inputContextKey !== this.lastInputContextKey) {
                    this.lastInputContextKey = inputContextKey;
                    this.inputActionManager.updateActiveActions();
                }
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

    scheduleNextFrame() {
        if (!this.isRunning || !this.isPageVisible || this.animationFrameId !== null) {
            return;
        }

        this.animationFrameId = requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    showStartScreen() {
        if (!this.assetsLoaded || !this.game) return;
        
        document.body.classList.add('is-menu');
        const ctx = this.canvas.getContext('2d');
        this.game.beginFrame();
        const width = 800;
        const height = 600;
        const time = this.game.starfieldTime || 0;

        // Deep cobalt space, sampled from the original show's packaging and
        // warmed with the orange used by the penguins' flight suits.
        const space = ctx.createRadialGradient(width * 0.52, height * 0.36, 30, width * 0.5, height * 0.45, 520);
        space.addColorStop(0, '#153f8a');
        space.addColorStop(0.42, '#0a2257');
        space.addColorStop(0.78, '#040d28');
        space.addColorStop(1, '#01040d');
        ctx.fillStyle = space;
        ctx.fillRect(0, 0, width, height);
        
        this.game.drawStars();

        // Keep the full rotated ring inside the 800px stage while allowing the
        // planet itself to dip below the bottom edge.
        this.drawMenuPlanet(ctx, 670, 533, 88);
        this.drawMenuTitle(ctx);
        this.drawMenuConsole(ctx, time);
        
        // Add mobile start button if on mobile
        if (this.isMobile) {
            this.createMobileStartButton();
        }
    }
    
    createMobileStartButton() {
        // The menu redraws at 30fps; keep one stable DOM control over the canvas.
        const existingButton = document.getElementById('mobileStartButton');
        if (existingButton) {
            return;
        }
        
        // Create mobile start button
        const startButton = document.createElement('button');
        startButton.id = 'mobileStartButton';
        startButton.textContent = 'TAP TO LAUNCH';
        startButton.style.cssText = `
            position: absolute;
            top: 68.5%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(#ffd85a, #f28a19 54%, #ca4b0b);
            color: #07183c;
            border: 3px solid #ffe991;
            padding: 11px 28px;
            font-family: "Trebuchet MS", Arial, sans-serif;
            font-size: 16px;
            font-weight: 900;
            letter-spacing: 1.5px;
            border-radius: 10px;
            cursor: pointer;
            box-shadow: 0 4px 0 #762606, 0 0 18px rgba(255, 166, 31, .45);
            z-index: 100;
            min-width: 220px;
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
            startButton.style.transform = 'translate(-50%, -50%) scale(0.96)';
        });
        
        startButton.addEventListener('touchend', () => {
            startButton.style.transform = 'translate(-50%, -50%) scale(1)';
        });
        
        this.canvas.parentElement.appendChild(startButton);
    }
    
    startGame() {
        // Remove mobile start button
        const startButton = document.getElementById('mobileStartButton');
        if (startButton) {
            startButton.remove();
        }
        document.body.classList.remove('is-menu');
        
        // Start the game
        if (this.game && this.game.state === GameState.MENU) {
            this.game.startGame();
        }
    }
    
    drawStartPenguin(ctx) {
        // This will be replaced with actual penguin sprite rendering
        // For now, keep the simple animation as fallback
        const time = Date.now() * 0.001;
        const x = STAGE_WIDTH / 2;
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
        // GameManager is the single owner of visibility-driven loop control.
        this.handlePageVisibilityChange = () => {
            if (document.hidden) {
                this.isPageVisible = false;
                this.pause();
                plog.debug('Page hidden - pausing updates');
            } else {
                this.isPageVisible = true;
                this.resume();
                plog.debug('Page visible - resuming updates');
            }
        };

        document.addEventListener('visibilitychange', this.handlePageVisibilityChange);
    }
    
    pause() {
        this.isRunning = false;

        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
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

    drawMenuTitle(ctx) {
        const title = this.assetLoader.createTitle();
        const spaced = title.spacedText;
        const penguin = title.penguinText;

        ctx.save();
        ctx.shadowColor = 'rgba(255, 133, 12, 0.68)';
        ctx.shadowBlur = 18;
        if (spaced && penguin) {
            const spacedWidth = 276;
            const spacedHeight = spacedWidth * (spaced.height / spaced.width);
            const penguinWidth = 340;
            const penguinHeight = penguinWidth * (penguin.height / penguin.width);
            const spacedY = 34;
            const penguinY = spacedY + spacedHeight + 9;
            ctx.drawImage(spaced, 400 - spacedWidth / 2, spacedY, spacedWidth, spacedHeight);
            ctx.drawImage(penguin, 400 - penguinWidth / 2, penguinY, penguinWidth, penguinHeight);
        } else {
            ctx.fillStyle = '#ff9c23';
            ctx.font = 'italic 900 54px Georgia, serif';
            ctx.textAlign = 'center';
            ctx.fillText('SPACED PENGUIN!', 400, 125);
        }
        ctx.restore();

        ctx.fillStyle = '#91eaff';
        ctx.font = '700 12px "Trebuchet MS", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '2px';
        ctx.fillText('A GRAVITY SLINGSHOT ADVENTURE', 400, 182);
    }

    drawMenuConsole(ctx, time) {
        const x = 125;
        const y = 205;
        const width = 550;
        const height = 282;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 10;
        this.roundedRectPath(ctx, x, y, width, height, 22);
        const frame = ctx.createLinearGradient(x, y, x, y + height);
        frame.addColorStop(0, '#ffba35');
        frame.addColorStop(0.15, '#de6c16');
        frame.addColorStop(1, '#833009');
        ctx.fillStyle = frame;
        ctx.fill();
        ctx.restore();

        this.roundedRectPath(ctx, x + 9, y + 9, width - 18, height - 18, 15);
        const panel = ctx.createLinearGradient(0, y, 0, y + height);
        panel.addColorStop(0, '#163e7c');
        panel.addColorStop(0.48, '#0b2757');
        panel.addColorStop(1, '#071838');
        ctx.fillStyle = panel;
        ctx.fill();
        ctx.strokeStyle = '#58bfea';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Header rail and blinking console lamps.
        ctx.fillStyle = '#05132e';
        ctx.fillRect(x + 26, y + 27, width - 52, 34);
        ctx.strokeStyle = '#2f7ab2';
        ctx.strokeRect(x + 26.5, y + 27.5, width - 53, 33);
        ctx.fillStyle = '#c7f5ff';
        ctx.font = '900 15px "Trebuchet MS", Arial, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('CADET LAUNCH CONSOLE', x + 47, y + 49);
        ['#55f1ff', '#ffd14d', Math.sin(time * 4) > 0 ? '#ff7b2c' : '#6d2c20'].forEach((color, index) => {
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(x + width - 105 + index * 25, y + 44, 5, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.shadowBlur = 0;

        const steps = [
            ['3', 'PULL', 'Drag Kevin back in the slingshot'],
            ['2', 'LAUNCH', 'Release and ride the gravity curve'],
            ['1', 'LAND', 'Collect bonuses, then reach the ship']
        ];
        steps.forEach((step, index) => {
            const rowY = y + 87 + index * 43;
            ctx.fillStyle = index === 1 ? 'rgba(37, 100, 166, .38)' : 'rgba(2, 13, 37, .28)';
            this.roundedRectPath(ctx, x + 30, rowY - 19, width - 60, 35, 8);
            ctx.fill();
            ctx.fillStyle = '#ff9e20';
            ctx.font = '900 22px "Arial Black", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(step[0], x + 55, rowY + 7);
            ctx.fillStyle = '#ffffff';
            ctx.font = '900 14px "Trebuchet MS", Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(step[1], x + 84, rowY + 4);
            ctx.fillStyle = '#9ed8ef';
            ctx.font = '13px "Trebuchet MS", Arial, sans-serif';
            ctx.fillText(step[2], x + 158, rowY + 4);
        });

        const buttonX = x + 143;
        const buttonY = y + 220;
        const buttonWidth = 264;
        const buttonHeight = 47;
        this.roundedRectPath(ctx, buttonX, buttonY + 4, buttonWidth, buttonHeight, 10);
        ctx.fillStyle = '#722608';
        ctx.fill();
        this.roundedRectPath(ctx, buttonX, buttonY, buttonWidth, buttonHeight, 10);
        const launch = ctx.createLinearGradient(0, buttonY, 0, buttonY + buttonHeight);
        launch.addColorStop(0, '#ffe36b');
        launch.addColorStop(0.52, '#f49a1e');
        launch.addColorStop(1, '#cf540d');
        ctx.fillStyle = launch;
        ctx.fill();
        ctx.strokeStyle = '#fff0a3';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#07183c';
        ctx.font = '900 17px "Trebuchet MS", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.isMobile ? 'TAP TO LAUNCH' : 'PRESS SPACE TO LAUNCH', 400, buttonY + 30);

        ctx.restore();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#78bddd';
        ctx.font = '12px "Trebuchet MS", Arial, sans-serif';
        const controls = this.isMobile ? 'TAP ANYWHERE TO BEGIN' : 'ENTER ALSO STARTS  •  R RESETS  •  Q RETURNS TO BASE';
        ctx.fillText(controls, 400, 520);
        if (this.game.highScore > 0) {
            ctx.fillStyle = '#ffd35a';
            ctx.font = '700 13px "Trebuchet MS", Arial, sans-serif';
            ctx.fillText(`MISSION RECORD  ${Utils.formatScore(this.game.highScore)}`, 400, 546);
        }
    }

    drawMenuPlanet(ctx, x, y, radius) {
        ctx.save();
        const ringY = y + 4;
        const ringRadiusX = radius * 1.42;
        const ringRadiusY = radius * 0.28;
        const ringRotation = -0.18;

        // Rear half: draw the complete ellipse first, then let the planet hide
        // the section that should pass behind the sphere.
        ctx.strokeStyle = 'rgba(76, 164, 211, .38)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(x, ringY, ringRadiusX, ringRadiusY, ringRotation, 0, Math.PI * 2);
        ctx.stroke();

        const glow = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.35, 4, x, y, radius);
        glow.addColorStop(0, '#60d8ed');
        glow.addColorStop(0.36, '#2572a5');
        glow.addColorStop(0.74, '#143d77');
        glow.addColorStop(1, '#071636');
        ctx.fillStyle = glow;
        ctx.shadowColor = 'rgba(54, 172, 231, .6)';
        ctx.shadowBlur = 28;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Front half: the lower arc crosses over the planet, completing the
        // illusion of one continuous ring wrapping around it.
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(137, 229, 255, .72)';
        ctx.shadowColor = 'rgba(80, 199, 242, .55)';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(x, ringY, ringRadiusX, ringRadiusY, ringRotation, 0, Math.PI);
        ctx.stroke();
        ctx.restore();
    }
    
    resume() {
        if (!this.assetsLoaded || !this.isPageVisible) return;
        if (this.isRunning && this.animationFrameId !== null) return;

        this.isRunning = true;
        this.lastTime = 0;
        this.scheduleNextFrame();
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
        this.pause();
        if (this.handlePageVisibilityChange) {
            document.removeEventListener('visibilitychange', this.handlePageVisibilityChange);
            this.handlePageVisibilityChange = null;
        }
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

// Page visibility is owned here; window resize/orientation is handled by InputActionManager.

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameManager;
}

export { GameManager };
