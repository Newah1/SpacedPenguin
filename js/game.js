// Main game engine for Spaced Penguin
// Based on the original game loop and GPS scripts

import { GameObject, Planet, Bonus, BonusPopup, Target, Slingshot, Arrow, TextObject, PointingArrow, Portal, SpeedBooster } from './gameObjects.js';
import { BlackHole } from './blackHole.js';
import { Penguin } from './penguin.js';
import { Physics } from './physics.js';
import Utils from './utils.js';
import { LevelLoader } from './levelLoader.js';
import { UIManager } from './uiManager.js';
import { LevelEndScreen } from './views/levelEndScreen.js';
import Console from './console.js';
import LevelEditor from './levelEditor.js';
import FullscreenManager from './fullscreenManager.js';
import plog from './penguinLogger.js';
import {
    captureGameSimulationState,
    applyGameSimulationEvents,
    invalidateGameSimulationState,
    stepGameSimulation
} from './gameSimulationAdapter.js';
import { calculateLaunchPosition, calculateLaunchVelocity, calculateLevelScore } from './simulationEngine.js';
import { predictAimAssistTrajectory } from './aimAssist.js';
import {
    LevelOrbitType
} from './levelSchema.js';
import {
    isRuntimeObjectExportable,
    serializeRuntimeObject
} from './runtimeObjectSerialization.js';
import {
    LEVEL_CATALOG_CONFIG,
    LEVEL_DEFAULTS,
    PHYSICS_CONFIG,
    WORLD_CONFIG
} from './config/gameConfig.js';
import { INPUT_CONFIG, isMobileViewport } from './config/inputConfig.js';
import { RENDER_CONFIG } from './config/renderConfig.js';
import { assetPath } from './config/assetConfig.js';
import { AudioCue, getAudioCue } from './config/audioConfig.js';
import { RUNTIME_CONFIG } from './config/runtimeConfig.js';
import { SETTINGS_CONFIG } from './config/settingsConfig.js';
import { LocalSettingsStore } from './settingsStore.js';
import { SettingsManager } from './settingsManager.js';
import { SettingsScreen } from './views/settingsScreen.js';
import { StellarTrackStore } from './stellarTrackStore.js';
import { HighScoreStore } from './highScoreStore.js';
import { HighScoresScreen } from './views/highScoresScreen.js';
import { LevelBrowserScreen } from './views/levelBrowserScreen.js';
import { LevelSaveService, captureLevelThumbnail } from './levelSaveService.js';
import { createConfiguredLevelCatalog } from './levelCatalogComposition.js';
import { readAppConfig } from './config/appConfig.js';
import { CommunityLevelClient, createIdempotencyKey } from './communityLevelClient.js';
import { calculateCommunityScore } from './communityScore.js';
import { RunTranscriptRecorder } from './runTranscript.js';
import { assertValidLevelDefinition } from './levelValidation.js';
import { createButton, registerButton } from './buttonFramework.js';
import { getRuntimeGameConfigValue } from './config/runtimeGameConfig.js';
import {
    STAGE_WIDTH,
    STAGE_HEIGHT,
    applyCameraTransform,
    applyViewportTransform,
    clearViewport,
    createWorldCamera,
    createViewport,
    screenToStage,
    updateFollowCamera
} from './viewport.js';
import { GameState } from './gameState.js';
import { KevinCamRenderer } from './kevinCamRenderer.js';

const FAST_FORWARD_UNLOCK_SECONDS = 5;

class Game {
    constructor(canvas, assetLoader, audioManager, options = {}) {
        plog.info('Game constructor called');
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.physics = new Physics();
        this.assetLoader = assetLoader;
        this.audioManager = audioManager;
        this.stellarTrackStore = new StellarTrackStore();
        this.settingsManager = new SettingsManager(
            SETTINGS_CONFIG,
            new LocalSettingsStore(SETTINGS_CONFIG.storageKey),
            {
                audioEnabled: value => this.audioManager?.setEnabled(value),
                backgroundMusicEnabled: value => this.audioManager?.setBackgroundMusicEnabled(value),
                masterVolume: value => this.audioManager?.setMasterVolume(value),
                aimAssistEnabled: value => {
                    if (!value) this.aimAssistPoints = [];
                }
            }
        );
        this.restoreStellarMode();
        const menuSettingsButton = document.getElementById('menuSettingsButton');
        registerButton(menuSettingsButton, event => {
            event.stopPropagation();
            this.showSettings();
        }, {
            backgroundColor: '#fff3bb',
            hoverColor: '#fff9d7',
            textColor: '#c95616',
            borderColor: '#f79433'
        });
        this.pauseMenuButton = document.getElementById('pauseMenuButton');
        registerButton(this.pauseMenuButton, event => {
            event.stopPropagation();
            if (this.state === GameState.PLAYING) this.showPauseMenu();
        });
        
        // Canvas scaling for responsive design
        this.canvasScaleX = 1;
        this.canvasScaleY = 1;
        
        // UI Manager for menus and overlays
        this.uiManager = new UIManager(canvas, audioManager, {
            onScreensChanged: () => this.updateBackgroundMusicDimming()
        });
        
        // Game state
        this.state = GameState.MENU;
        this.updateBackgroundMusicDimming();
        this.level = 1;
        this.score = 0;
        this.currentLevelBestScore = 0;
        this.currentAttemptScore = 0; // Track score for current attempt only
        this.distance = 0;
        this.tries = 0;
        this.highScore = 0;
        this.highScoreStore = new HighScoreStore(
            typeof localStorage === 'undefined' ? null : localStorage
        );
        this.levelLoader = new LevelLoader(assetLoader);
        this.levelSaveService = options.levelSaveService || new LevelSaveService();
        this.appConfig = readAppConfig(options.appConfig);
        if (options.levelCatalogService) {
            this.levelCatalogService = options.levelCatalogService;
        } else {
            this.levelCatalogService = createConfiguredLevelCatalog(this.levelSaveService.repository, {
                levelLoader: this.levelLoader,
                appConfig: this.appConfig
            });
        }
        this.communityLevelClient = options.communityLevelClient || (
            this.appConfig.levelServer.baseUrl
                ? new CommunityLevelClient({
                    baseUrl: this.appConfig.levelServer.baseUrl,
                    requestTimeoutMs: this.appConfig.levelServer.requestTimeoutMs
                })
                : null
        );
        this.runTick = 0;
        this.runTranscriptRecorder = null;
        this.completedRun = null;
        this.recordedRunLevel = null;
        this.pendingCommunityScoreSubmission = null;
        this.currentRunScoreSaved = false;
        this.planetCollisions = 0; // Track planet collisions for rules
        
        // Level system
        this.levelRules = null;
        this.levelMetadata = {
            name: 'Custom Level 1',
            description: 'Generated by Level Editor'
        };
        
        // Bounds system (matching original game's pFlightRect/pStageRect)
        this.stageRect = { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };
        this.flightRect = { ...WORLD_CONFIG.flightBounds };
        this.cameraConfig = null;
        this.viewport = canvas.viewport || createViewport(STAGE_WIDTH, STAGE_HEIGHT, 1);
        this.worldCamera = createWorldCamera(this.stageRect);
        this.viewRect = this.worldCamera.viewRect;
        this.kevinCamRenderer = options.kevinCamRenderer || new KevinCamRenderer();
        
        // Game objects
        this.penguin = null;
        this.crashedPenguins = [];
        this.slingshot = null;
        this.launches = [];
        this.target = null;
        this.planets = [];
        this.bonuses = [];
        this.portals = [];
        this.speedBoosters = [];
        this.textObjects = [];
        this.pointingArrows = [];
        this.gameObjects = [];
        
        // Rendering optimizations
        this._cachedSortedObjects = null;
        this._gameObjectsChanged = true;
        
        // Bonus popup system
        this.bonusPopup = new BonusPopup(0, 0, 0);
        this.gameObjects.push(this.bonusPopup);
        
        // Initialize arrow after stage rect is set up
        this.arrow = new Arrow(0, 0);
        this.arrow.setStageRect(this.viewRect);
        this.arrow.setFlightRect(this.flightRect);
        this.gameObjects.push(this.arrow);

        // Initialize console and level editor
        this.console = new Console(this);
        this.levelEditor = new LevelEditor(this);
        
        // Initialize fullscreen manager
        this.fullscreenManager = new FullscreenManager(
            canvas,
            canvas.parentElement,
            () => window.gameManager?.setupResponsiveCanvas()
        );
        
        // Pass ALL class references to level editor for object creation
        this.levelEditor.gameObjectClasses = {
            Planet,
            BlackHole,
            Bonus,
            BonusPopup,
            Target,
            Arrow,
            Slingshot,
            TextObject,
            PointingArrow,
            Portal,
            SpeedBooster
        };
        
        // Shot path tracing system (like original game)
        this.shotPaths = []; // Array of complete shot paths
        this.currentShotPath = []; // Current shot being recorded
        this.currentShotRenderPath = null;
        this.portalTransition = null;
        this.aimAssistPoints = [];
        this.shotColors = RENDER_CONFIG.shotTrails.colors;
        this.currentColorIndex = 0;
        this.isRecordingPath = false;
        this._runtimeSimulationState = null;
        
        // Alpha mask system (matching original game's k1, k2, k3 sprites)
        this.alphaMasks = []; // Array of last 3 launch positions with alpha masks
        this.alphaMaskImage = null; // The Kev_Alph alpha mask image
        this.alphaMaskStencil = null;
        this.coloredAlphaMaskCanvases = new Map();
        this.loadAlphaMask();
        
        // Input handling
        this.mouseDown = false;
        this.mousePosition = { x: 0, y: 0 };
        this.isDragging = false;
        
        // Animation
        this.lastTime = 0;
        this.deltaTime = 0;
        
        // UI
        this.ui = {
            level: document.getElementById('level'),
            score: document.getElementById('score'),
            distance: document.getElementById('distance'),
            tries: document.getElementById('tries')
        };
        this._hudValues = Object.create(null);
        this._nextDistanceHudUpdate = 0;
        this.simulationSpeed = 1;
        this.soaringElapsedTime = 0;
        this.simulationSpeedButton = document.getElementById('simulationSpeedButton');
        registerButton(this.simulationSpeedButton, null, {
            backgroundColor: 'rgba(2, 12, 28, 0.88)',
            hoverColor: 'rgba(20, 46, 74, 0.96)',
            activeColor: 'rgba(72, 247, 72, 0.9)',
            textColor: 'var(--hud-color)',
            borderColor: 'rgba(72, 247, 72, 0.72)'
        });
        this.setupSimulationSpeedControl();
        
        plog.debug('UI elements found:', this.ui);
        plog.debug('Asset loader available:', !!this.assetLoader);
        
        // Note: Input handling is managed by InputManager contexts.
        plog.success('Game constructor completed');
        // Don't load level immediately - wait for start
        this.stars = [];
        this.starfieldTime = 0;
        this.starDriftSpeed = RENDER_CONFIG.starfield.drift;
        this.generateStars();
    }
    
