// Main game engine for Spaced Penguin
// Based on the original game loop and GPS scripts

import { Planet, Bonus, BonusPopup, Target, Slingshot, Arrow, TextObject, PointingArrow, Portal, SpeedBooster, DeflectorBumper, OneWayForceField } from './runtime/entities/gameObjects.js';
import { BlackHole } from './runtime/entities/blackHole.js';
import { RepulsorStar } from './runtime/entities/repulsorStar.js';
import Utils from './platform/utils.js';
import { LevelLoader } from './levels/levelLoader.js';
import { UIManager } from './ui/uiManager.js';
import { LevelEndScreen } from './ui/views/levelEndScreen.js';
import Console from './diagnostics/console.js';
import LevelEditor from './editor/levelEditor.js';
import FullscreenManager from './platform/browser/fullscreenManager.js';
import plog from './diagnostics/penguinLogger.js';
import {
    captureGameSimulationState,
    applyGameSimulationEvents,
    invalidateGameSimulationState,
    stepGameSimulation
} from './runtime/gameSimulationAdapter.js';
import { calculateLaunchPosition, calculateLaunchVelocity, calculateLevelScore } from './simulation/simulationEngine.js';
import { predictAimAssistTrajectory } from './simulation/aimAssist.js';
import {
    LEVEL_CATALOG_CONFIG,
    WORLD_CONFIG
} from './config/gameConfig.js';
import { RENDER_CONFIG } from './config/renderConfig.js';
import { AudioCue, getAudioCue } from './config/audioConfig.js';
import { RUNTIME_CONFIG } from './config/runtimeConfig.js';
import { GameSettingsController } from './platform/settings/gameSettingsController.js';
import { SettingsScreen } from './ui/views/settingsScreen.js';
import { HighScoreStore } from './platform/persistence/highScoreStore.js';
import { HighScoresScreen } from './ui/views/highScoresScreen.js';
import { LevelBrowserScreen } from './ui/views/levelBrowserScreen.js';
import { LevelSaveService, captureLevelThumbnail } from './platform/persistence/levelSaveService.js';
import { createConfiguredLevelCatalog } from './catalog/levelCatalogComposition.js';
import { readAppConfig } from './config/appConfig.js';
import { CommunityLevelClient } from './catalog/communityLevelClient.js';
import { CommunityRunCoordinator } from './replay/communityRunCoordinator.js';
import { assertValidLevelDefinition } from './levels/levelValidation.js';
import { registerButton } from './ui/buttonFramework.js';
import { getRuntimeGameConfigValue } from './config/runtimeGameConfig.js';
import {
    STAGE_WIDTH,
    STAGE_HEIGHT,
    createWorldCamera,
    createViewport,
    panWorldCamera,
    updateFollowCamera
} from './rendering/viewport.js';
import { GameState } from './runtime/gameState.js';
import { PenguinState } from './runtime/penguinState.js';
import { GameSession } from './runtime/gameSession.js';
import { RuntimeWorld } from './runtime/runtimeWorld.js';
import { GameEffectsCoordinator } from './runtime/gameEffectsCoordinator.js';
import { GameplayController } from './input/gameplayController.js';
import { KevinCamRenderer } from './rendering/kevinCamRenderer.js';
import { GameRenderer } from './rendering/gameRenderer.js';
import { FlightPresentation } from './rendering/flightPresentation.js';
import {
    RuntimeLevelSerializer,
    serializeLevelRules,
    serializeOrbitSystem,
    serializeWaypointPath
} from './levels/runtimeLevelSerializer.js';

const FAST_FORWARD_UNLOCK_SECONDS = 5;

export class Game {
    sessionState() { return this.session ||= new GameSession(); }
    runtimeWorld() {
        return this.world ||= new RuntimeWorld({
            onSimulationInvalidated: () => invalidateGameSimulationState(this)
        });
    }
    communityRunCoordinator() {
        return this.communityRun ||= new CommunityRunCoordinator(this, this.communityLevelClient);
    }

