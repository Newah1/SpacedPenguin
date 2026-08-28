import { Game } from './game.js';
import { GameState } from './runtime/gameState.js';
import { AssetLoader } from './platform/assets/assetLoader.js';
import { InputManager } from './input/inputManager.js';
import { registerDefaultInputContexts } from './input/registerDefaultInputContexts.js';
import plog from './diagnostics/penguinLogger.js';
import Utils from './platform/utils.js';
import PerformanceUtils from './diagnostics/performanceUtils.js';
import { STAGE_HEIGHT, STAGE_WIDTH, createViewport } from './rendering/viewport.js';
import { LEVEL_CATALOG_CONFIG, SIMULATION_CONFIG, parseLevelSelector } from './config/gameConfig.js';
import { RUNTIME_CONFIG } from './config/runtimeConfig.js';
import { BootstrapLoadingView } from './ui/views/bootstrapLoadingView.js';
import { MainMenuScreen } from './ui/views/mainMenu/mainMenuScreen.js';

plog.info('main.js loaded');

class GameManager {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.game = null;
        this.assetLoader = null;
        this.inputManager = null;
        this.menuScreen = null;
        this.loadingView = new BootstrapLoadingView();
        this.performanceUtils = new PerformanceUtils();
        this.viewport = null;
        this.isRunning = false;
        this.isPageVisible = !document.hidden;
        this.assetsLoaded = false;
        this.bootstrapComplete = false;
        this.lastTime = 0;
        this.lastMenuDraw = 0;
        this.simulationAccumulator = 0;
        this.animationFrameId = null;
        this.handlePageVisibilityChange = null;
        this.init();
        this.setupPageVisibilityHandling();
    }

    init() {
        this.setupResponsiveCanvas();
        this.loadingView.show();
        this.assetLoader = new AssetLoader();
        this.assetLoader.loadAssets(
            this.onAssetsLoaded.bind(this),
            this.onAssetProgress.bind(this)
        );
    }

    setupResponsiveCanvas() {
        const container = this.canvas.parentElement;
        const cssWidth = container.clientWidth || window.innerWidth || STAGE_WIDTH;
        const cssHeight = container.clientHeight || window.innerHeight || STAGE_HEIGHT;
        this.viewport = createViewport(cssWidth, cssHeight, window.devicePixelRatio || 1);
        this.canvas.style.width = `${this.viewport.cssWidth}px`;
        this.canvas.style.height = `${this.viewport.cssHeight}px`;
        this.canvas.width = this.viewport.backingWidth;
        this.canvas.height = this.viewport.backingHeight;
        this.canvas.viewport = this.viewport;
        this.game?.setViewport(this.viewport);
    }

    onAssetProgress(progress, resourceName, details = null) {
        this.loadingView.setProgress(progress, resourceName);
        if (this.bootstrapComplete && details && !details.blocking) {
            this.loadingView.setBackgroundAssets(details.pendingNonBlocking);
        }
    }

    async onAssetsLoaded(assetLoader) {
        plog.success('Assets loaded, initializing game...');
        this.assetsLoaded = true;
        this.game = new Game(
            this.canvas,
            assetLoader,
            assetLoader.getAudioManager(),
            { onStateChanged: state => this.handleGameStateChanged(state) }
        );
        this.menuScreen = new MainMenuScreen({
            canvas: this.canvas,
            assetLoader,
            beginFrame: () => this.game.beginFrame(),
            getHighScore: () => this.game.highScore,
            hasActiveScreens: () => Boolean(this.game.uiManager.activeScreens.length),
            actions: {
                startGame: () => this.game.startGame(),
                showHighScores: () => this.game.showHighScores(),
                openLevelEditor: () => this.game.openLevelEditor(),
                showLevelBrowser: () => this.game.showLevelBrowser()
            }
        });

        const inputRootContext = {
            canvas: this.canvas,
            game: this.game,
            menuScreen: this.menuScreen,
            setupResponsiveCanvas: this.setupResponsiveCanvas.bind(this),
            pause: this.pause.bind(this),
            resume: this.resume.bind(this)
        };
        this.inputManager = new InputManager(inputRootContext);
        registerDefaultInputContexts(this.inputManager, inputRootContext);

        plog.info('Loading level definitions...');
        await this.game.levelLoader.loadDefaultLevels();
        plog.success('Level definitions loaded');
        window.game = this.game;
        this.game.loadHighScore();
        await this.applyStartupLevelRequest();
        this.applyStartupEditorRequest();

        this.loadingView.hide();
        this.bootstrapComplete = true;
        this.loadingView.setBackgroundAssets(assetLoader.getPendingNonBlockingAssets());
        this.resume();
        this.handleGameStateChanged(this.game.state);
        if (this.game.state === GameState.MENU) this.renderMenu(performance.now());
    }

    handleGameStateChanged(state) {
        if (!this.menuScreen) return;
        if (state === GameState.MENU) this.menuScreen.show();
        else this.menuScreen.hide();
    }

    gameLoop(currentTime = 0) {
        this.animationFrameId = null;
        if (!this.isRunning || !this.isPageVisible) return;
        this.scheduleNextFrame();

        const deltaTime = this.lastTime === 0
            ? 0
            : Math.max(0, (currentTime - this.lastTime) / 1000);
        this.lastTime = currentTime;
        const frameDelta = Math.min(deltaTime, RUNTIME_CONFIG.frameTiming.maxDeltaSeconds);
        const simulationStep = 1 / SIMULATION_CONFIG.legacyPhysicsFps;
        const simulationSpeed = this.game?.getSimulationSpeedMultiplier?.() ?? 1;
        this.simulationAccumulator += frameDelta * simulationSpeed;
        if (frameDelta > 0) this.performanceUtils.recordFrameTime(frameDelta);

        if (!this.game || !this.assetsLoaded) return;
        while (this.simulationAccumulator + Number.EPSILON >= simulationStep) {
            this.game.update(simulationStep);
            this.simulationAccumulator -= simulationStep;
        }
        if (this.simulationAccumulator < Number.EPSILON) this.simulationAccumulator = 0;

        if (this.game.state === GameState.MENU) this.renderMenu(currentTime);
        else this.game.render();
    }

    renderMenu(currentTime) {
        if (this.lastMenuDraw && currentTime - this.lastMenuDraw <= 33) return;
        this.menuScreen.render(currentTime * 0.001);
        this.lastMenuDraw = currentTime;
    }

    scheduleNextFrame() {
        if (!this.isRunning || !this.isPageVisible || this.animationFrameId !== null) return;
        this.animationFrameId = requestAnimationFrame(time => this.gameLoop(time));
    }

    setupPageVisibilityHandling() {
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

    resume() {
        if (!this.assetsLoaded || !this.isPageVisible) return;
        if (this.isRunning && this.animationFrameId !== null) return;
        this.isRunning = true;
        this.lastTime = 0;
        this.simulationAccumulator = 0;
        this.scheduleNextFrame();
    }

    async applyStartupLevelRequest() {
        const levelParam = Utils.getURLParameter('level');
        if (!levelParam) return;
        const selector = parseLevelSelector(levelParam);
        if (!selector) {
            plog.warn(
                `Invalid level parameter: ${levelParam}. Must be ` +
                `${LEVEL_CATALOG_CONFIG.firstLevel}-${LEVEL_CATALOG_CONFIG.maxGeneratedLevel} ` +
                'or manual:1-manual:25.'
            );
            Utils.removeURLParameter('level');
            return;
        }
        if (selector.collection !== this.game.levelLoader.activeCollection) {
            await this.game.levelLoader.loadCollection(selector.collection);
        }
        plog.info(`Jumping to ${selector.collection} level ${selector.level} from URL parameter`);
        this.loadingView.setMessage(
            `Starting ${selector.collection === 'manual' ? 'Manual ' : ''}Level ${selector.level}...`
        );
        this.game.jumpToLevel(selector.level);
    }

    applyStartupEditorRequest() {
        if (!Utils.hasURLParameter('level_editor')) return;
        if (this.game.state === GameState.MENU) this.game.startGame();
        plog.info('Entering level editor from URL parameter');
        this.game.enterLevelEditor();
    }

    destroy() {
        this.pause();
        if (this.handlePageVisibilityChange) {
            document.removeEventListener('visibilitychange', this.handlePageVisibilityChange);
            this.handlePageVisibilityChange = null;
        }
        this.inputManager?.destroy();
        this.menuScreen?.destroy();
        this.loadingView.destroy();
        this.game = null;
        this.assetLoader = null;
        this.inputManager = null;
        this.menuScreen = null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    plog.waddle('DOM loaded, starting game manager...');
    const gameManager = new GameManager();
    window.gameManager = gameManager;
});

if (typeof module !== 'undefined' && module.exports) module.exports = GameManager;

export { GameManager };