    setState(newState) {
        if (this.state !== newState) {
            plog.info(`Game state changing from ${this.state} to ${newState}`);
            this.state = newState;
            this.updateBackgroundMusicDimming();

            if (this.pauseMenuButton) {
                this.pauseMenuButton.style.display = newState === GameState.PLAYING ? 'block' : 'none';
            }

            document.body.classList.toggle('is-menu', newState === GameState.MENU);
            if (newState !== GameState.MENU) {
                document.getElementById('mobileStartButton')?.remove();
            }
            if (newState === GameState.MENU || newState === GameState.GAME_OVER || newState === GameState.SCORING) {
                this.resetSimulationSpeedControl();
            }
            
            // Input contexts inspect live state when each event is dispatched,
            // so state transitions do not require listener reconciliation.
        }
    }
    
    // Input handling methods - called by input contexts
    // These methods are kept for backwards compatibility but input routing
    // is now handled by the InputManager context system
    
    setupEventListeners() {
        // This method is deprecated; input handling is managed by InputManager.
        console.warn('Game.setupEventListeners() is deprecated - input now managed by InputManager');
        
        // Still set touch action for mobile compatibility
        this.canvas.style.touchAction = 'none';
        
        // Add mobile-specific controls
        this.setupMobileControls();
    }
    
    setupMobileControls() {
        // Create mobile control buttons if on mobile
        if (this.isMobileDevice()) {
            this.createMobileControlButtons();
        }
    }
    
    isMobileDevice() {
        return isMobileViewport();
    }
    