    get state() { return this.sessionState().state; }
    set state(value) { this.sessionState().state = value; }
    get level() { return this.sessionState().level; }
    set level(value) { this.sessionState().level = value; }
    get score() { return this.sessionState().score; }
    set score(value) { this.sessionState().score = value; }
    get currentLevelBestScore() { return this.sessionState().currentLevelBestScore; }
    set currentLevelBestScore(value) { this.sessionState().currentLevelBestScore = value; }
    get currentAttemptScore() { return this.sessionState().currentAttemptScore; }
    set currentAttemptScore(value) { this.sessionState().currentAttemptScore = value; }
    get distance() { return this.sessionState().distance; }
    set distance(value) { this.sessionState().distance = value; }
    get tries() { return this.sessionState().tries; }
    set tries(value) { this.sessionState().tries = value; }
    get highScore() { return this.sessionState().highScore; }
    set highScore(value) { this.sessionState().highScore = value; }
    get planetCollisions() { return this.sessionState().planetCollisions; }
    set planetCollisions(value) { this.sessionState().planetCollisions = value; }
    get levelRules() { return this.sessionState().levelRules; }
    set levelRules(value) { this.sessionState().levelRules = value; }
    get levelMetadata() { return this.sessionState().levelMetadata; }
    set levelMetadata(value) { this.sessionState().levelMetadata = value; }
    get currentRunScoreSaved() { return this.sessionState().currentRunScoreSaved; }
    set currentRunScoreSaved(value) { this.sessionState().currentRunScoreSaved = value; }
    get lastScoreImprovement() { return this.sessionState().lastScoreImprovement; }
    set lastScoreImprovement(value) { this.sessionState().lastScoreImprovement = value; }

    get physics() { return this.runtimeWorld().physics; }
    get stageRect() { return this.runtimeWorld().stageRect; }
    set stageRect(value) { this.runtimeWorld().stageRect = value; this.runtimeWorld().touch(); }
    get flightRect() { return this.runtimeWorld().flightRect; }
    set flightRect(value) { this.runtimeWorld().flightRect = value; this.runtimeWorld().touch(); }
    get cameraConfig() { return this.runtimeWorld().cameraConfig; }
    set cameraConfig(value) { this.runtimeWorld().cameraConfig = value; }
    get gameObjects() { return this.runtimeWorld().gameObjects; }
    set gameObjects(value) { this.runtimeWorld().gameObjects = value; this.runtimeWorld().touch(); }
    get planets() { return this.runtimeWorld().planets; }
    set planets(value) { this.runtimeWorld().planets = value; this.runtimeWorld().touch(); }
    get bonuses() { return this.runtimeWorld().bonuses; }
    set bonuses(value) { this.runtimeWorld().bonuses = value; this.runtimeWorld().touch(); }
    get portals() { return this.runtimeWorld().portals; }
    set portals(value) { this.runtimeWorld().portals = value; this.runtimeWorld().touch(); }
    get speedBoosters() { return this.runtimeWorld().speedBoosters; }
    set speedBoosters(value) { this.runtimeWorld().speedBoosters = value; this.runtimeWorld().touch(); }
    get deflectorBumpers() { return this.runtimeWorld().deflectorBumpers; }
    set deflectorBumpers(value) { this.runtimeWorld().deflectorBumpers = value; this.runtimeWorld().touch(); }
    get forceFields() { return this.runtimeWorld().forceFields; }
    set forceFields(value) { this.runtimeWorld().forceFields = value; this.runtimeWorld().touch(); }
    get textObjects() { return this.runtimeWorld().textObjects; }
    set textObjects(value) { this.runtimeWorld().textObjects = value; this.runtimeWorld().touch(); }
    get pointingArrows() { return this.runtimeWorld().pointingArrows; }
    set pointingArrows(value) { this.runtimeWorld().pointingArrows = value; this.runtimeWorld().touch(); }
    get penguin() { return this.runtimeWorld().penguin; }
    set penguin(value) { this.runtimeWorld().penguin = value; this.runtimeWorld().touch(); }
    get slingshot() { return this.runtimeWorld().slingshot; }
    set slingshot(value) { this.runtimeWorld().slingshot = value; this.runtimeWorld().touch(); }
    get target() { return this.runtimeWorld().target; }
    set target(value) { this.runtimeWorld().target = value; this.runtimeWorld().touch(); }
    get arrow() { return this.runtimeWorld().arrow; }
    set arrow(value) { this.runtimeWorld().arrow = value; this.runtimeWorld().touch({ simulation: false }); }
    get bonusPopup() { return this.runtimeWorld().bonusPopup; }
    set bonusPopup(value) { this.runtimeWorld().bonusPopup = value; this.runtimeWorld().touch({ simulation: false }); }

