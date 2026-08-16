// Main entry point for Spaced Penguin
// Initializes the game and runs the game loop

import { Game } from './game.js';
import { GameState } from './game.js';
import { AssetLoader } from './assetLoader.js';
import { AudioManager } from './audioManager.js';
import { InputActionManager } from './inputActions.js';
import { Penguin } from './penguin.js';
import plog from './penguinLogger.js';
import Utils from './utils.js';
import PerformanceUtils from './performanceUtils.js';
import { STAGE_HEIGHT, STAGE_WIDTH, createViewport, screenToStage } from './viewport.js';
import { LEVEL_CATALOG_CONFIG, SIMULATION_CONFIG, parseLevelSelector } from './config/gameConfig.js';
import { isMobileViewport } from './config/inputConfig.js';
import { RUNTIME_CONFIG } from './config/runtimeConfig.js';
import { CanvasButton, createButton } from './buttonFramework.js';

plog.info('main.js loaded');

class GameManager {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.game = null;
        this.assetLoader = null;
        this.isRunning = false;
        this.lastTime = 0;
        this.simulationAccumulator = 0;
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
        this.menuKevin = null;
        this.menuSlingshot = this.createMenuSlingshotState();
        this.menuButtons = this.createMenuButtons();
        
        this.init();
        this.setupPageVisibilityHandling();
    }
    
    detectMobile() {
        return isMobileViewport();
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
        const cssWidth = container.clientWidth || window.innerWidth || STAGE_WIDTH;
        const cssHeight = container.clientHeight || window.innerHeight || STAGE_HEIGHT;
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
        this.menuKevin = new Penguin(assetLoader);
        
        // Initialize input action manager with root context
        this.inputActionManager = new InputActionManager({
            canvas: this.canvas,
            game: this.game,
            setupResponsiveCanvas: this.setupResponsiveCanvas.bind(this),
            pause: this.pause.bind(this),
            resume: this.resume.bind(this),
            handleMenuPointerDown: this.handleMenuPointerDown.bind(this),
            handleMenuPointerMove: this.handleMenuPointerMove.bind(this),
            handleMenuPointerUp: this.handleMenuPointerUp.bind(this),
            handleMenuButtonClick: this.handleMenuButtonClick.bind(this),
            consumeMenuInteraction: this.consumeMenuInteraction.bind(this),
            shouldStartGameFromMenu: this.shouldStartGameFromMenu.bind(this)
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
        await this.checkLevelParameter();

        // Open the loaded level directly in the editor when requested.
        this.checkLevelEditorParameter();
        
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
        
        const deltaTime = this.lastTime === 0
            ? 0
            : Math.max(0, (currentTime - this.lastTime) / 1000);
        this.lastTime = currentTime;

        // Rendering follows the display, but gameplay advances on the exact
        // legacy 60 Hz tick used by the headless trajectory tester. Carrying
        // fractional display time prevents high-refresh monitors from changing
        // gravity integration and collision outcomes.
        const frameDelta = Math.min(deltaTime, RUNTIME_CONFIG.frameTiming.maxDeltaSeconds);
        const simulationStep = 1 / SIMULATION_CONFIG.legacyPhysicsFps;
        const simulationSpeed = this.game?.getSimulationSpeedMultiplier?.() ?? 1;
        this.simulationAccumulator = (this.simulationAccumulator || 0) + frameDelta * simulationSpeed;
        
        // Track performance
        if (frameDelta > 0) this.performanceUtils.recordFrameTime(frameDelta);
        
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
            
            while (this.simulationAccumulator + Number.EPSILON >= simulationStep) {
                this.game.update(simulationStep);
                this.simulationAccumulator -= simulationStep;
            }
            if (this.simulationAccumulator < Number.EPSILON) {
                this.simulationAccumulator = 0;
            }
            
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
        const width = STAGE_WIDTH;
        const height = STAGE_HEIGHT;
        const time = performance.now() * 0.001;
        this.updateMenuSlingshot(time);

        // Match the original game's spare title-card presentation.
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        this.drawMenuTitle(ctx);
        this.drawMenuConsole(ctx, time);
        
        // Add mobile start button if on mobile
        if (this.isMobile) {
            this.createMobileStartButton();
        }
    }

    createMenuSlingshotState() {
        return {
            anchor: { x: 163, y: 439 },
            restingPosition: { x: 124, y: 440 },
            position: { x: 124, y: 440 },
            velocity: { x: 0, y: 0 },
            dragging: false,
            launched: false,
            age: 0,
            lastFrameTime: null,
            suppressClick: false
        };
    }

    createMenuButtons() {
        const originalButton = (x, y, width, height, label, action, fontSize) =>
            new CanvasButton(x, y, width, height, label, action, {
                hitTest: (pointX, pointY) => pointX >= x && pointX <= x + width &&
                    pointY >= y && pointY <= y + height,
                renderButton: (ctx, button) => this.drawOriginalMenuButton(
                    ctx, x, y, width, height, button.text, fontSize, button
                )
            });

        return {
            highScores: originalButton(40, 517, 166, 54, 'High Scores',
                () => this.showMenuHighScores(), 20),
            levelEditor: originalButton(220, 517, 166, 54, 'Level Editor',
                () => this.game?.openLevelEditor(), 17),
            loadLevel: originalButton(397, 517, 156, 54, 'Load Level',
                () => this.game?.showLevelBrowser(), 17),
            tips: originalButton(683, 351, 80, 50, 'Tips!',
                () => this.showMenuTips(), 19),
            start: new CanvasButton(563, 464, 184, 96, 'Start',
                () => this.startGame(), {
                    hitTest: (pointX, pointY) => {
                        const normalizedX = (pointX - 655) / 92;
                        const normalizedY = (pointY - 512) / 48;
                        return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
                    },
                    renderButton: (ctx, button) => this.drawStartButtonVisual(ctx, button)
                })
        };
    }

    showMenuHighScores() {
        this.game?.showHighScores();
    }

    showMenuTips() {
        this.game?.uiManager.showModal({
            title: 'TIPS',
            message: 'Pull Kevin back from the ship, then release to launch.\nUse nearby planets to bend the flight path toward the target.',
            actions: [{ label: 'BACK', role: 'cancel' }]
        });
    }

    updateMenuButtonHover(point) {
        const hovered = Object.values(this.menuButtons).some(button =>
            button.handlePointerMove(point.x, point.y)
        );
        this.canvas.style.cursor = hovered ? 'pointer' : 'default';
        return hovered;
    }

    handleMenuButtonClick(event) {
        if (this.game?.uiManager.activeScreens?.length) return false;
        const point = this.getMenuStagePoint(event);
        return Object.values(this.menuButtons).some(button =>
            button.handleClick(point.x, point.y, event)
        );
    }

    resetMenuSlingshot() {
        const previousTime = this.menuSlingshot?.lastFrameTime ?? null;
        this.menuSlingshot = this.createMenuSlingshotState();
        this.menuSlingshot.lastFrameTime = previousTime;
        if (this.menuKevin) this.menuKevin.trail = [];
    }

    getMenuStagePoint(event) {
        return screenToStage(
            this.canvas,
            this.canvas.viewport,
            event.clientX,
            event.clientY
        );
    }

    handleMenuPointerDown(event) {
        if (this.game?.uiManager.activeScreens?.length) return false;
        const point = this.getMenuStagePoint(event);
        for (const button of Object.values(this.menuButtons)) {
            if (button.handlePointerDown(point.x, point.y)) {
                // A completed Kevin swing suppresses its synthetic click. A
                // later button press is a new interaction and must not inherit
                // that suppression flag.
                this.menuSlingshot.suppressClick = false;
                this.canvas.style.cursor = 'pointer';
                return true;
            }
        }
        const state = this.menuSlingshot;
        const distance = Math.hypot(point.x - state.position.x, point.y - state.position.y);
        if (distance > 32) return false;

        state.dragging = true;
        state.launched = false;
        state.velocity = { x: 0, y: 0 };
        state.suppressClick = true;
        this.updateMenuDragPosition(point);
        return true;
    }

    handleMenuPointerMove(event) {
        if (this.game?.uiManager.activeScreens?.length) return false;
        const point = this.getMenuStagePoint(event);
        if (!this.menuSlingshot.dragging) return this.updateMenuButtonHover(point);
        this.updateMenuDragPosition(point);
        this.canvas.style.cursor = 'grabbing';
        return true;
    }

    handleMenuPointerUp(event) {
        if (this.game?.uiManager.activeScreens?.length) return false;
        const point = this.getMenuStagePoint(event);
        const overButton = Object.values(this.menuButtons).some(button => button.isPressed);
        if (overButton) {
            Object.values(this.menuButtons).forEach(button => button.handlePointerUp());
            this.updateMenuButtonHover(point);
            return true;
        }
        const state = this.menuSlingshot;
        if (!state.dragging) return false;

        this.updateMenuDragPosition(this.getMenuStagePoint(event));
        state.dragging = false;
        const pullX = state.anchor.x - state.position.x;
        const pullY = state.anchor.y - state.position.y;
        if (Math.hypot(pullX, pullY) < 4) {
            this.resetMenuSlingshot();
            this.menuSlingshot.suppressClick = true;
        } else {
            state.velocity = { x: pullX * 5.5, y: pullY * 5.5 };
            state.launched = true;
            state.age = 0;
            state.suppressClick = true;
        }
        return true;
    }

    updateMenuDragPosition(point) {
        const state = this.menuSlingshot;
        const dx = point.x - state.anchor.x;
        const dy = point.y - state.anchor.y;
        const distance = Math.hypot(dx, dy);
        const scale = distance > 72 ? 72 / distance : 1;
        state.position.x = state.anchor.x + dx * scale;
        state.position.y = state.anchor.y + dy * scale;
    }

    consumeMenuInteraction() {
        if (!this.menuSlingshot.suppressClick) return false;
        this.menuSlingshot.suppressClick = false;
        return true;
    }

    shouldStartGameFromMenu(event) {
        const point = this.getMenuStagePoint(event);
        const normalizedX = (point.x - 655) / 92;
        const normalizedY = (point.y - 512) / 48;
        return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
    }

    getMenuStartPlanets(time) {
        const orbit = time * 2.2;
        return [0, Math.PI].map(offset => ({
            x: 655 + Math.cos(orbit + offset) * 74,
            y: 512 + Math.sin(orbit + offset) * 58,
            radius: 18
        }));
    }

    updateMenuSlingshot(time) {
        const state = this.menuSlingshot;
        const previous = state.lastFrameTime ?? time;
        const deltaTime = Math.min(0.05, Math.max(0, time - previous));
        state.lastFrameTime = time;
        if (!state.launched || state.dragging) return;

        for (const planet of this.getMenuStartPlanets(time)) {
            const dx = planet.x - state.position.x;
            const dy = planet.y - state.position.y;
            const distanceSquared = Math.max(625, dx * dx + dy * dy);
            const distance = Math.sqrt(distanceSquared);
            const acceleration = Math.min(350, 900000 / distanceSquared);
            state.velocity.x += (dx / distance) * acceleration * deltaTime;
            state.velocity.y += (dy / distance) * acceleration * deltaTime;
        }
        state.position.x += state.velocity.x * deltaTime;
        state.position.y += state.velocity.y * deltaTime;
        state.age += deltaTime;

        if (this.menuKevin) {
            this.menuKevin.trail.push({ ...state.position });
            if (this.menuKevin.trail.length > this.menuKevin.maxTrailLength) {
                this.menuKevin.trail.shift();
            }
        }

        if (state.age > 12 || state.position.x < -100 || state.position.x > 900 ||
            state.position.y < -100 || state.position.y > 700) {
            this.resetMenuSlingshot();
        }
    }
    
    createMobileStartButton() {
        // The menu redraws at 30fps; keep one stable DOM control over the canvas.
        const existingButton = document.getElementById('mobileStartButton');
        if (existingButton) {
            return;
        }
        
        // Create mobile start button
        const startButton = createButton('TAP TO LAUNCH', () => this.startGame(), {
            backgroundColor: '#fff3bb',
            hoverColor: '#fff9d7',
            activeColor: '#f5df91',
            textColor: '#f47b20',
            borderColor: '#f79433'
        });
        startButton.id = 'mobileStartButton';
        startButton.style.cssText += `
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
        
        this.canvas.parentElement.appendChild(startButton);
    }
    
    startGame() {
        // Remove mobile start button
        const startButton = document.getElementById('mobileStartButton');
        if (startButton) {
            startButton.remove();
        }
        document.body.classList.remove('is-menu');
        this.resetMenuSlingshot();
        
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
        const kevinShip = this.assetLoader.getGameSprite('ship_closed');

        ctx.save();
        if (kevinShip) {
            ctx.drawImage(kevinShip, 22, 51, 92, 64);
        }
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

    drawMenuConsole(ctx, time) {
        this.drawHowToPlayCard(ctx);
        this.drawTryItVignette(ctx, time);
        this.menuButtons.highScores.render(ctx);
        this.menuButtons.levelEditor.render(ctx);
        this.menuButtons.loadLevel.render(ctx);
        this.drawStartButton(ctx, time);

        if (this.game.highScore > 0) {
            ctx.fillStyle = '#ffb343';
            ctx.font = '700 13px Arial, sans-serif';
            ctx.fillText(`BEST  ${Utils.formatScore(this.game.highScore)}`, 123, 590);
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
        this.menuButtons.tips.render(ctx);
    }

    drawTryItVignette(ctx, time) {
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.font = '900 22px Arial, sans-serif';
        ctx.fillText('Try it!', 42, 333);
        ctx.font = '16px Arial, sans-serif';
        ctx.fillText('Click and pull on', 42, 358);
        ctx.fillText('Kevin to test the', 42, 377);
        ctx.fillText('GPS!', 42, 396);

        const hoopX = 163;
        const hoopY = 439;
        ctx.save();
        ctx.translate(hoopX, hoopY);
        ctx.rotate(-0.08);
        ctx.strokeStyle = '#16dff3';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 17, 39, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (!this.menuSlingshot.launched) {
            const targetX = this.menuSlingshot.position.x - hoopX;
            const targetY = this.menuSlingshot.position.y - hoopY;
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

        this.drawMenuKevin(ctx, time);
    }

    drawMenuKevin(ctx, time) {
        if (!this.menuKevin) return;
        const state = this.menuSlingshot;
        this.menuKevin.x = state.position.x;
        this.menuKevin.y = state.position.y;
        this.menuKevin.aniFrame = Math.floor(time * 8) % 12;
        const rotation = state.launched
            ? Math.atan2(state.velocity.y, state.velocity.x)
            : Math.sin(time * 5) * 0.08;

        // Trail points already live in stage coordinates. Draw them before the
        // sprite transform so Kevin's facing rotation cannot rotate the path a
        // second time around his current position.
        this.menuKevin.drawTrailCanvas(ctx);
        ctx.save();
        ctx.translate(state.position.x, state.position.y);
        ctx.rotate(rotation);
        ctx.translate(-state.position.x, -state.position.y);
        if (this.menuKevin.realSpritesLoaded &&
            this.menuKevin.spriteSheets?.[this.menuKevin.currentAnimationType]) {
            this.menuKevin.drawRealSprite(ctx);
        } else {
            this.menuKevin.drawFallbackSprite(ctx);
        }
        ctx.restore();
    }

    drawOriginalMenuButton(ctx, x, y, width, height, text, fontSize, button = {}) {
        this.roundedRectPath(ctx, x, y, width, height, 8);
        ctx.fillStyle = button.isPressed ? '#e46d12' : button.isHovered ? '#ffb24d' : '#f79433';
        ctx.fill();
        this.roundedRectPath(ctx, x + 6, y + 6, width - 12, height - 12, 4);
        ctx.fillStyle = '#fff3bb';
        ctx.fill();
        ctx.fillStyle = '#f47b20';
        ctx.font = `900 ${fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(text, x + width / 2, y + height / 2 + fontSize * 0.34);
    }

    drawStartButton(ctx, time) {
        this.menuButtons.start.render(ctx);

        for (const planet of this.getMenuStartPlanets(time)) {
            const dotX = planet.x;
            const dotY = planet.y;
            const glow = ctx.createRadialGradient(dotX - 4, dotY - 5, 2, dotX, dotY, 18);
            glow.addColorStop(0, '#56a8ff');
            glow.addColorStop(0.45, '#174cff');
            glow.addColorStop(1, '#3113d0');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 18, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawStartButtonVisual(ctx, button) {
        const x = 655;
        const y = 512;
        ctx.save();
        ctx.translate(x, y);
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
        ctx.textAlign = 'center';
        ctx.fillText('Start', 0, 13);
        ctx.restore();
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
        this.simulationAccumulator = 0;
        this.scheduleNextFrame();
    }
    
    async checkLevelParameter() {
        // Numeric selectors use the default catalog; manual:N selects the
        // archived hand-authored campaign.
        const levelParam = Utils.getURLParameter('level');
        if (levelParam) {
            const selector = parseLevelSelector(levelParam);
            if (selector) {
                if (selector.collection !== this.game.levelLoader.activeCollection) {
                    await this.game.levelLoader.loadCollection(selector.collection);
                }
                plog.info(`Jumping to ${selector.collection} level ${selector.level} from URL parameter`);
                this.game.jumpToLevel(selector.level);
                
                // Show level info briefly
                const loadingText = document.getElementById('loadingText');
                if (loadingText) {
                    loadingText.textContent = `Starting ${selector.collection === 'manual' ? 'Manual ' : ''}Level ${selector.level}...`;
                    setTimeout(() => {
                        const loadingScreen = document.getElementById('loadingScreen');
                        if (loadingScreen) {
                            loadingScreen.style.display = 'none';
                        }
                    }, RUNTIME_CONFIG.urlLevelLoadingDelayMs);
                }
            } else {
                plog.warn(
                    `Invalid level parameter: ${levelParam}. Must be ` +
                    `${LEVEL_CATALOG_CONFIG.firstLevel}-${LEVEL_CATALOG_CONFIG.maxGeneratedLevel} ` +
                    `or manual:1-manual:25.`
                );
                Utils.removeURLParameter('level');
            }
        }
    }

    checkLevelEditorParameter() {
        if (!Utils.hasURLParameter('level_editor')) return;

        // A level parameter has already loaded its requested level. Without one,
        // initialize the normal first level before activating the editor.
        if (this.game.state === GameState.MENU) {
            this.game.startGame();
        }

        plog.info('Entering level editor from URL parameter');
        this.game.enterLevelEditor();
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