    createMobileControlButtons() {
        // Remove existing buttons if any
        const existingButtons = document.querySelectorAll('.mobile-control-button, .mobile-ui-overlay');
        existingButtons.forEach(btn => btn.remove());
        
        // Create mobile UI overlay container
        this.mobileUIOverlay = document.createElement('div');
        this.mobileUIOverlay.className = 'mobile-ui-overlay';
        this.mobileUIOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 150;
            font-family: Arial, sans-serif;
        `;
        
        // Create mobile control panel
        const controlPanel = document.createElement('div');
        controlPanel.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: auto;
        `;
        
        // Create reset button
        const resetButton = createButton('TRY AGAIN', () => {
            if (this.state === GameState.PLAYING || (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play')) {
                this.tryAgain();
                if ('vibrate' in navigator) navigator.vibrate(INPUT_CONFIG.hapticsMs.mobileControl);
            }
        }, { backgroundColor: 'rgba(255, 100, 100, 0.9)', hoverColor: 'rgba(255, 135, 135, 0.96)', textColor: 'white' });
        resetButton.classList.add('mobile-control-button');
        resetButton.textContent = '↻ TRY AGAIN';
        resetButton.style.cssText += `
            border: none;
            padding: 12px 16px;
            border-radius: 25px;
            font-size: 14px;
            font-weight: bold;
            touch-action: manipulation;
            min-height: 44px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
        `;
        
        
        // Create quit button
        const quitButton = createButton('QUIT', () => {
            if (this.state === GameState.PLAYING || (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play')) {
                this.showQuitDialog();
            }
        }, { backgroundColor: 'rgba(128, 128, 128, 0.9)', hoverColor: 'rgba(160, 160, 160, 0.96)', textColor: 'white' });
        quitButton.classList.add('mobile-control-button');
        quitButton.textContent = '✕ QUIT';
        quitButton.style.cssText += `
            border: none;
            padding: 12px 16px;
            border-radius: 25px;
            font-size: 14px;
            font-weight: bold;
            touch-action: manipulation;
            min-height: 44px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
        `;
        
        
        controlPanel.appendChild(resetButton);
        controlPanel.appendChild(quitButton);
        
        // Create mobile instruction overlay
        this.mobileInstructions = document.createElement('div');
        this.mobileInstructions.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 25px;
            font-size: 14px;
            text-align: center;
            pointer-events: none;
            max-width: 90%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
            transition: opacity 0.3s ease;
        `;
        
        // Create launch visual feedback
        this.createLaunchFeedback();
        
        this.mobileUIOverlay.appendChild(controlPanel);
        this.mobileUIOverlay.appendChild(this.mobileInstructions);
        document.body.appendChild(this.mobileUIOverlay);
        
        // Update instructions based on current state
        this.updateMobileInstructions();
        
        // Auto-hide instructions after 5 seconds
        setTimeout(() => {
            if (this.mobileInstructions) {
                this.mobileInstructions.style.opacity = '0.6';
            }
        }, RUNTIME_CONFIG.mobileInstructionsFadeDelayMs);
    }
    
    createLaunchFeedback() {
        // Create visual feedback for slingshot aiming
        this.launchIndicator = document.createElement('div');
        this.launchIndicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 100px;
            height: 100px;
            border: 3px solid rgba(0, 255, 255, 0.8);
            border-radius: 50%;
            pointer-events: none;
            opacity: 0;
            transition: all 0.2s ease;
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
        `;
        
        this.mobileUIOverlay.appendChild(this.launchIndicator);
    }
    
    updateMobileInstructions() {
        if (!this.mobileInstructions || !this.isMobileDevice()) return;
        
        let instructionText = '';
        
        switch (this.state) {
            case GameState.MENU:
                instructionText = '👆 Tap anywhere to start';
                break;
            case GameState.PLAYING:
                if (this.penguin && this.penguin.state === 'idle') {
                    instructionText = '🎯 Drag penguin to aim, release to launch';
                } else if (this.penguin && this.penguin.state === 'pullback') {
                    instructionText = '🎯 Release to launch!';
                } else if (this.penguin && this.penguin.state === 'soaring') {
                    instructionText = '👆 Tap to try again';
                } else {
                    instructionText = '🐧 Ready to launch!';
                }
                break;
            case GameState.LEVEL_EDITOR:
                if (this.levelEditor && this.levelEditor.mode === 'play') {
                    instructionText = '🎮 Testing level - drag to launch';
                } else {
                    instructionText = '✏️ Level Editor - long press to add objects';
                }
                break;
            default:
                instructionText = '👆 Touch to interact';
        }
        
        this.mobileInstructions.textContent = instructionText;
    }
    
    showLaunchFeedback(show = true) {
        if (this.launchIndicator) {
            this.launchIndicator.style.opacity = show ? '1' : '0';
            this.launchIndicator.style.transform = show ? 
                'translate(-50%, -50%) scale(1.2)' : 
                'translate(-50%, -50%) scale(1)';
        }
    }
    
    getMousePosition(e) {
        return screenToStage(this.canvas, this.viewport, e.clientX, e.clientY, this.getActiveCamera());
    }
    
    setCanvasScale(scaleX, scaleY) {
        this.canvasScaleX = scaleX;
        this.canvasScaleY = scaleY;
    }

    setViewport(viewport) {
        this.viewport = viewport;
        this.canvasScaleX = viewport.scale;
        this.canvasScaleY = viewport.scale;
        this.viewRect = this.getActiveCamera().viewRect;
        this.arrow?.setStageRect(this.viewRect);
    }

    getActiveCamera() {
        return this.levelEditor?.active && this.levelEditor.mode === 'edit' && this.levelEditor.editorCamera
            ? this.levelEditor.editorCamera
            : this.worldCamera;
    }

    resetWorldCamera() {
        const focus = this.slingshot?.position || (this.penguin
            ? { x: this.penguin.x, y: this.penguin.y }
            : null);
        this.worldCamera = createWorldCamera(this.stageRect, this.cameraConfig, focus);
        this.viewRect = this.worldCamera.viewRect;
        this.arrow?.setStageRect(this.viewRect);
    }

    updateWorldCamera(deltaTime) {
        if (this.worldCamera?.mode !== 'follow' || !this.penguin) return;
        this.worldCamera = updateFollowCamera(this.worldCamera, {
            x: this.penguin.x,
            y: this.penguin.y,
            velocity: this.penguin.velocity
        }, deltaTime, RENDER_CONFIG.camera);
        if (!(this.levelEditor?.active && this.levelEditor.mode === 'edit')) {
            this.viewRect = this.worldCamera.viewRect;
            this.arrow?.setStageRect(this.viewRect);
        }
    }

    beginFrame() {
        clearViewport(this.ctx, this.canvas);
        applyViewportTransform(this.ctx, this.viewport);
    }
    
    handleMouseDown(e) {
        this.mouseDown = true;
        this.mousePosition = this.getMousePosition(e);

        if (this.state === GameState.MENU) {
            this.startGame();
            return;
        }
        
        // Delegate to level editor if active AND in edit mode
        if (this.state === GameState.LEVEL_EDITOR && this.levelEditor.active && this.levelEditor.mode === 'edit') {
            this.levelEditor.handleMouseDown(e);
            return;
        }
        
        // Allow slingshot in both playing state and level editor play mode
        const canUseSlingshot = (this.state === GameState.PLAYING) || 
                              (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play');
        
        if (canUseSlingshot && this.penguin.state === 'idle') {
            this.isDragging = true;
            this.slingshot.startPull(this.mousePosition.x, this.mousePosition.y);
            this.penguin.setState('pullback');
            this.updateAimAssistPreview();
            
            // Show visual feedback for mobile
            if (this.isMobileDevice()) {
                this.showLaunchFeedback(true);
                this.updateMobileInstructions();
            }
        }
    }
    
    handleMouseMove(e) {
        this.mousePosition = this.getMousePosition(e);
        
        // Delegate to level editor if active AND in edit mode
        if (this.state === GameState.LEVEL_EDITOR && this.levelEditor.active && this.levelEditor.mode === 'edit') {
            this.levelEditor.handleMouseMove(e);
            return;
        }
        
        if (this.isDragging && this.slingshot.isPulling) {
            this.slingshot.updatePullback(this.mousePosition.x, this.mousePosition.y);
            this.updateAimAssistPreview();
        }
    }
    
    handleMouseUp(e) {
        this.mouseDown = false;
        
        // Delegate to level editor if active AND in edit mode
        if (this.state === GameState.LEVEL_EDITOR && this.levelEditor.active && this.levelEditor.mode === 'edit') {
            this.levelEditor.handleMouseUp(e);
            return;
        }
        
        if (this.isDragging) {
            this.isDragging = false;
            this.aimAssistPoints = [];
            const velocity = this.slingshot.release();
            this.launchPenguin(velocity, this.slingshot.lastLaunch);
            
            // Hide visual feedback for mobile
            if (this.isMobileDevice()) {
                this.showLaunchFeedback(false);
                this.updateMobileInstructions();
            }
        } else {
            // Mouse click during soaring triggers tryAgain (like original)
            const canUseSlingshot = (this.state === GameState.PLAYING) || 
                                  (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play');
            if (canUseSlingshot && this.penguin && this.penguin.state === 'soaring') {
                this.tryAgain();
            }
        }
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            
            // Create a synthetic mouse event
            const mouseEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {},
                stopPropagation: () => {}
            };
            
            this.handleMouseDown(mouseEvent);
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            
            // Create a synthetic mouse event
            const mouseEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {},
                stopPropagation: () => {}
            };
            
            this.handleMouseMove(mouseEvent);
        }
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Create a synthetic mouse event
        const mouseEvent = {
            clientX: 0,
            clientY: 0,
            preventDefault: () => {},
            stopPropagation: () => {}
        };
        
        this.handleMouseUp(mouseEvent);
    }
    
    handleKeyDown(e) {
        // Handle console toggle first
        if (e.key === '`') {
            e.preventDefault();
            this.console.toggle();
            return;
        }
        
        // Don't process other keys if console is open
        if (this.console.visible) {
            return;
        }
        
        // Check if we should allow play mode keys
        const canUsePlayKeys = (this.state === GameState.PLAYING) || 
                              (this.state === GameState.LEVEL_EDITOR && this.levelEditor.mode === 'play');
        
        switch (e.key.toLowerCase()) {
            case 'q':
                if (canUsePlayKeys) {
                    this.showQuitDialog();
                }
                break;
            case 'r':
                if (canUsePlayKeys) {
                    this.tryAgain();
                }
                break;
            case ' ':
                // Only allow spacebar to start game on desktop
                // But don't interfere if InputManager already handled it
                if (this.state === GameState.MENU && !this.isMobileDevice() && !e.defaultPrevented) {
                    this.startGame();
                }
                break;
            default:
                // Any other key during playing triggers tryAgain (like original)
                if (canUsePlayKeys && this.penguin && this.penguin.state === 'soaring') {
                    this.tryAgain();
                }
                break;
        }
    }
    
    launchPenguin(velocity, launch = null) {
        plog.soar('Game launchPenguin called with velocity:', velocity);
        this.resetSimulationSpeedControl();
        this.aimAssistPoints = [];
        const releasePosition = this.penguin
            ? { x: this.penguin.x, y: this.penguin.y }
            : null;

        if (launch) {
            this.launches.push({ angle: launch.angle, power: launch.power });
            this.recordRunLaunch(launch.angle, launch.power);
        }
        if (launch && this.slingshot.launchModel === 'director') {
            const position = calculateLaunchPosition(launch.angle, launch.power, {
                position: this.slingshot.position,
                anchorPosition: this.slingshot.anchor,
                maxPullback: this.slingshot.maxPullback,
                minPullback: this.slingshot.minPullback,
                launchModel: this.slingshot.launchModel,
                sourceFrameRate: this.slingshot.sourceFrameRate,
                coordinateScale: this.slingshot.coordinateScale
            });
            this.penguin.setPosition(position.x, position.y);
        }
        
        // Keep the shot marker at the pullback/release point. Director-model
        // launches may move the live penguin to a separate simulated snap point.
        this.createAlphaMaskAtLaunchPosition(releasePosition);
        
        this.penguin.launch(velocity.x, velocity.y);
        this.penguin.setState('soaring');
        this.tries++;
        this.invalidateSimulationState();
        this.updateUI();
        
        // Play launch sound
        this.playSound(getAudioCue(AudioCue.LAUNCH).soundId);
        
        // Clear physics trace
        this.physics.clearTrace();
        
        // Start recording shot path
        this.startRecordingShotPath();
        

    }

    launchTestTrajectory(angle, power) {
        if (!Number.isFinite(angle) || !Number.isFinite(power)) {
            throw new Error('Launch angle and power must be finite numbers');
        }

        // Headless samples always begin from a freshly loaded level. Reloading
        // here also resets orbiting objects to simulation time zero so the live
        // game starts from the exact same world state.
        this.loadLevel(this.level);
        this.setState(GameState.PLAYING);

        const velocity = calculateLaunchVelocity(angle, power, {
            velocityMultiplier: this.slingshot.velocityMultiplier,
            maxPullback: this.slingshot.maxPullback,
            minPullback: this.slingshot.minPullback,
            launchModel: this.slingshot.launchModel,
            sourceFrameRate: this.slingshot.sourceFrameRate,
            coordinateScale: this.slingshot.coordinateScale
        });
        this.launchPenguin(velocity, { angle, power });
        return velocity;
    }
    
    // Shot path recording methods (matching original game behavior)
    startRecordingShotPath() {
        this.isRecordingPath = true;
        this.currentShotPath = [];
        this.currentShotRenderPath = typeof Path2D === 'function' ? new Path2D() : null;
        plog.waddle(`Started recording shot path ${this.shotPaths.length + 1} with color ${this.shotColors[this.currentColorIndex]}`);
    }
    
    recordPathPoint(x, y) {
        if (!this.isRecordingPath || this.penguin.state === 'crashed') return;
        const previous = this.currentShotPath.at(-1);
        if (previous && x === previous.x && y === previous.y) {
            return;
        }

        if (this.currentShotRenderPath) {
            if (previous) {
                this.currentShotRenderPath.lineTo(x, y);
            } else {
                this.currentShotRenderPath.moveTo(x, y);
            }
        }
        this.currentShotPath.push({ x, y });
    }

    recordPortalTransit(entryPosition, exitPosition) {
        if (!this.isRecordingPath) return;
        this.recordPathPoint(entryPosition.x, entryPosition.y);
        this.currentShotRenderPath?.moveTo(exitPosition.x, exitPosition.y);
        this.currentShotPath.push({ x: exitPosition.x, y: exitPosition.y, move: true });
    }
    
    endRecordingShotPath() {
        if (this.isRecordingPath && this.currentShotPath.length > 1) {
            // Store the complete path with its color
            const shotPath = {
                points: this.currentShotPath,
                renderPath: this.currentShotRenderPath,
                color: this.shotColors[this.currentColorIndex],
                shotNumber: this.shotPaths.length + 1
            };
            
            this.shotPaths.push(shotPath);
            if (this.shotPaths.length > RENDER_CONFIG.shotTrails.maximumCompletedPaths) {
                this.shotPaths.shift();
            }
            plog.waddle(`Saved shot path ${shotPath.shotNumber} with ${shotPath.points.length} points in color ${shotPath.color}`);
            
            // Cycle to next color
            this.currentColorIndex = (this.currentColorIndex + 1) % this.shotColors.length;
        }
        
        this.isRecordingPath = false;
        this.currentShotPath = [];
        this.currentShotRenderPath = null;
    }
    
    clearAllShotPaths() {
        this.shotPaths = [];
        this.currentShotPath = [];
        this.currentShotRenderPath = null;
        this.currentColorIndex = 0;
        this.isRecordingPath = false;
        plog.debug('Cleared all shot paths');
    }
    
    drawAllShotPaths(ctx) {
        // Draw all completed shot paths
        for (const shotPath of this.shotPaths) {
            if (shotPath.points.length < 2) continue;
            
            ctx.save();
            ctx.strokeStyle = shotPath.color;
            ctx.lineWidth = RENDER_CONFIG.shotTrails.lineWidth;
            ctx.globalAlpha = RENDER_CONFIG.shotTrails.completedAlpha;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            if (shotPath.renderPath) {
                ctx.stroke(shotPath.renderPath);
            } else {
                ctx.moveTo(shotPath.points[0].x, shotPath.points[0].y);
                for (let i = 1; i < shotPath.points.length; i++) {
                    const point = shotPath.points[i];
                    if (point.move) ctx.moveTo(point.x, point.y);
                    else ctx.lineTo(point.x, point.y);
                }
                ctx.stroke();
            }
            ctx.restore();
        }
        
        // Draw current shot path being recorded (if any) with slightly different style
        if (this.isRecordingPath && this.currentShotPath.length > 1) {
            ctx.save();
            ctx.strokeStyle = this.shotColors[this.currentColorIndex];
            ctx.lineWidth = RENDER_CONFIG.shotTrails.lineWidth;
            ctx.globalAlpha = RENDER_CONFIG.shotTrails.activeAlpha;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            if (this.currentShotRenderPath) {
                ctx.stroke(this.currentShotRenderPath);
            } else {
                ctx.moveTo(this.currentShotPath[0].x, this.currentShotPath[0].y);
                for (let i = 1; i < this.currentShotPath.length; i++) {
                    const point = this.currentShotPath[i];
                    if (point.move) ctx.moveTo(point.x, point.y);
                    else ctx.lineTo(point.x, point.y);
                }
                ctx.stroke();
            }
            ctx.restore();
        }
    }
    
    drawAlphaMasks(ctx) {
        if (this.alphaMasks.length === 0) return;
        
        // Draw alpha masks in reverse order (oldest first, newest last)
        for (let i = this.alphaMasks.length - 1; i >= 0; i--) {
            const mask = this.alphaMasks[i];
            if (!mask.renderCanvas) continue;
            
            ctx.save();
            ctx.globalAlpha = mask.alpha;
            ctx.translate(mask.x, mask.y);

            // Draw the result centered on the launch position
            // Use the registration point from the original game: [8, 13]
            ctx.drawImage(mask.renderCanvas, -8, -13);
            
            ctx.restore();
        }
    }
    
    update(deltaTime) {
        this.deltaTime = deltaTime;
        this.starfieldTime = (this.starfieldTime || 0) + deltaTime;
        
        // Update UI Manager
        this.uiManager.update(deltaTime);
        
        // Only states with a fully loaded, actively playing world may enter the
        // deterministic simulation. Menu construction intentionally has no
        // penguin, target, or slingshot yet.
        const shouldStepWorld = this.state === GameState.PLAYING ||
            (this.state === GameState.LEVEL_EDITOR && this.levelEditor?.mode === 'play');
        if (!shouldStepWorld) {
            return;
        }

        const simulationResult = this.updateSimulation(deltaTime);
        this.updateCrashedPenguins?.(deltaTime);
        this.updateSimulationSpeedControl?.(deltaTime);
        this.updateWorldCamera?.(deltaTime);
        this.updateGameObjects(deltaTime, { updateOrbit: false });
        applyGameSimulationEvents(this, simulationResult.events, deltaTime);
    }

    updateSimulation(deltaTime) {
        return stepGameSimulation(this, deltaTime);
    }

    preserveCrashedPenguin() {
        if (this.penguin?.state === 'crashed') {
            this.crashedPenguins.push(this.penguin.createCrashCopy());
        }
    }

    updateBackgroundMusicDimming() {
        const menuState = this.state === GameState.MENU ||
            this.state === GameState.PAUSED ||
            this.state === GameState.GAME_OVER ||
            this.state === GameState.SCORING;
        const menuOpen = Boolean(this.uiManager?.activeScreens?.length);
        this.audioManager?.setBackgroundMusicDimmed(menuState || menuOpen);
    }

    updateCrashedPenguins(deltaTime) {
        this.crashedPenguins = this.crashedPenguins.filter(penguin =>
            penguin.updateDetachedCrash(deltaTime, this.planets, this.stageRect)
        );
    }

    updateGameObjects(deltaTime, options = {}) {
        // Update game objects with optimized loop
        const gameObjectCount = this.gameObjects.length;
        for (let i = 0; i < gameObjectCount; i++) {
            const obj = this.gameObjects[i];

            // Penguin movement, trail, and animation are updated by the
            // dedicated state-specific path below. Updating it here as well
            // advances the simulation twice per rendered frame.
            if (obj === this.penguin) continue;

            if (obj.constructor.name === 'Arrow') {
                // Only update arrow if penguin exists and has position AND is soaring
                if (this.penguin && this.penguin.position && this.penguin.state === 'soaring') {
                    obj.update(this.penguin);
                } else {
                    // Make sure arrow is hidden when penguin is not soaring
                    obj.visible = false;
                }
            } else {
                obj.update(deltaTime, options);
            }
        }
    }

    setupSimulationSpeedControl() {
        if (!this.simulationSpeedButton) return;
        this.simulationSpeedButton.addEventListener('pointerdown', event => event.stopPropagation());
        this.simulationSpeedButton.addEventListener('click', event => {
            event.stopPropagation();
            if (this.penguin?.state !== 'soaring' || this.soaringElapsedTime < FAST_FORWARD_UNLOCK_SECONDS) return;
            this.simulationSpeed = this.simulationSpeed === 2 ? 1 : 2;
            this.updateSimulationSpeedButton();
        });
        this.updateSimulationSpeedButton();
    }

    updateSimulationSpeedControl(deltaTime) {
        if (this.penguin?.state !== 'soaring') {
            this.resetSimulationSpeedControl();
            return;
        }
        this.soaringElapsedTime += deltaTime;
        this.updateSimulationSpeedButton();
    }

    updateSimulationSpeedButton() {
        if (!this.simulationSpeedButton) return;
        const visible = this.penguin?.state === 'soaring' &&
            this.soaringElapsedTime >= FAST_FORWARD_UNLOCK_SECONDS;
        this.simulationSpeedButton.style.display = visible ? 'block' : 'none';
        this.simulationSpeedButton.classList.toggle('is-active', this.simulationSpeed === 2);
        this.simulationSpeedButton.setAttribute('aria-pressed', String(this.simulationSpeed === 2));
        this.simulationSpeedButton.title = this.simulationSpeed === 2
            ? 'Return to normal speed'
            : 'Run simulation at double speed';
        if (visible && this.settingsManager?.get('stellarModeEnabled')) {
            this.audioManager?.playStellarMusic();
        }
    }

    resetSimulationSpeedControl() {
        this.audioManager?.stopStellarMusic();
        this.simulationSpeed = 1;
        this.soaringElapsedTime = 0;
        this.updateSimulationSpeedButton();
    }

    getSimulationSpeedMultiplier() {
        return this.simulationSpeed === 2 ? 2 : 1;
    }
    
    handleTargetHit() {
        this.completeRecordedRun();
        this.playSound(getAudioCue(AudioCue.ENTER_SHIP).soundId);

        // A successful editor play-test is the publish gate. Keep the editor
        // visible so the newly enabled Publish button is immediately usable.
        if (this.state === GameState.LEVEL_EDITOR && this.levelEditor?.active) {
            this.levelEditor.onPlayTestCompleted?.();
            return;
        }
        
        // Stop the target's hit timer so ship stays closed during scoring
        if (this.target && this.target.isHit) {
            this.target.isHit = false;
            this.target.hitFrameCount = 0;
        }
        
        // Wait a moment before showing scoring (matches original 30 frame delay)
        setTimeout(() => {
            this.showLevelEndScreen();
        }, RUNTIME_CONFIG.levelEndTransitionDelayMs);
    }
    
    calculateFinalScore() {
        const result = calculateLevelScore({
            distance: this.distance,
            level: this.level,
            tries: this.tries,
            attemptBonus: this.currentAttemptScore,
            totalScore: this.score,
            previousLevelContribution: this.currentLevelBestScore,
            multiplier: this.levelRules?.scoreMultiplier ?? 1
        });
        const levelScore = result.levelScore;
        this.currentLevelBestScore = result.levelContribution;
        this.score = result.totalScore;
        this.lastScoreImprovement = result.scoreImprovement;
        
        this.updateUI();
        
        // Check for high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.saveHighScore();
        }
        
        return levelScore;
    }
    