    get runTick() { return this.communityRunCoordinator().runTick; }
    set runTick(value) { this.communityRunCoordinator().runTick = value; }
    get runTranscriptRecorder() { return this.communityRunCoordinator().recorder; }
    set runTranscriptRecorder(value) { this.communityRunCoordinator().recorder = value; }
    get completedRun() { return this.communityRunCoordinator().completedRun; }
    set completedRun(value) { this.communityRunCoordinator().completedRun = value; }
    get recordedRunLevel() { return this.communityRunCoordinator().recordedLevel; }
    set recordedRunLevel(value) { this.communityRunCoordinator().recordedLevel = value; }
    get pendingCommunityScoreSubmission() { return this.communityRunCoordinator().pendingScoreSubmission; }
    set pendingCommunityScoreSubmission(value) { this.communityRunCoordinator().pendingScoreSubmission = value; }
    get shotPaths() { return this.flightPresentation?.shotPaths || []; }
    set shotPaths(value) { if (this.flightPresentation) this.flightPresentation.shotPaths = value; }
    get currentShotPath() { return this.flightPresentation?.currentShotPath || []; }
    set currentShotPath(value) { if (this.flightPresentation) this.flightPresentation.currentShotPath = value; }
    get currentShotRenderPath() { return this.flightPresentation?.currentShotRenderPath || null; }
    set currentShotRenderPath(value) { if (this.flightPresentation) this.flightPresentation.currentShotRenderPath = value; }
    get portalTransition() { return this.flightPresentation?.portalTransition || null; }
    set portalTransition(value) { if (this.flightPresentation) this.flightPresentation.portalTransition = value; }
    get shotColors() { return this.flightPresentation?.shotColors || RENDER_CONFIG.shotTrails.colors; }
    set shotColors(value) { if (this.flightPresentation) this.flightPresentation.shotColors = value; }
    get currentColorIndex() { return this.flightPresentation?.currentColorIndex || 0; }
    set currentColorIndex(value) { if (this.flightPresentation) this.flightPresentation.currentColorIndex = value; }
    get isRecordingPath() { return this.flightPresentation?.isRecordingPath || false; }
    set isRecordingPath(value) { if (this.flightPresentation) this.flightPresentation.isRecordingPath = value; }
    get alphaMasks() { return this.flightPresentation?.alphaMasks || []; }
    set alphaMasks(value) { if (this.flightPresentation) this.flightPresentation.alphaMasks = value; }
    get stars() { return this.flightPresentation?.stars || []; }
    set stars(value) { if (this.flightPresentation) this.flightPresentation.stars = value; }
    get starfieldTime() { return this.flightPresentation?.starfieldTime || 0; }
    set starfieldTime(value) { if (this.flightPresentation) this.flightPresentation.starfieldTime = value; }
    get starDriftSpeed() { return this.flightPresentation?.starDriftSpeed || RENDER_CONFIG.starfield.drift; }
    set starDriftSpeed(value) { if (this.flightPresentation) this.flightPresentation.starDriftSpeed = value; }
    get mouseDown() { return this.gameplayController?.mouseDown ?? false; }
    set mouseDown(value) { if (this.gameplayController) this.gameplayController.mouseDown = value; }
    get mousePosition() { return this.gameplayController?.mousePosition || { x: 0, y: 0 }; }
    set mousePosition(value) { if (this.gameplayController) this.gameplayController.mousePosition = value; }
    get isDragging() { return this.gameplayController?.isDragging ?? false; }
    set isDragging(value) { if (this.gameplayController) this.gameplayController.isDragging = value; }