    showLevelEndScreen() {
        // A delayed campaign completion callback can race with entering the
        // editor. Never put campaign navigation in front of an editor session.
        if (this.levelEditor?.active) {
            this.setState(GameState.LEVEL_EDITOR);
            this.levelEditor.onPlayTestCompleted?.();
            return null;
        }
        if (this.state === GameState.SCORING) return null;
        this.setState(GameState.SCORING);
        this.calculateFinalScore();
        return this.uiManager.showScreen(LevelEndScreen, this);
    }
    
    nextLevel() {
        this.level++;
        this.currentLevelBestScore = 0;
        this.tries = 0;
        this.distance = 0;
        this.planetCollisions = 0;
        
        // Close any UI screens
        this.uiManager.closeAllScreens();
        
        // Load next level
        this.loadLevel(this.level);
        
        // Update URL parameter to reflect current level
        Utils.setURLParameter('level', this.levelLoader.formatLevelSelector(this.level));
        
        // Return to playing state
        this.setState(GameState.PLAYING);
    }
    
    resetLevel() {
        if (this.loadedLevelDefinition) {
            const levelIdentity = this.level;
            const metadata = structuredClone(this.levelMetadata || {});
            if (Number.isFinite(levelIdentity)) this.loadLevel(levelIdentity);
            else {
                this.loadLevel(structuredClone(this.loadedLevelDefinition));
                this.level = levelIdentity;
                this.levelMetadata = metadata;
            }
            this.setState(GameState.PLAYING);
            return;
        }
        this.resetSimulationSpeedControl();
        this.tries = 0;
        this.launches = [];
        this.distance = 0;
        this.currentAttemptScore = 0;
        this.planetCollisions = 0;
        this.crashedPenguins = [];
        this.resetPenguin();
        this.resetBonuses();
        this.physics.clearTrace();
        this.clearAllShotPaths();
        this.clearAlphaMasks();
        this.arrow.visible = false; // Reset arrow visibility
        this.setState(GameState.PLAYING);
        this.beginRecordedRun();
    }
    
    resetPenguin() {
        this.penguin.reset();
        this.resetPenguinToSlingshot();
        this.arrow.visible = false; // Reset arrow visibility
    }
    
    resetBonuses() {
        for (const bonus of this.bonuses) {
            bonus.reset(); // Use the new reset method
        }
        
        // Reset bonus popup
        if (this.bonusPopup) {
            this.bonusPopup.visible = false;
            this.bonusPopup.state = 'idle';
        }
    }
    
    loadLevel(level) {
        // Built-in levels use numeric selectors. Editor and saved levels are
        // already materialized definitions, so register them with the loader
        // before asking it to validate and construct the world.
        if (level && typeof level === 'object') {
            const customLevelKey = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            this.levelLoader.levels.set(customLevelKey, level);
            this.level = customLevelKey;
            level = customLevelKey;
        }
        // Validate before clearing the current world so a bad definition cannot
        // leave the game half-loaded.
        this.levelLoader.assertLevelValid(level);
        this.resetSimulationSpeedControl();
        this.invalidateSimulationState();

        // Clear existing game state
        this.gameObjects = [];
        this.planets = [];
        this.bonuses = [];
        this.portals = [];
        this.portalTransition = null;
        this.crashedPenguins = [];
        this.physics.clear();
        this.planetCollisions = 0;
        this.tries = 0;
        this.launches = [];
        this.distance = 0;
        this.currentAttemptScore = 0; // Reset attempt score for new level
        
        // Clear all shot path traces for new level
        this.clearAllShotPaths();
        this.clearAlphaMasks();
        
        // IMPORTANT: Invalidate render cache when clearing gameObjects
        this._cachedSortedObjects = null;
        this._gameObjectsChanged = true;
        
        // Load level through level loader first
        const result = this.levelLoader.loadLevel(level, this);
        
        // Add arrow AFTER level loader has finished (so it doesn't get cleared)
        this.arrow = new Arrow(0, 0);
        this.arrow.setStageRect(this.viewRect);
        this.arrow.setFlightRect(this.flightRect);
        this.gameObjects.push(this.arrow);
        
        // Re-add bonus popup system
        this.bonusPopup = new BonusPopup(0, 0, 0);
        this.gameObjects.push(this.bonusPopup);
        
        // Force render cache update since we added objects
        this._gameObjectsChanged = true;
        this.loadedLevelDefinition = this.exportCurrentLevel();
        this.beginRecordedRun(this.loadedLevelDefinition);
        
        return result;
    }
    
    // Helper methods for game object management
    addGameObject(obj) {
        this.gameObjects.push(obj);
        this._gameObjectsChanged = true;
    }
    
    removeGameObject(obj) {
        const index = this.gameObjects.indexOf(obj);
        if (index !== -1) {
            this.gameObjects.splice(index, 1);
            this._gameObjectsChanged = true;
        }
    }
    
    render() {
        this.beginFrame();
        const camera = this.getActiveCamera();
        this.viewRect = camera.viewRect;
        this.arrow?.setStageRect(this.viewRect);
        this.ctx.save();
        applyCameraTransform(this.ctx, camera);
        
        // Draw background stars (cached)
        this.drawStars();
        
        // Keep trajectory lines and trail marks inside the authored playfield.
        this.drawPlayfieldTraces();
        
        // Cache sorted objects if game objects haven't changed
        if (!this._cachedSortedObjects || this._gameObjectsChanged) {
            this._cachedSortedObjects = [...this.gameObjects].sort((a, b) => {
                const orderA = a.renderOrder || 0;
                const orderB = b.renderOrder || 0;
                return orderA - orderB;
            });
            this._gameObjectsChanged = false;
        }
        
        // Draw all game objects in render order
        const objCount = this._cachedSortedObjects.length;
        for (let i = 0; i < objCount; i++) {
            const object = this._cachedSortedObjects[i];
            if (object === this.penguin) {
                this.drawPenguinInPlayfield();
                for (const portal of this.portals || []) portal.drawForeground?.(this.ctx);
            } else if (!this.levelEditor?.shouldDeferRuntimeObjectDraw?.(object)) {
                object.draw(this.ctx);
            }
        }

        if (this.levelEditor?.gravitySculptController?.isTesting()) {
            this.levelEditor.gravitySculptController.onTestTargetHit();
            this.ctx.restore();
            return;
        }

        // Draw level editor overlay
        this.levelEditor.render(this.ctx);

        this.drawPlayfieldBorder();
        this.ctx.restore();

        // These overlays live on the fixed logical display surface.
        this.kevinCamRenderer.draw({
            ctx: this.ctx,
            enabled: this.settingsManager?.get('kevinCamEnabled') !== false,
            arrowVisible: Boolean(this.arrow?.visible),
            penguin: this.penguin
        });
        this.drawUI();
        this.uiManager.render();
    }

    drawPlayfieldBorder() {
        if (!this.cameraConfig) return;
        const config = RENDER_CONFIG.camera;
        this.ctx.save();
        this.ctx.strokeStyle = config.playfieldBorderColor;
        this.ctx.lineWidth = config.playfieldBorderWidth / this.getActiveCamera().scale;
        this.ctx.strokeRect(this.stageRect.x, this.stageRect.y, this.stageRect.width, this.stageRect.height);
        this.ctx.restore();
    }

    drawPlayfieldTraces() {
        const playfield = this.stageRect || {
            x: 0,
            y: 0,
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT
        };

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(playfield.x, playfield.y, playfield.width, playfield.height);
        this.ctx.clip();

        this.drawAllShotPaths(this.ctx);
        this.drawAlphaMasks(this.ctx);
        this.physics.drawTrace(this.ctx);
        this.drawAimAssist?.(this.ctx);

        this.ctx.restore();
    }

    updateAimAssistPreview() {
        if (!this.settingsManager.get('aimAssistEnabled') ||
            this.penguin?.state !== 'pullback' || !this.slingshot?.isPulling) {
            this.aimAssistPoints = [];
            return;
        }

        const dx = this.slingshot.anchor.x - this.penguin.x;
        const dy = this.slingshot.anchor.y - this.penguin.y;
        const power = Math.hypot(dx, dy);
        const angle = Utils.rotationAngle({ x: dx, y: dy });
        const velocity = calculateLaunchVelocity(angle, power, {
            velocityMultiplier: this.slingshot.velocityMultiplier,
            maxPullback: this.slingshot.maxPullback,
            minPullback: this.slingshot.minPullback,
            launchModel: this.slingshot.launchModel,
            sourceFrameRate: this.slingshot.sourceFrameRate,
            coordinateScale: this.slingshot.coordinateScale
        });
        const previewState = captureGameSimulationState(this);
        previewState.penguin.position = calculateLaunchPosition(angle, power, previewState.slingshot);
        this.aimAssistPoints = predictAimAssistTrajectory(
            previewState,
            velocity,
            {
                previewSeconds: getRuntimeGameConfigValue(
                    'SIMULATION_CONFIG.aimAssist.previewSeconds'
                )
            }
        );
    }

    onRuntimeConfigChanged(path) {
        if (path === 'SIMULATION_CONFIG.aimAssist.previewSeconds') {
            this.updateAimAssistPreview();
        }
    }