    constructor(canvas, assetLoader, audioManager, options = {}) {
        plog.info('Game constructor called');
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.onStateChanged = options.onStateChanged;
        this.session = options.session || new GameSession();
        this._runtimeSimulationState = null;
        this.world = options.world || new RuntimeWorld({
            onSimulationInvalidated: () => invalidateGameSimulationState(this)
        });
        this.effects = options.effects || new GameEffectsCoordinator(this);
        this.gameplayController = options.gameplayController || new GameplayController(this);
        this.assetLoader = assetLoader;
        this.audioManager = audioManager;
        this.flightPresentation = options.flightPresentation || new FlightPresentation(this);
        this.settingsController = options.settingsController || new GameSettingsController({
            audioManager,
            onAimAssistDisabled: () => { this.aimAssistPoints = []; },
            showMessage: message => this.showMessage(message)
        });
        this.settingsManager = this.settingsController.manager;
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
        this.updateBackgroundMusicDimming();
        this.highScoreStore = new HighScoreStore(
            typeof localStorage === 'undefined' ? null : localStorage
        );
        this.levelLoader = new LevelLoader(assetLoader);
        this.runtimeLevelSerializer = options.runtimeLevelSerializer || new RuntimeLevelSerializer();
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
        this.communityRun = options.communityRun || new CommunityRunCoordinator(this, this.communityLevelClient);
        
        // Bounds system (matching original game's pFlightRect/pStageRect)
        this.viewport = canvas.viewport || createViewport(STAGE_WIDTH, STAGE_HEIGHT, 1);
        this.worldCamera = createWorldCamera(this.stageRect);
        this.viewRect = this.worldCamera.viewRect;
        this.kevinCamRenderer = options.kevinCamRenderer || new KevinCamRenderer();
        this.renderer = options.renderer || new GameRenderer(this);
        
        // Game objects
        this.crashedPenguins = [];
        this.launches = [];
        
        // Bonus popup system
        this.bonusPopup = new BonusPopup(0, 0, 0);
        this.world.addGameObject(this.bonusPopup);
        
        // Initialize arrow after stage rect is set up
        this.arrow = new Arrow(0, 0);
        this.arrow.setStageRect(this.viewRect);
        this.arrow.setFlightRect(this.flightRect);
        this.world.addGameObject(this.arrow);

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
            RepulsorStar,
            Bonus,
            BonusPopup,
            Target,
            Arrow,
            Slingshot,
            TextObject,
            PointingArrow,
            Portal,
            SpeedBooster,
            DeflectorBumper,
            OneWayForceField
        };
        