    drawAimAssist(ctx) {
        if (this.aimAssistPoints.length < 2 ||
            !this.settingsManager.get('aimAssistEnabled') ||
            this.penguin?.state !== 'pullback') return;

        const config = RENDER_CONFIG.aimAssist;
        ctx.save();
        ctx.globalAlpha = config.alpha;
        ctx.strokeStyle = config.color;
        ctx.lineWidth = config.lineWidth;
        ctx.lineCap = 'round';
        ctx.shadowColor = config.color;
        ctx.shadowBlur = config.glowBlur;
        ctx.setLineDash(config.dash);
        ctx.beginPath();
        ctx.moveTo(this.aimAssistPoints[0].x, this.aimAssistPoints[0].y);
        for (let index = 1; index < this.aimAssistPoints.length; index++) {
            const point = this.aimAssistPoints[index];
            if (point.move) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawPenguinInPlayfield() {
        if (!this.penguin) {
            return;
        }

        const playfield = this.stageRect || {
            x: 0,
            y: 0,
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT
        };

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(playfield.x, playfield.y, playfield.width, playfield.height);
        this.ctx.clip();
        for (const crashedPenguin of this.crashedPenguins || []) {
            crashedPenguin.draw(this.ctx);
        }
        if (!this.drawPortalTransition?.(this.ctx)) this.penguin.draw(this.ctx);
        this.ctx.restore();
    }

    beginPortalTransition(event) {
        this.portalTransition = {
            ...event,
            startedAt: globalThis.performance?.now?.() ?? Date.now()
        };
    }

    drawPortalTransition(ctx) {
        const transition = this.portalTransition;
        if (!transition || !this.penguin) return false;
        const now = globalThis.performance?.now?.() ?? Date.now();
        const durationMs = RENDER_CONFIG.entities.portal.transitionSeconds * 1000;
        const progress = Math.min(1, (now - transition.startedAt) / durationMs);
        if (progress >= 1) {
            this.portalTransition = null;
            return false;
        }
        const source = this.portals.find(portal => portal.id === transition.sourcePortalId);
        const destination = this.portals.find(portal => portal.id === transition.destinationPortalId);
        if (!source || !destination) return false;
        const unit = velocity => {
            const length = Math.hypot(velocity?.x || 0, velocity?.y || 0) || 1;
            return { x: (velocity?.x || 1) / length, y: (velocity?.y || 0) / length };
        };
        const incoming = unit(transition.incomingVelocity);
        const entryDistance = this.penguin.radius * 2.2 * (1 - progress);
        const entry = {
            x: transition.entryPosition.x - incoming.x * entryDistance,
            y: transition.entryPosition.y - incoming.y * entryDistance
        };
        const exit = {
            x: destination.position.x + (transition.exitPosition.x - destination.position.x) * progress,
            y: destination.position.y + (transition.exitPosition.y - destination.position.y) * progress
        };
        const drawInsideAperture = (portal, position) => {
            ctx.save();
            ctx.translate(portal.position.x, portal.position.y);
            ctx.rotate(Utils.toRadians(portal.rotation));
            ctx.beginPath();
            ctx.ellipse(0, 0, portal.width / 2, portal.height / 2, 0, 0, Math.PI * 2);
            ctx.clip();
            ctx.rotate(-Utils.toRadians(portal.rotation));
            ctx.translate(-portal.position.x, -portal.position.y);
            this.penguin.drawBodyAt(ctx, position.x, position.y);
            ctx.restore();
        };
        // The entering copy disappears into the aperture. The exiting copy is
        // deliberately drawn in ordinary world space: the destination's front
        // lip is rendered immediately afterward, which makes Kevin cross the
        // rim instead of looking trapped behind an aperture-shaped mask.
        drawInsideAperture(source, entry);
        this.penguin.drawBodyAt(ctx, exit.x, exit.y);
        return true;
    }

    generateStars() {
        // Generate 100 random, spaced-out stars
        const numStars = RENDER_CONFIG.starfield.count;
        const minDist = RENDER_CONFIG.starfield.minimumDistance;
        const maxTries = RENDER_CONFIG.starfield.placementAttempts;
        this.stars = [];
        for (let i = 0; i < numStars; i++) {
            let tries = 0;
            let x, y, size;
            let ok = false;
            while (!ok && tries < maxTries) {
                x = Math.random() * STAGE_WIDTH;
                y = Math.random() * STAGE_HEIGHT;
                size = RENDER_CONFIG.starfield.minimumSize +
                    Math.floor(Math.random() * RENDER_CONFIG.starfield.sizeVariants);
                ok = true;
                for (const s of this.stars) {
                    const dx = s.x - x;
                    const dy = s.y - y;
                    if (Math.sqrt(dx*dx + dy*dy) < minDist) {
                        ok = false;
                        break;
                    }
                }
                tries++;
            }
            this.stars.push({ x, y, size });
        }
    }
    
    drawStars() {
        // Repeat the deterministic 800 x 600 star tile across expanded worlds.
        // Each size is a depth layer: larger/nearer stars drift faster.
        const elapsed = this.starfieldTime || 0;
        const drift = this.starDriftSpeed || RENDER_CONFIG.starfield.drift;
        const stage = this.stageRect || { x: 0, y: 0, width: STAGE_WIDTH, height: STAGE_HEIGHT };
        const view = this.getActiveCamera?.().viewRect || this.viewRect || stage;
        const firstTileX = Math.floor(view.x / STAGE_WIDTH);
        const lastTileX = Math.floor((view.x + view.width - 1e-9) / STAGE_WIDTH);
        const firstTileY = Math.floor(view.y / STAGE_HEIGHT);
        const lastTileY = Math.floor((view.y + view.height - 1e-9) / STAGE_HEIGHT);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(stage.x, stage.y, stage.width, stage.height);
        this.ctx.clip();
        this.ctx.fillStyle = RENDER_CONFIG.starfield.color;
        for (let tileY = firstTileY; tileY <= lastTileY; tileY++) {
            for (let tileX = firstTileX; tileX <= lastTileX; tileX++) {
                for (const star of this.stars) {
                    const rawX = star.x + elapsed * drift.x * star.size;
                    const rawY = star.y + elapsed * drift.y * star.size;
                    const x = tileX * STAGE_WIDTH + ((rawX % STAGE_WIDTH) + STAGE_WIDTH) % STAGE_WIDTH;
                    const y = tileY * STAGE_HEIGHT + ((rawY % STAGE_HEIGHT) + STAGE_HEIGHT) % STAGE_HEIGHT;
                    this.ctx.globalAlpha = RENDER_CONFIG.starfield.baseAlpha +
                        star.size * RENDER_CONFIG.starfield.sizeAlpha;
                    this.ctx.fillRect(x, y, star.size, star.size);
                }
            }
        }
        this.ctx.globalAlpha = 1.0;
        this.ctx.restore();
    }
    
    drawUI() {
        // Draw shot path info (debugging/status display)
        if (this.state === GameState.PLAYING) {
            this.ctx.save();
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'left';
            
            // Show recorded shot paths count
            //this.ctx.fillText(`Shot Paths: ${this.shotPaths.length}`, 10, this.canvas.height - 60);
            
            // Show current recording status
            if (this.isRecordingPath) {
                this.ctx.fillStyle = this.shotColors[this.currentColorIndex];
                //this.ctx.fillText(`Recording Path ${this.shotPaths.length + 1} (${this.currentShotPath.length} points)`, 10, this.canvas.height - 40);
            }
            
            this.ctx.restore();
        }
    }
    
    updateUI() {
        this._hudValues ||= Object.create(null);
        this.updateHudValue('level', this.level);
        this.updateHudValue('score', Utils.formatScore(this.score + this.currentAttemptScore));
        this.updateHudValue('tries', this.tries);

        const simulationTime = this.simulationTime || 0;
        if (
            this.state !== GameState.PLAYING ||
            this.distance === 0 ||
            simulationTime >= (this._nextDistanceHudUpdate || 0)
        ) {
            this.updateHudValue('distance', Math.floor(this.distance));
            this._nextDistanceHudUpdate = simulationTime + 0.1;
        }
    }

    updateHudValue(key, value) {
        const text = String(value);
        if (this._hudValues[key] === text) return;
        this._hudValues[key] = text;
        if (this.ui[key]) this.ui[key].textContent = text;
    }

    invalidateSimulationState() {
        invalidateGameSimulationState(this);
    }
    
    playSound(soundName) {
        // Use audio manager to play sounds
        if (this.audioManager) {
            this.audioManager.playSound(soundName);
        }
    }
    
    showPauseMenu() {
        if (this.pauseMenu && this.uiManager.activeScreens.includes(this.pauseMenu)) return this.pauseMenu;

        const previousState = this.state;
        if (previousState === GameState.PLAYING) this.setState(GameState.PAUSED);

        this.pauseMenu = this.uiManager.showModal({
            title: 'PAUSED',
            message: 'Adjust your settings, return to the main menu, or keep playing.',
            actions: [
                {
                    label: 'SETTINGS',
                    onSelect: () => {
                        this.pauseMenu = null;
                        this.showSettings({ onClose: () => this.showPauseMenu() });
                    }
                },
                {
                    label: 'MAIN MENU',
                    role: 'confirm',
                    onSelect: () => {
                        this.pauseMenu = null;
                        this.setState(GameState.MENU);
                    }
                },
                {
                    label: 'RESUME',
                    role: 'cancel',
                    onSelect: () => {
                        this.pauseMenu = null;
                        if (previousState === GameState.PLAYING || previousState === GameState.PAUSED) {
                            this.setState(GameState.PLAYING);
                        }
                    }
                }
            ],
            defaultAction: 2
        });
        return this.pauseMenu;
    }

    showQuitDialog() {
        return this.showPauseMenu();
    }

    showSettings(options = {}) {
        if (this.settingsScreen && this.uiManager.activeScreens.includes(this.settingsScreen)) {
            return this.settingsScreen;
        }
        this.settingsScreen = this.uiManager.showScreen(SettingsScreen, this.settingsManager, {
            onSettingChange: (definition, value) => this.changeSetting(definition, value),
            onClose: () => {
                this.settingsScreen = null;
                options.onClose?.();
            }
        });
        return this.settingsScreen;
    }

    async changeSetting(definition, value) {
        if (definition.key !== 'stellarModeEnabled') {
            return this.settingsManager.set(definition.key, value);
        }

        if (!value) {
            this.audioManager?.clearStellarTrack();
            await this.stellarTrackStore.clear();
            return this.settingsManager.set(definition.key, false);
        }

        const file = await this.selectStellarMp3();
        const loaded = file && await this.audioManager?.loadStellarTrack(file);
        if (!loaded) {
            this.showMessage('We need a Stellar MP3 to continue.');
            return this.settingsManager.set(definition.key, false);
        }
        if (!await this.stellarTrackStore.save(file)) {
            this.audioManager?.clearStellarTrack();
            this.showMessage('We could not save that Stellar MP3. Please check that browser storage is available.');
            return this.settingsManager.set(definition.key, false);
        }
        return this.settingsManager.set(definition.key, true);
    }

    async restoreStellarMode() {
        if (!this.settingsManager.get('stellarModeEnabled')) return false;
        const file = await this.stellarTrackStore.load();
        const loaded = file && await this.audioManager?.loadStellarTrack(file);
        if (loaded) return true;
        this.settingsManager.set('stellarModeEnabled', false);
        return false;
    }

    selectStellarMp3() {
        return new Promise(resolve => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.mp3,audio/mpeg';
            input.style.display = 'none';
            document.body.appendChild(input);
            let settled = false;
            const finish = file => {
                if (settled) return;
                settled = true;
                input.remove();
                resolve(file || null);
            };
            input.addEventListener('change', () => finish(input.files?.[0]));
            input.addEventListener('cancel', () => finish(null));
            input.click();
        });
    }
    
    showMessage(message) {
        if (this.messageScreen && this.uiManager.activeScreens.includes(this.messageScreen)) {
            return this.messageScreen;
        }
        this.messageScreen = this.uiManager.showModal({
            title: 'MESSAGE',
            message: String(message),
            actions: [{
                label: 'OK',
                role: 'cancel',
                onSelect: () => { this.messageScreen = null; }
            }]
        });
        return this.messageScreen;
    }
    
    startGame() {
        this.level = 1;
        this.score = 0;
        this.currentLevelBestScore = 0;
        this.currentAttemptScore = 0;
        this.distance = 0;
        this.tries = 0;
        this.currentRunScoreSaved = false;
        this.uiManager.closeAllScreens();
        this.loadLevel(this.level);
        this.setState(GameState.PLAYING);
    }
    
    jumpToLevel(targetLevel) {
        // Validate level exists (check if level file is available)
        const { firstLevel } = LEVEL_CATALOG_CONFIG;
        const maximumLevel = this.levelLoader.maximumSelectableLevel;
        if (targetLevel < firstLevel || targetLevel > maximumLevel) {
            plog.error(`Invalid level: ${targetLevel}. Must be ${firstLevel}-${maximumLevel}.`);
            return false;
        }
        
        plog.info(`Jumping to level ${targetLevel}`);
        
        // Set up game state for the target level
        this.level = targetLevel;
        this.score = 0; // Start fresh for testing purposes
        this.currentLevelBestScore = 0;
        this.currentAttemptScore = 0;
        this.distance = 0;
        this.tries = 0;
        this.planetCollisions = 0;
        
        // Close any UI screens
        this.uiManager.closeAllScreens();
        
        // Load the target level
        try {
            this.loadLevel(this.level);
            this.setState(GameState.PLAYING);
            
            // Update URL parameter to reflect current level
            Utils.setURLParameter('level', this.levelLoader.formatLevelSelector(this.level));
            
            plog.success(`Successfully jumped to level ${targetLevel}`);
            return true;
        } catch (error) {
            plog.error(`Failed to load level ${targetLevel}: ${error.message}`);
            
            // Fall back to level 1 if the target level doesn't exist
            this.level = 1;
            this.loadLevel(this.level);
            this.setState(GameState.PLAYING);
            Utils.removeURLParameter('level');
            
            return false;
        }
    }
    
    saveHighScore() {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('spacedPenguinHighScore', this.highScore.toString());
        }
    }
    
    loadHighScore() {
        const saved = typeof localStorage === 'undefined'
            ? 0
            : parseInt(localStorage.getItem('spacedPenguinHighScore'), 10) || 0;
        const leaderboardBest = this.highScoreStore.getAllTime(1)[0]?.score || 0;
        this.highScore = Math.max(saved, leaderboardBest);
    }

    showHighScores(options = {}) {
        return this.uiManager.showScreen(HighScoresScreen, this, options);
    }

    showLevelBrowser(options = {}) {
        return this.uiManager.showScreen(LevelBrowserScreen, this, options);
    }

    openLevelEditor() {
        this.uiManager.closeAllScreens();
        this.level = 'editor-starter';
        this.levelMetadata = { name: 'Untitled Level', description: '' };
        this.loadLevel({
            name: this.levelMetadata.name,
            description: this.levelMetadata.description,
            startPosition: { x: 640, y: 450 },
            targetPosition: { x: 180, y: 170 },
            objects: [
                { type: 'slingshot', position: { x: 640, y: 450 }, properties: { id: 'slingshot', anchorPosition: { x: 595, y: 450 }, launchModel: 'director', maxPullback: 100, minPullback: 10 } },
                { type: 'planet', position: { x: 410, y: 290 }, properties: { id: 'planet-1', name: 'Planet 1', radius: 42, mass: 100, gravitationalReach: 5000, planetType: 'planet_grey' } },
                { type: 'target', position: { x: 180, y: 170 }, properties: { id: 'target', width: 80, height: 58, collisionRadius: 55 } }
            ]
        });
        this.levelEditor.enter();
    }

    async saveEditedLevel() {
        const level = this.levelEditor?.active
            ? this.levelEditor.currentDocumentDefinition()
            : this.exportCurrentLevel();
        const record = await this.levelSaveService.save(level, {
            id: this.levelMetadata?.saveId,
            thumbnail: captureLevelThumbnail(this.canvas)
        });
        this.levelMetadata ||= {};
        Object.assign(this.levelMetadata, {
            name: record.name,
            description: record.description,
            saveId: record.id
        });
        return record;
    }

    async loadCatalogLevel(reference, { edit = false } = {}) {
        const definition = await this.levelCatalogService.getDefinition(reference);
        assertValidLevelDefinition(definition, `catalog level ${reference?.id || reference}`);
        const record = typeof reference === 'string'
            ? { id: reference, source: this.levelCatalogService.defaultSource }
            : reference;
        if (record.source === 'official' && this.levelLoader.activeCollection !== 'shipped') {
            await this.levelLoader.loadCollection('shipped');
        }
        return this.loadSavedLevel({
            ...record,
            level: definition
        }, { edit });
    }

    loadSavedLevel(record, { edit = false } = {}) {
        if (!record?.level) return false;
        // The level browser can be opened from inside the editor. Selecting a
        // playable level must remove the editor overlay and its input context;
        // selecting Edit below will create a fresh editor session afterward.
        if (this.levelEditor?.active) this.levelEditor.exit();
        this.uiManager.closeAllScreens();
        const source = record.source || 'local';
        this.level = source === 'official' ? Number(record.id) : record.id;
        if (source === 'official') this.levelLoader.levels.set(this.level, record.level);
        this.loadLevel(source === 'official' ? this.level : record.level);
        // LevelLoader refreshes runtime metadata while constructing the world;
        // restore the repository identity afterward so editor saves update the
        // selected browser card.
        this.levelMetadata = {
            name: record.name,
            description: record.description,
            saveId: source === 'local' ? record.id : undefined,
            catalogReference: { id: record.id, source }
        };
        this.score = 0;
        if (edit) this.levelEditor.enter();
        else {
            this.setState(GameState.PLAYING);
            if (source === 'official') Utils.setURLParameter('level', String(this.level));
        }
        return true;
    }

    recordHighScore(name, region) {
        if (this.currentRunScoreSaved) return null;
        const entry = this.highScoreStore.add({ name, region, score: this.score });
        this.currentRunScoreSaved = true;
        this.highScore = Math.max(this.highScore, entry.score);
        this.saveHighScore();
        return entry;
    }

    endGame() {
        this.uiManager.closeAllScreens();
        this.setState(GameState.GAME_OVER);
        return this.showHighScores({
            gameEnd: true,
            requiresEntry: !this.currentRunScoreSaved && this.highScoreStore.qualifies(this.score)
        });
    }

    returnToMenu() {
        this.uiManager.closeAllScreens();
        Utils.removeURLParameter('level');
        this.setState(GameState.MENU);
    }

    resetPenguinToSlingshot() {
        if (this.penguin && this.slingshot) {
            const resetPosition = this.slingshot.launchModel === 'director'
                ? this.slingshot.resetPosition
                : this.slingshot.anchor;
            this.penguin.setPosition(resetPosition.x, resetPosition.y);
            this.penguin.setState('idle');
            this.penguin.reset();
            this.slingshot.isPulling = false;
            this.isDragging = false;
            this.mouseDown = false;
        }
        this.invalidateSimulationState();
        plog.waddle(`Penguin reset to position: ${this.penguin.x}, ${this.penguin.y}, state: ${this.penguin.state}`);
    }
    
    resetSlingshotState() {
        if (this.slingshot) {
            this.slingshot.isPulling = false;
        }
        this.isDragging = false;
        this.mouseDown = false;
        
        // Reset penguin to idle state regardless of current state
        if (this.penguin) {
            this.penguin.setState('idle');
            // Also reset penguin physics state
            this.penguin.launched = false;
            this.penguin.vx = 0;
            this.penguin.vy = 0;
        }
    }
    
    // Add tryAgain method (matching original GPS script)
    tryAgain({ recordAction = true } = {}) {
        plog.waddle('tryAgain called - immediately resetting penguin and bonuses');
        if (recordAction) this.recordRunRetry();
        this.resetSimulationSpeedControl();
        this.endRecordingShotPath();
        this.resetPenguinToSlingshot();
        this.resetBonuses(); // Reset bonuses between tries
        
        // Reset current attempt score (don't add bonuses until level is completed)
        this.currentAttemptScore = 0;
        
        // Reset distance (prevents accumulation across retries affecting score)
        this.distance = 0;
        
        // Update mobile UI feedback
        if (this.isMobileDevice()) {
            this.showLaunchFeedback(false);
            this.updateMobileInstructions();
        }
        
        this.updateUI();
    }

    beginRecordedRun(levelDefinition = null) {
        this.runTick = 0;
        this.runTranscriptRecorder = new RunTranscriptRecorder();
        this.completedRun = null;
        this.pendingCommunityScoreSubmission = null;
        const definition = levelDefinition || (this.penguin && this.target && this.slingshot
            ? this.exportCurrentLevel()
            : null);
        this.recordedRunLevel = definition ? structuredClone(definition) : null;
        this.levelEditor?.updatePublishAvailability?.();
        this.invalidateSimulationState();
    }

    invalidateRecordedRun() {
        this.runTranscriptRecorder = null;
        this.completedRun = null;
        this.recordedRunLevel = null;
        this.pendingCommunityScoreSubmission = null;
        this.levelEditor?.updatePublishAvailability?.();
    }

    recordRunLaunch(angle, power) {
        if (!this.runTranscriptRecorder) this.beginRecordedRun();
        try {
            this.runTranscriptRecorder.recordLaunch(this.runTick, angle, power);
        } catch (error) {
            plog.warn('This run cannot be submitted as a deterministic proof:', error.message);
            this.invalidateRecordedRun();
        }
    }

    recordRunRetry() {
        if (!this.runTranscriptRecorder || this.runTranscriptRecorder.actions.length === 0) return;
        try {
            this.runTranscriptRecorder.recordRetry(this.runTick);
        } catch (error) {
            plog.warn('This retry invalidated the deterministic run proof:', error.message);
            this.invalidateRecordedRun();
        }
    }

    completeRecordedRun() {
        if (!this.runTranscriptRecorder || this.runTranscriptRecorder.actions.length === 0) return null;
        try {
            this.completedRun = {
                proof: this.runTranscriptRecorder.freeze(),
                level: structuredClone(this.recordedRunLevel || this.exportCurrentLevel())
            };
            this.levelEditor?.updatePublishAvailability?.();
            return this.completedRun;
        } catch (error) {
            plog.warn('Unable to freeze the completed run proof:', error.message);
            this.invalidateRecordedRun();
            return null;
        }
    }

    isCommunityLevel() {
        return this.levelMetadata?.catalogReference?.source === 'community';
    }

    currentCommunityScore() {
        return calculateCommunityScore({
            distance: this.distance,
            tries: this.tries,
            bonusScore: this.currentAttemptScore,
            multiplier: this.levelRules?.scoreMultiplier ?? 1
        });
    }

    async publishEditedLevel() {
        if (!this.communityLevelClient) throw new Error('No community level server is configured.');
        if (!this.completedRun) throw new Error('Complete this exact level in Play Mode before publishing it.');
        const level = this.levelEditor?.mode === 'play'
            ? structuredClone(this.completedRun.level)
            : this.levelEditor?.currentDocumentDefinition?.() || this.exportCurrentLevel();
        if (JSON.stringify(level) !== JSON.stringify(this.completedRun.level)) {
            this.completedRun = null;
            throw new Error('The level changed after it was completed. Complete it again before publishing.');
        }
        const result = await this.communityLevelClient.publishLevel(level, this.completedRun.proof);
        const published = result.item || result;
        this.levelMetadata.catalogReference = { id: published.id, source: 'community' };
        return published;
    }

    getCommunityScoreInitials() {
        const storage = typeof localStorage === 'undefined' ? null : localStorage;
        return storage?.getItem('spacedPenguinCommunityInitials') || '';
    }