        this.aimAssistPoints = [];
        
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
        // Don't load a level immediately; bootstrap owns the start transition.
    }
    
    setState(newState) {
        const transition = this.sessionState().setState(newState);
        if (transition.changed) {
            plog.info(`Game state changing from ${transition.previousState} to ${newState}`);
            this.updateBackgroundMusicDimming();

            if (this.pauseMenuButton) {
                this.pauseMenuButton.style.display = newState === GameState.PLAYING ? 'block' : 'none';
            }

            if (newState === GameState.MENU || newState === GameState.GAME_OVER || newState === GameState.SCORING) {
                this.resetSimulationSpeedControl();
            }

            if (newState === GameState.PLAYING) this.gameplayController.setupMobileControls();
            else this.gameplayController.clearMobileControls();

            this.onStateChanged?.(newState);
            
            // Input contexts inspect live state when each event is dispatched,
            // so state transitions do not require listener reconciliation.
        }
    }
    
    // Input handling methods - called by input contexts
    // These methods are kept for backwards compatibility but input routing
    // is now handled by the InputManager context system
    
    setupMobileControls() { this.gameplayController.setupMobileControls(); }
    isMobileDevice() { return this.gameplayController.isMobileDevice(); }
    createMobileControlButtons() { return this.gameplayController.createMobileControlButtons(); }
    createLaunchFeedback() { return this.gameplayController.createLaunchFeedback(); }
    updateMobileInstructions() { return this.gameplayController.updateMobileInstructions(); }
    showLaunchFeedback(show = true) { return this.gameplayController.showLaunchFeedback(show); }
    getMousePosition(event) { return this.gameplayController.getMousePosition(event); }
    setCanvasScale(scaleX, scaleY) {
        this.canvasScaleX = scaleX;
        this.canvasScaleY = scaleY;
    }

    setViewport(viewport) {
        this.viewport = viewport;
        this.canvasScaleX = viewport.scale;
        this.canvasScaleY = viewport.scale;
        this.resetWorldCamera();
    }

    usesPortraitGameplayCamera() {
        return Boolean(
            this.viewport?.cssHeight > this.viewport?.cssWidth &&
            this.isMobileDevice()
        );
    }

    getResponsiveCameraConfig() {
        if (!this.usesPortraitGameplayCamera()) return this.cameraConfig;
        const authoredConfig = this.cameraConfig || {};
        return {
            ...authoredConfig,
            mode: 'follow',
            zoom: Math.max(authoredConfig.zoom ?? 1, RENDER_CONFIG.camera.portraitZoom)
        };
    }

    getActiveCamera() {
        return this.levelEditor?.active && this.levelEditor.mode === 'edit' && this.levelEditor.editorCamera
            ? this.levelEditor.editorCamera
            : this.worldCamera;
    }

    resetWorldCamera() {
        const focus = this.penguin?.state === PenguinState.SOARING
            ? { x: this.penguin.x, y: this.penguin.y }
            : this.slingshot?.position || (this.penguin
                ? { x: this.penguin.x, y: this.penguin.y }
                : null);
        this.worldCamera = createWorldCamera(this.stageRect, this.getResponsiveCameraConfig(), focus);
        this.viewRect = this.worldCamera.viewRect;
        this.arrow?.setStageRect(this.viewRect);
    }

    updateWorldCamera(deltaTime) {
        if (this.worldCamera?.mode !== 'follow' || !this.penguin || this.gameplayController?.lookAroundMode) return;
        this.worldCamera = updateFollowCamera(this.worldCamera, {
            x: this.penguin.x,
            y: this.penguin.y,
            velocity: this.penguin.velocity
        }, deltaTime, {
            ...RENDER_CONFIG.camera,
            deadZoneRatio: this.usesPortraitGameplayCamera()
                ? RENDER_CONFIG.camera.portraitDeadZoneRatio
                : RENDER_CONFIG.camera.deadZoneRatio
        });
        if (!(this.levelEditor?.active && this.levelEditor.mode === 'edit')) {
            this.viewRect = this.worldCamera.viewRect;
            this.arrow?.setStageRect(this.viewRect);
        }
    }

    panPortraitCameraByClientDelta(deltaClientX, deltaClientY) {
        if (!this.usesPortraitGameplayCamera() || this.worldCamera?.mode !== 'follow') return;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const worldDeltaX = -deltaClientX *
            (this.viewport.backingWidth / rect.width) /
            (this.viewport.scale * this.worldCamera.scale);
        const worldDeltaY = -deltaClientY *
            (this.viewport.backingHeight / rect.height) /
            (this.viewport.scale * this.worldCamera.scale);
        this.worldCamera = panWorldCamera(this.worldCamera, worldDeltaX, worldDeltaY);
        this.viewRect = this.worldCamera.viewRect;
        this.arrow?.setStageRect(this.viewRect);
    }

    beginFrame() {
        this.renderer.beginFrame();
    }
    
    handleMouseDown(event) { return this.gameplayController.handleMouseDown(event); }
    handleMouseMove(event) { return this.gameplayController.handleMouseMove(event); }
    handleMouseUp(event) { return this.gameplayController.handleMouseUp(event); }
    handleTouchStart(event) { return this.gameplayController.handleTouchStart(event); }
    handleTouchMove(event) { return this.gameplayController.handleTouchMove(event); }
    handleTouchEnd(event) { return this.gameplayController.handleTouchEnd(event); }
    handleKeyDown(event) { return this.gameplayController.handleKeyDown(event); }
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
        this.penguin.setState(PenguinState.SOARING);
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
    startRecordingShotPath() { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).startPath(); }
    recordPathPoint(x, y) { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).recordPoint(x, y); }
    recordPortalTransit(entryPosition, exitPosition) { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).recordPortalTransit(entryPosition, exitPosition); }
    endRecordingShotPath() { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).endPath(); }
    clearAllShotPaths() { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).clearPaths(); }
    drawAllShotPaths(ctx) { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).drawPaths(ctx); }
    drawAlphaMasks(ctx) { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).drawAlphaMasks(ctx); }
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
        if (this.penguin?.state === PenguinState.CRASHED) {
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
                if (this.penguin && this.penguin.position && this.penguin.state === PenguinState.SOARING) {
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
            if (this.penguin?.state !== PenguinState.SOARING || this.soaringElapsedTime < FAST_FORWARD_UNLOCK_SECONDS) return;
            this.simulationSpeed = this.simulationSpeed === 2 ? 1 : 2;
            this.updateSimulationSpeedButton();
        });
        this.updateSimulationSpeedButton();
    }

    updateSimulationSpeedControl(deltaTime) {
        if (this.penguin?.state !== PenguinState.SOARING) {
            this.resetSimulationSpeedControl();
            return;
        }
        this.soaringElapsedTime += deltaTime;
        this.updateSimulationSpeedButton();
    }

    updateSimulationSpeedButton() {
        if (!this.simulationSpeedButton) return;
        const visible = this.penguin?.state === PenguinState.SOARING &&
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
        this.sessionState().applyLevelScore(result);
        
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
        this.sessionState().advanceLevel();
        
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

        // Reset presentation state. LevelLoader commits the validated runtime
        // world atomically through RuntimeWorld.membership.
        this.portalTransition = null;
        this.crashedPenguins = [];
        this.planetCollisions = 0;
        this.tries = 0;
        this.launches = [];
        this.distance = 0;
        this.currentAttemptScore = 0; // Reset attempt score for new level
        
        // Clear all shot path traces for new level
        this.clearAllShotPaths();
        this.clearAlphaMasks();
        
        // Load level through level loader first
        const result = this.levelLoader.loadLevel(level, this);
        
        // Add arrow AFTER level loader has finished (so it doesn't get cleared)
        this.arrow = new Arrow(0, 0);
        this.arrow.setStageRect(this.viewRect);
        this.arrow.setFlightRect(this.flightRect);
        this.world.addGameObject(this.arrow);
        
        // Re-add bonus popup system
        this.bonusPopup = new BonusPopup(0, 0, 0);
        this.world.addGameObject(this.bonusPopup);
        
        this.loadedLevelDefinition = structuredClone(result);
        this.beginRecordedRun(this.loadedLevelDefinition);
        
        return result;
    }
    
    // Helper methods for game object management
    addGameObject(obj) {
        return this.runtimeWorld().addGameObject(obj);
    }
    
    removeGameObject(obj) {
        return this.runtimeWorld().removeGameObject(obj);
    }
    
    render() {
        this.renderer.render();
    }

    drawPlayfieldTraces() { return (this.renderer ||= new GameRenderer(this)).drawPlayfieldTraces(); }

    updateAimAssistPreview() {
        if (!this.settingsManager.get('aimAssistEnabled') ||
            this.penguin?.state !== PenguinState.PULLBACK || !this.slingshot?.isPulling) {
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

    drawAimAssist(ctx) { return (this.renderer ||= new GameRenderer(this)).drawAimAssist(ctx); }

    drawPenguinInPlayfield() { return (this.renderer ||= new GameRenderer(this)).drawPenguinInPlayfield(); }

    beginPortalTransition(event) { return this.flightPresentation.beginPortalTransition(event); }
    drawPortalTransition(ctx) { return this.flightPresentation.drawPortalTransition(ctx); }
    generateStars() { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).generateStars(); }
    drawStars() { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).drawStars(); }
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
        return this.settingsController.change(definition, value);
    }

    async restoreStellarMode() {
        return this.settingsController.restore();
    }

    selectStellarMp3() {
        return this.settingsController.selectStellarMp3();
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
        this.sessionState().startCampaign();
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
        this.sessionState().beginLevel(targetLevel);
        this.score = 0; // Start fresh for testing purposes
        
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
            this.penguin.setState(PenguinState.IDLE);
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
            this.penguin.setState(PenguinState.IDLE);
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
        this.sessionState().resetAttemptCounters();
        
        // Update mobile UI feedback
        if (this.isMobileDevice()) {
            this.showLaunchFeedback(false);
            this.updateMobileInstructions();
        }
        
        this.updateUI();
    }

    beginRecordedRun(levelDefinition = null) {
        return this.communityRunCoordinator().begin(levelDefinition);
    }

    invalidateRecordedRun() {
        return this.communityRunCoordinator().invalidate();
    }

    recordRunLaunch(angle, power) {
        try {
            this.communityRunCoordinator().recordLaunch(angle, power);
        } catch (error) {
            plog.warn('This run cannot be submitted as a deterministic proof:', error.message);
            this.invalidateRecordedRun();
        }
    }

    recordRunRetry() {
        try {
            this.communityRunCoordinator().recordRetry();
        } catch (error) {
            plog.warn('This retry invalidated the deterministic run proof:', error.message);
            this.invalidateRecordedRun();
        }
    }

    completeRecordedRun() {
        try {
            return this.communityRunCoordinator().complete();
        } catch (error) {
            plog.warn('Unable to freeze the completed run proof:', error.message);
            this.invalidateRecordedRun();
            return null;
        }
    }

    isCommunityLevel() {
        return this.communityRunCoordinator().isCommunityLevel();
    }

    currentCommunityScore() {
        return this.communityRunCoordinator().currentScore();
    }

    async publishEditedLevel() {
        return this.communityRunCoordinator().publishEditedLevel();
    }

    getCommunityScoreInitials() {
        return this.communityRunCoordinator().getInitials();
    }

    async offerCommunityScoreUpload(initials) {
        return this.communityRunCoordinator().offerScoreUpload(initials);
    }

    async submitPendingCommunityScore() {
        return this.communityRunCoordinator().submitPendingScore();
    }
    
    // Level Editor Methods
    enterLevelEditor() {
        this.levelEditor.enter();
    }
    
    exitLevelEditor() {
        this.levelEditor.exit();
    }
    
    exportCurrentLevel() {
        this.runtimeLevelSerializer ||= new RuntimeLevelSerializer();
        return this.runtimeLevelSerializer.serialize({
            world: this.runtimeWorld(),
            session: this.sessionState()
        });
    }
    
    getAllObjectsForExport() {
        return this.runtimeWorld().membership.list().filter(object => this.shouldExportObject(object));
    }
    
    shouldExportObject(obj) {
        return Boolean(this.runtimeLevelSerializer.serializeObject(obj));
    }
    
    exportObjectComprehensively(obj) {
        return this.runtimeLevelSerializer?.serializeObject(obj) || new RuntimeLevelSerializer().serializeObject(obj);
    }
    
    exportOrbitSystem(orbitSystem) {
        return serializeOrbitSystem(orbitSystem);
    }

    exportWaypointPath(waypointSystem) {
        return serializeWaypointPath(waypointSystem);
    }
    
    exportLevelRules() {
        return serializeLevelRules(this.levelRules);
    }


    
    createAlphaMaskAtLaunchPosition(position = this.penguin) { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).createAlphaMask(position); }
    clearAlphaMasks() { return (this.flightPresentation ||= new FlightPresentation(this, { initializeAssets: false })).clearAlphaMasks(); }
    loadAlphaMask() { return (this.flightPresentation ||= new FlightPresentation(this)).loadAlphaMask(); }
    prepareAlphaMaskStencil() { return this.flightPresentation.prepareAlphaMaskStencil(); }
    getColoredAlphaMaskCanvas(color) { return this.flightPresentation.getColoredAlphaMaskCanvas(color); }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Game;
} 

export { GameState };