    async offerCommunityScoreUpload(initials) {
        if (!this.communityLevelClient || !this.isCommunityLevel() || !this.completedRun) return null;
        const storage = typeof localStorage === 'undefined' ? null : localStorage;
        const normalizedInitials = String(initials || '').trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(normalizedInitials)) throw new Error('Initials must be exactly three letters.');
        storage?.setItem('spacedPenguinCommunityInitials', normalizedInitials);
        const score = this.currentCommunityScore();
        this.pendingCommunityScoreSubmission = {
            levelId: this.levelMetadata.catalogReference.id,
            initials: normalizedInitials,
            claimedScore: score.score,
            proof: this.completedRun.proof,
            idempotencyKey: createIdempotencyKey()
        };
        return this.submitPendingCommunityScore();
    }

    async submitPendingCommunityScore() {
        const submission = this.pendingCommunityScoreSubmission;
        if (!submission || !this.communityLevelClient) return null;
        const response = await this.communityLevelClient.submitScore(submission.levelId, submission);
        this.pendingCommunityScoreSubmission = null;
        return response;
    }
    
    // Level Editor Methods
    enterLevelEditor() {
        this.levelEditor.enter();
    }
    
    exitLevelEditor() {
        this.levelEditor.exit();
    }
    
    exportCurrentLevel() {
        plog.info('=== STARTING COMPREHENSIVE LEVEL EXPORT ===');
        
        // Prefer slingshot anchor for the canonical start position. If no slingshot,
        // fall back to penguin position, then defaults.
        const exportedSlingshotPosition = this.slingshot?.launchModel === 'director'
            ? this.slingshot.resetPosition
            : this.slingshot?.position;
        const startPosForExport = exportedSlingshotPosition
            ? { ...exportedSlingshotPosition }
            : (this.penguin
                ? { x: this.penguin.x, y: this.penguin.y }
                : { ...WORLD_CONFIG.defaultStartPosition });

        const levelData = {
            name: this.levelMetadata?.name || `Custom Level ${this.level}`,
            description: this.levelMetadata?.description ?? '',
            startPosition: startPosForExport,
            targetPosition: this.target
                ? { x: this.target.position.x, y: this.target.position.y }
                : { ...WORLD_CONFIG.defaultTargetPosition },
            bounds: {
                stage: { ...this.stageRect },
                flight: { ...this.flightRect }
            },
            ...(this.cameraConfig ? { camera: { ...this.cameraConfig } } : {}),
            objects: [],
            rules: this.levelRules ? this.exportLevelRules() : {
                maxTries: null,
                timeLimit: null,
                scoreMultiplier: LEVEL_DEFAULTS.rules.scoreMultiplier
            }
        };
        
        // GREEDY EXPORT: Get ALL objects from ALL arrays
        const allObjects = this.getAllObjectsForExport();
        
        plog.info(`Found ${allObjects.length} total objects to export`);
        
        // Export each object with ALL its properties
        for (const obj of allObjects) {
            const exportedObj = this.exportObjectComprehensively(obj);
            if (exportedObj) {
                levelData.objects.push(exportedObj);
            }
        }
        
        plog.success(`Export complete: ${levelData.objects.length} objects exported`);
        plog.debug('Level data structure:', levelData);
        return levelData;
    }
    
    getAllObjectsForExport() {
        const allObjects = new Set(); // Use Set to avoid duplicates
        
        // Add from gameObjects array
        this.gameObjects.forEach(obj => {
            if (this.shouldExportObject(obj)) {
                allObjects.add(obj);
            }
        });
        
        // Add from specific arrays (in case something's missing from gameObjects)
        this.planets.forEach(obj => allObjects.add(obj));
        this.bonuses.forEach(obj => allObjects.add(obj));
        this.portals.forEach(obj => allObjects.add(obj));
        this.textObjects.forEach(obj => allObjects.add(obj));
        this.pointingArrows.forEach(obj => allObjects.add(obj));
        
        // Add penguin if it exists
        if (this.penguin && this.shouldExportObject(this.penguin)) {
            allObjects.add(this.penguin);
        }
        
        plog.debug('Objects found in arrays:');
        plog.debug('- gameObjects:', this.gameObjects.length);
        plog.debug('- planets:', this.planets.length);
        plog.debug('- bonuses:', this.bonuses.length);
        plog.debug('- textObjects:', this.textObjects.length);
        plog.debug('- pointingArrows:', this.pointingArrows.length);
        plog.debug('- penguin:', this.penguin ? 1 : 0);
        
        return Array.from(allObjects);
    }
    
    shouldExportObject(obj) {
        return isRuntimeObjectExportable(obj);
    }
    
    exportObjectComprehensively(obj) {
        const exported = serializeRuntimeObject(obj, {
            serializeOrbit: orbit => this.exportOrbitSystem(orbit),
            serializeWaypointPath: path => this.exportWaypointPath(path)
        });
        if (!exported) plog.warn('Skipping runtime object without an exportable game-object descriptor:', obj);
        return exported;
    }
    
    exportOrbitSystem(orbitSystem) {
        const exportData = {
            orbitCenter: orbitSystem.orbitCenter ? { 
                x: orbitSystem.orbitCenter.x, 
                y: orbitSystem.orbitCenter.y 
            } : null,
            orbitTargetId: orbitSystem.orbitTargetId || null,
            orbitRadius: orbitSystem.orbitRadius,
            orbitSpeed: orbitSystem.orbitSpeed,
            orbitAngle: orbitSystem.orbitAngle,
            orbitType: orbitSystem.orbitType,
            orbitParams: orbitSystem.orbitParams || {}
        };
        
        // Add gravity-specific properties if it's a gravity orbit
        if (orbitSystem.orbitType === LevelOrbitType.GRAVITY) {
            exportData.orbitParams = {
                ...exportData.orbitParams,
                gravityStrength: orbitSystem.gravityStrength ?? PHYSICS_CONFIG.orbit.gravityStrength,
                initialVelocity: orbitSystem.velocity ? { 
                    x: orbitSystem.velocity.x, 
                    y: orbitSystem.velocity.y 
                } : { ...PHYSICS_CONFIG.orbit.initialVelocity }
            };
        }
        
        return exportData;
    }

    exportWaypointPath(waypointSystem) {
        return {
            waypoints: waypointSystem.waypoints.map(point => ({ x: point.x, y: point.y })),
            speed: waypointSystem.speed,
            mode: waypointSystem.mode,
            phase: waypointSystem.phase
        };
    }
    
    exportLevelRules() {
        return {
            maxTries: this.levelRules.maxTries,
            timeLimit: this.levelRules.timeLimit,
            scoreMultiplier: this.levelRules.scoreMultiplier,
            requiredBonuses: this.levelRules.requiredBonuses,
            allowedMisses: this.levelRules.allowedMisses,
            gravitationalConstant: this.levelRules.gravitationalConstant
        };
    }


    
    createAlphaMaskAtLaunchPosition(position = this.penguin) {
        if (!position) return;
        
        // Get current trace color (matching original game's pTraceColor)
        const traceColor = this.shotColors[this.currentColorIndex];
        
        // Create alpha mask object (matching original game's k1, k2, k3 sprites)
        const alphaMask = {
            x: position.x,
            y: position.y,
            color: traceColor,
            alpha: 0.6, // Semi-transparent like original
            renderCanvas: this.getColoredAlphaMaskCanvas(traceColor)
        };
        
        // Shift existing masks (matching original game's setUpSnapping logic)
        // k3 gets k2's position, k2 gets k1's position, k1 gets current position
        if (this.alphaMasks.length >= RENDER_CONFIG.shotTrails.alphaMaskHistory) {
            this.alphaMasks[2] = this.alphaMasks[1]; // k3 = k2
            this.alphaMasks[1] = this.alphaMasks[0]; // k2 = k1
            this.alphaMasks[0] = alphaMask; // k1 = new position
        } else {
            this.alphaMasks.unshift(alphaMask);
        }
        

    }
    
    clearAlphaMasks() {
        this.alphaMasks = [];
        plog.debug('Cleared all alpha masks');
    }
    
    loadAlphaMask() {
        const cachedAlphaMask = this.assetLoader?.getUI('alpha_mask');
        if (cachedAlphaMask) {
            this.alphaMaskImage = cachedAlphaMask;
            try {
                this.prepareAlphaMaskStencil();
            } catch (error) {
                plog.error('Failed to prepare cached alpha mask image:', error);
            }
            return;
        }

        // Load the alpha mask image directly
        this.alphaMaskImage = new Image();
        this.alphaMaskImage.onload = () => {
            try {
                this.prepareAlphaMaskStencil();
                for (const mask of this.alphaMasks) {
                    mask.renderCanvas = this.getColoredAlphaMaskCanvas(mask.color);
                }
                plog.success('Alpha mask image loaded and cached successfully');
            } catch (error) {
                plog.error('Failed to prepare alpha mask image:', error);
            }
        };
        this.alphaMaskImage.onerror = () => {
            plog.error('Failed to load alpha mask image');
        };
        this.alphaMaskImage.src = assetPath('ui/alpha_mask.png');
    }

    prepareAlphaMaskStencil() {
        const width = this.alphaMaskImage.naturalWidth || this.alphaMaskImage.width;
        const height = this.alphaMaskImage.naturalHeight || this.alphaMaskImage.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(this.alphaMaskImage, 0, 0);

        const imageData = context.getImageData(0, 0, width, height);
        const pixels = imageData.data;
        for (let index = 0; index < pixels.length; index += 4) {
            const gray = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
            pixels[index] = 255;
            pixels[index + 1] = 255;
            pixels[index + 2] = 255;
            pixels[index + 3] = 255 - gray;
        }
        context.putImageData(imageData, 0, 0);

        this.alphaMaskStencil = canvas;
        this.coloredAlphaMaskCanvases.clear();
    }

    getColoredAlphaMaskCanvas(color) {
        if (!this.alphaMaskStencil) return null;
        const cached = this.coloredAlphaMaskCanvases.get(color);
        if (cached) return cached;

        const canvas = document.createElement('canvas');
        canvas.width = this.alphaMaskStencil.width;
        canvas.height = this.alphaMaskStencil.height;
        const context = canvas.getContext('2d');
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(this.alphaMaskStencil, 0, 0);
        this.coloredAlphaMaskCanvases.set(color, canvas);
        return canvas;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Game;
} 

export { Game, GameState };
