import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './nodeShims.js';
import {
    createAnimationFrameFixture,
    createEventTargetFixture,
    createGameFixture,
    createLevelEndScreenFixture,
    createRecordingContext,
    createTimeoutFixture,
    withGlobalOverrides
} from './testFixtures.js';

const { integratePlanetGravity } = await import('../js/simulation.js');
const { Game, GameState } = await import('../js/game.js');
const { AudioManager } = await import('../js/audioManager.js');
const { AUDIO_CONFIG } = await import('../js/config/audioConfig.js');
const Console = (await import('../js/console.js')).default;
const { GameManager } = await import('../js/main.js');
const { InputManager } = await import('../js/input/inputManager.js');
const { registerDefaultInputContexts } = await import('../js/input/registerDefaultInputContexts.js');
const { LevelEndScreen, getCompletionTitle } = await import('../js/views/levelEndScreen.js');
const LevelEditor = (await import('../js/levelEditor.js')).default;
const LevelEditorToolbarView = (await import('../js/levelEditor/views/toolbarView.js')).default;
const LevelEditorCanvasInputController = (await import('../js/levelEditor/controllers/canvasInputController.js')).default;
const { Penguin } = await import('../js/penguin.js');
const { UIManager } = await import('../js/uiManager.js');
const {
    applyGameSimulationState,
    applyGameSimulationEvents,
    captureGameSimulationState,
    invalidateGameSimulationState,
    stepGameSimulation
} = await import('../js/gameSimulationAdapter.js');
const { OrbitSystem, Slingshot, Target, TextObject } = await import('../js/gameObjects.js');
const { LEVEL_CATALOG_CONFIG, LEVEL_DEFAULTS } = await import('../js/config/gameConfig.js');
const { SimulationEventType } = await import('../js/simulationEngine.js');
const { GameObjectFactory } = await import('../js/levelLoader.js');
const { LiveEditCommandType } = await import('../js/editorCommands/index.js');
const {
    DEFAULT_MAX_SIMULATION_TIME,
    HeadlessGameEngine,
    HeadlessPenguin
} = await import('./headlessEngine.js');
const {
    compareAsciiTrajectoryResults,
    printLevelSummary,
    renderAsciiTrajectory,
    selectDiverseAsciiResults
} = await import('./levelTester.js');

test('main menu Start label ignores an inherited canvas text baseline', () => {
    let renderedText = null;
    const context = {
        textBaseline: 'middle',
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        beginPath() {},
        ellipse() {},
        fill() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fillText(text, x, y) {
            renderedText = { text, x, y, textBaseline: this.textBaseline };
        }
    };

    GameManager.prototype.drawStartButtonVisual.call({}, context, {
        isPressed: false,
        isHovered: false
    });

    assert.deepEqual(renderedText, {
        text: 'Start',
        x: 18,
        y: 13,
        textBaseline: 'alphabetic'
    });
});

test('main menu button icons have a padded column before their labels', () => {
    let renderedIcon = null;
    let renderedText = null;
    const manager = {
        roundedRectPath() {},
        drawMenuIcon(_context, icon, x, y, size) {
            renderedIcon = { icon, x, y, size };
        }
    };
    const context = {
        textBaseline: 'alphabetic',
        fill() {},
        fillText(text, x, y) {
            renderedText = { text, x, y, textBaseline: this.textBaseline };
        }
    };

    GameManager.prototype.drawOriginalMenuButton.call(
        manager, context, 40, 517, 166, 54, 'High Scores', 15, 'trophy'
    );

    assert.deepEqual(renderedIcon, { icon: 'trophy', x: 65, y: 544, size: 16 });
    assert.deepEqual(renderedText, {
        text: 'High Scores',
        x: 140.5,
        y: 544,
        textBaseline: 'middle'
    });
});

test('level files bypass the browser cache when reloaded', async () => {
    const requests = [];
    const loader = new (await import('../js/levelLoader.js')).LevelLoader(null);
    const level = {
        name: 'Fresh level',
        startPosition: { x: 100, y: 300 },
        targetPosition: { x: 700, y: 300 },
        objects: [],
        rules: {}
    };

    await withGlobalOverrides({
        fetch: async (path, options) => {
            requests.push({ path, options });
            return { ok: true, json: async () => level };
        }
    }, () => loader.loadLevelFromFile(1, 'levels/level1.json'));

    assert.deepEqual(requests, [{
        path: 'levels/level1.json',
        options: { cache: 'no-store' }
    }]);
});

test('level editor text width updates the renderer wrap limit', () => {
    const editor = Object.create(LevelEditor.prototype);
    editor.selectedObject = new TextObject(100, 100, 'Text that should wrap later', {
        width: 200,
        padding: 10,
        autoSize: true
    });
    editor.commandBus = {
        execute(type, payload) {
            assert.equal(type, LiveEditCommandType.SET_OBJECT_PROPERTY);
            editor.applyObjectProperty(editor.selectedObject, payload.property, payload.value);
            return true;
        }
    };

    editor.handlePropertyChange({
        target: {
            dataset: { property: 'width' },
            type: 'number',
            value: '360'
        }
    });

    assert.equal(editor.selectedObject.width, 360);
    assert.equal(editor.selectedObject.maxWidth, 340);
});

test('level editor toolbar minimizes to a restore control', () => {
    const view = Object.create(LevelEditorToolbarView.prototype);
    view.toolbarControls = [{ style: {} }, { style: {} }];
    view.minimizeButton = {
        style: {},
        setAttribute(name, value) { this[name] = value; }
    };
    view.toolbar = { style: {}, dataset: {} };
    view.status = { style: {} };
    view.section = { style: {} };
    view.toggleButton = {};
    view.toolbarDrag = { clampToViewport() {} };

    view.setMinimized(true);

    assert.equal(view.toolbarControls[0].style.display, 'none');
    assert.equal(view.section.style.display, 'none');
    assert.equal(view.minimizeButton.textContent, '+');
    assert.equal(view.minimizeButton['aria-label'], 'Restore editor toolbar');
    assert.equal(view.toolbar.style.right, 'auto');

    view.resize = () => { view.didResize = true; };
    view.setMinimized(false);

    assert.equal(view.toolbarControls[0].style.display, '');
    assert.equal(view.minimizeButton.textContent, '−');
    assert.equal(view.didResize, true);
});

test('level editor toolbar only exposes valid selection actions', () => {
    const attributeTarget = () => ({
        hidden: false,
        setAttribute(name, value) { this[name] = value; }
    });
    const view = Object.create(LevelEditorToolbarView.prototype);
    view.editor = { selectedObject: null };
    view.deleteButton = attributeTarget();
    view.cloneButton = attributeTarget();

    view.updateContextActions(null);
    assert.equal(view.deleteButton.hidden, true);
    assert.equal(view.cloneButton.hidden, true);

    view.updateContextActions({ constructor: { name: 'Planet' } });
    assert.equal(view.deleteButton.hidden, false);
    assert.equal(view.cloneButton.hidden, false);

    view.updateContextActions({ constructor: { name: 'Target' } });
    assert.equal(view.deleteButton.hidden, false);
    assert.equal(view.cloneButton.hidden, true);

    view.updateContextActions({ isLevelSettings: true, constructor: { name: 'Object' } });
    assert.equal(view.deleteButton.hidden, true);
    assert.equal(view.cloneButton.hidden, true);
});

test('level editor publish is disabled until the current level is completed', () => {
    const attributes = {};
    const publishButton = {
        disabled: false,
        setAttribute(name, value) { attributes[name] = value; }
    };
    const game = { communityLevelClient: {}, completedRun: null };
    const view = Object.create(LevelEditorToolbarView.prototype);
    view.editor = { game };
    view.publishButton = publishButton;
    view.publishHint = { hidden: true };

    view.updatePublishAvailability();
    assert.equal(publishButton.disabled, true);
    assert.equal(publishButton.textContent, '🔒 Publish');
    assert.equal(view.publishHint.hidden, false);
    assert.match(publishButton.title, /Complete this level/);

    game.completedRun = { level: {}, proof: {} };
    view.updatePublishAvailability();
    assert.equal(publishButton.disabled, false);
    assert.equal(publishButton.textContent, 'Publish');
    assert.equal(view.publishHint.hidden, true);
    assert.match(publishButton.title, /Publish this completed level/);
});

test('publish confirmation metadata updates the editor and proof-captured definition', () => {
    const editor = Object.create(LevelEditor.prototype);
    editor.game = {
        levelMetadata: { name: 'Draft', description: '' },
        completedRun: { level: { name: 'Draft', description: '' } },
        recordedRunLevel: { name: 'Draft', description: '' },
        loadedLevelDefinition: { name: 'Draft', description: '' }
    };

    editor.applyPublishMetadata({ name: 'Public Orbit', description: 'Thread the moons.' });

    assert.equal(editor.game.levelMetadata.name, 'Public Orbit');
    assert.equal(editor.game.levelMetadata.description, 'Thread the moons.');
    assert.equal(editor.game.completedRun.level.name, 'Public Orbit');
    assert.equal(editor.game.recordedRunLevel.description, 'Thread the moons.');
    assert.equal(editor.game.loadedLevelDefinition.name, 'Public Orbit');
});

test('publishing waits for confirmed metadata and cancellation has no side effects', async () => {
    const calls = [];
    const editor = Object.create(LevelEditor.prototype);
    editor.publishButton = { disabled: false };
    editor.toolbarView = { showStatus: message => calls.push(['status', message]) };
    editor.updatePublishAvailability = () => calls.push('availability');
    editor.applyPublishMetadata = metadata => calls.push(['metadata', metadata]);
    editor.game = {
        levelMetadata: { name: 'Draft' },
        publishEditedLevel: async () => {
            calls.push('publish');
            return { name: 'Public Orbit' };
        }
    };
    editor.promptForPublishMetadata = async () => ({
        name: 'Public Orbit',
        description: 'Thread the moons.'
    });

    assert.deepEqual(await editor.publishLevel(), { name: 'Public Orbit' });
    assert.deepEqual(calls, [
        ['metadata', { name: 'Public Orbit', description: 'Thread the moons.' }],
        ['status', 'Publishing…'],
        'publish',
        ['status', 'Published “Public Orbit” to Community Levels.'],
        'availability'
    ]);

    calls.length = 0;
    editor.publishButton.disabled = false;
    editor.promptForPublishMetadata = async () => null;
    assert.equal(await editor.publishLevel(), null);
    assert.deepEqual(calls, []);
});

test('successful level editor play-tests unlock publishing without opening the end screen', () => {
    const timers = createTimeoutFixture();
    let publishUpdates = 0;
    let completionNotices = 0;
    let sounds = 0;
    const game = {
        state: GameState.LEVEL_EDITOR,
        levelEditor: {
            active: true,
            updatePublishAvailability: () => { publishUpdates++; },
            onPlayTestCompleted: () => { completionNotices++; }
        },
        runTranscriptRecorder: {
            actions: [{ type: 'launch' }],
            freeze: () => ({ actions: [{ type: 'launch' }] })
        },
        recordedRunLevel: { name: 'Completed editor level' },
        completeRecordedRun: Game.prototype.completeRecordedRun,
        playSound: () => { sounds++; },
        target: { isHit: true, hitFrameCount: 3 }
    };

    withGlobalOverrides({ setTimeout: timers.setTimeout }, () => {
        Game.prototype.handleTargetHit.call(game);
    });

    assert.equal(sounds, 1);
    assert.equal(publishUpdates, 1);
    assert.equal(completionNotices, 1);
    assert.equal(game.completedRun.level.name, 'Completed editor level');
    assert.equal(timers.scheduled.length, 0);
    assert.equal(game.target.isHit, true);
});

test('level end screen is suppressed when an editor session is active', () => {
    const calls = [];
    const game = {
        state: GameState.PLAYING,
        levelEditor: {
            active: true,
            onPlayTestCompleted: () => calls.push('completed')
        },
        setState: state => { game.state = state; calls.push(['state', state]); },
        calculateFinalScore: () => calls.push('score'),
        uiManager: { showScreen: () => calls.push('screen') }
    };

    assert.equal(Game.prototype.showLevelEndScreen.call(game), null);
    assert.equal(game.state, GameState.LEVEL_EDITOR);
    assert.deepEqual(calls, [['state', GameState.LEVEL_EDITOR], 'completed']);
});

test('level editor drag ignores pointer events from non-owning pointers', () => {
    const calls = [];
    const editor = {
        active: true,
        mode: 'edit',
        toolManager: {
            handlePointerMove: input => calls.push(['move', input.world.x, input.world.y]),
            handlePointerUp: () => calls.push(['stop'])
        }
    };
    const controller = new LevelEditorCanvasInputController(editor);
    controller.capturedPointerId = 7;
    controller.getEventCoordinates = event => ({ x: event.clientX, y: event.clientY });

    controller.handlePointerMove({ pointerId: 8, clientX: 50, clientY: 60, preventDefault() {} });
    controller.handlePointerUp({ pointerId: 8, preventDefault() {} });
    assert.deepEqual(calls, []);

    controller.handlePointerMove({ pointerId: 7, clientX: 70, clientY: 80, preventDefault() {} });
    assert.deepEqual(calls, [['move', 70, 80]]);
});

test('level editor root settings update metadata, positions, and live gravity', () => {
    const editor = Object.create(LevelEditor.prototype);
    editor.game = {
        levelMetadata: { name: 'Old name', description: '' },
        levelRules: { gravitationalConstant: 3, maxTries: null },
        physics: { gravitationalConstant: 3 },
        slingshot: { position: { x: 100, y: 200 } },
        penguin: { x: 100, y: 200 },
        target: { position: { x: 700, y: 300 } }
    };

    editor.updateLevelSetting('levelName', 'Editor-authored level');
    editor.updateLevelSetting('startX', 125);
    editor.updateLevelSetting('targetY', 350);
    editor.updateLevelSetting('maxTries', 4);
    editor.updateLevelSetting('gravitationalConstant', 2.5);

    assert.equal(editor.game.levelMetadata.name, 'Editor-authored level');
    assert.equal(editor.game.slingshot.position.x, 125);
    assert.equal(editor.game.penguin.x, 125);
    assert.equal(editor.game.target.position.y, 350);
    assert.equal(editor.game.levelRules.maxTries, 4);
    assert.equal(editor.game.levelRules.gravitationalConstant, 2.5);
    assert.equal(editor.game.physics.gravitationalConstant, 2.5);
});

test('level editor expansion derives loss buffers and opts legacy levels into fit framing', () => {
    const calls = [];
    const editor = Object.create(LevelEditor.prototype);
    editor.fitEditorCamera = () => calls.push('fit editor');
    editor.game = {
        levelMetadata: {},
        stageRect: { x: 0, y: 0, width: 800, height: 600 },
        flightRect: { x: -400, y: -400, width: 2400, height: 2200 },
        cameraConfig: null,
        arrow: { setFlightRect: rect => calls.push(['flight', { ...rect }]) },
        resetWorldCamera: () => calls.push('reset gameplay'),
        invalidateSimulationState: () => calls.push('invalidate')
    };

    editor.updateLevelSetting('playfieldWidth', 2400);
    editor.updateLevelSetting('playfieldHeight', 1800);

    assert.deepEqual(editor.game.stageRect, { x: 0, y: 0, width: 2400, height: 1800 });
    assert.deepEqual(editor.game.flightRect, { x: -200, y: -200, width: 2800, height: 2200 });
    assert.deepEqual(editor.game.cameraConfig, { mode: 'fit' });
    assert.equal(calls.filter(call => call === 'fit editor').length, 2);
    assert.equal(calls.filter(call => call === 'reset gameplay').length, 2);
});

test('level export uses editor-authored root metadata', () => {
    const game = {
        level: 1,
        levelMetadata: { name: 'Root settings test', description: 'Saved from the editor' },
        levelRules: null,
        slingshot: { position: { x: 100, y: 200 } },
        penguin: null,
        target: { position: { x: 700, y: 300 } },
        stageRect: { x: 0, y: 0, width: 2400, height: 1800 },
        flightRect: { x: -200, y: -200, width: 2800, height: 2200 },
        cameraConfig: { mode: 'follow', zoom: 1 },
        getAllObjectsForExport: () => []
    };

    const exported = Game.prototype.exportCurrentLevel.call(game);

    assert.equal(exported.name, 'Root settings test');
    assert.equal(exported.description, 'Saved from the editor');
    assert.deepEqual(exported.bounds.stage, game.stageRect);
    assert.deepEqual(exported.bounds.flight, game.flightRect);
    assert.deepEqual(exported.camera, game.cameraConfig);
});

test('saving an edited level synchronizes its authored name back to live metadata', async () => {
    const authoredLevel = { name: 'Renamed level', description: 'Updated description', objects: [] };
    const savedRecord = {
        id: 'local-renamed',
        name: authoredLevel.name,
        description: authoredLevel.description,
        level: authoredLevel
    };
    const game = {
        canvas: {},
        levelMetadata: { name: 'Untitled Level', description: '', saveId: 'local-existing' },
        levelEditor: {
            active: true,
            currentDocumentDefinition: () => authoredLevel
        },
        levelSaveService: {
            async save(level, options) {
                assert.equal(level, authoredLevel);
                assert.equal(options.id, 'local-existing');
                return savedRecord;
            }
        }
    };

    const result = await Game.prototype.saveEditedLevel.call(game);

    assert.equal(result, savedRecord);
    assert.deepEqual(game.levelMetadata, {
        name: 'Renamed level',
        description: 'Updated description',
        saveId: 'local-renamed'
    });
});

test('text factory restores an explicitly exported wrap limit', () => {
    const textObject = GameObjectFactory.create({
        type: 'textobject',
        position: { x: 10, y: 20 },
        properties: { content: 'Tutorial text', width: 360, padding: 10, maxWidth: 340 }
    });

    assert.equal(textObject.width, 360);
    assert.equal(textObject.maxWidth, 340);
});

test('object factory preserves authored IDs for every projected runtime type', () => {
    const definitions = [
        { type: 'slingshot', position: { x: 100, y: 200 }, properties: { id: 'launcher_custom' } },
        { type: 'textobject', position: { x: 200, y: 100 }, properties: { id: 'textobject_9' } },
        { type: 'pointingarrow', position: { x: 300, y: 100 }, properties: { id: 'arrow_custom' } }
    ];

    const runtimeObjects = definitions.map(definition =>
        GameObjectFactory.create(definition, null, null)
    );

    assert.deepEqual(runtimeObjects.map(object => object.id), [
        'launcher_custom',
        'textobject_9',
        'arrow_custom'
    ]);
});

test('tutorial text parser preserves authored breaks and decodes quoted copy', () => {
    const textObject = new TextObject(10, 20,
        '<font size=4><b>Distance Bonus<br>Planets will &quot;pull&quot; Kevin.</b></font>');

    assert.equal(textObject.parsedContent.text, 'Distance Bonus\nPlanets will "pull" Kevin.');
    assert.equal(textObject.parsedContent.isBold, true);
    assert.equal(textObject.parsedContent.fontSize, 16);
});

test('planet factory respects an explicit collision radius', () => {
    const planet = GameObjectFactory.create({
        type: 'planet',
        position: { x: 100, y: 200 },
        properties: {
            radius: 65.8413472395633,
            collisionRadius: 62.8,
            mass: 128.841347239563
        }
    }, null);

    assert.equal(planet.radius, 65.8413472395633);
    assert.equal(planet.collisionRadius, 62.8);
});

test('level export persists the configured text wrap width', () => {
    const textObject = new TextObject(10, 20, 'Tutorial text', {
        width: 360,
        padding: 10,
        autoSize: true
    });
    // Simulate the rendered background shrinking around its current content.
    textObject.width = 140;

    const game = { exportOrbitSystem: Game.prototype.exportOrbitSystem };
    const properties = Game.prototype.exportObjectComprehensively.call(game, textObject).properties;

    assert.equal(properties.width, 360);
});

test('level export derives canonical object types from the shared schema', () => {
    const textObject = new TextObject(10, 20, 'Tutorial text');
    const game = { exportOrbitSystem: Game.prototype.exportOrbitSystem };

    const exported = Game.prototype.exportObjectComprehensively.call(game, textObject);

    assert.equal(exported.type, 'textobject');
    assert.equal('className' in exported, false);
});

function simulateAtRate(rate, seconds = 1) {
    const planets = [{
        x: 400,
        y: 300,
        mass: 500,
        gravitationalReach: 5000
    }];
    let position = { x: 100, y: 300 };
    let velocity = { x: 40, y: -10 };
    const deltaTime = 1 / rate;

    for (let i = 0; i < rate * seconds; i++) {
        const result = integratePlanetGravity(position, velocity, planets, 3, deltaTime);
        position = result.position;
        velocity = result.velocity;
    }

    return { position, velocity };
}

test('gravity integration produces the same result at 30 and 60 rendered FPS', () => {
    assert.deepEqual(simulateAtRate(30), simulateAtRate(60));
});

test('one 60 Hz gravity step preserves the legacy calibrated velocity change', () => {
    const result = integratePlanetGravity(
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        [{ x: 100, y: 0, mass: 100, gravitationalReach: 5000 }],
        3,
        1 / 60
    );

    assert.equal(result.velocity.x, 3);
    assert.equal(result.velocity.y, 0);
    assert.equal(result.position.x, 0.05);
});

test('Game updates UI but not the world while paused', () => {
    let uiUpdates = 0;
    let worldUpdates = 0;
    const game = createGameFixture({
        state: GameState.PAUSED,
        uiManager: { update: () => uiUpdates++ },
        updateGameObjects: () => worldUpdates++
    });

    Game.prototype.update.call(game, 1 / 60);

    assert.equal(uiUpdates, 1);
    assert.equal(worldUpdates, 0);
});

test('Game animates menu UI without stepping an unloaded world', () => {
    let uiUpdates = 0;
    const game = createGameFixture({
        state: GameState.MENU,
        uiManager: { update: () => uiUpdates++ },
        updateSimulation: () => assert.fail('menu must not enter the simulation'),
        updateGameObjects: () => assert.fail('menu must not update world objects')
    });

    Game.prototype.update.call(game, 1 / 60);

    assert.equal(uiUpdates, 1);
    assert.equal(game.starfieldTime, 1 / 60);
});

test('HUD updates skip unchanged values and throttle in-flight distance layout writes', () => {
    const writes = { level: 0, score: 0, distance: 0, tries: 0 };
    const ui = Object.fromEntries(Object.keys(writes).map(key => [key, {
        set textContent(value) {
            writes[key]++;
            this.value = value;
        }
    }]));
    const game = {
        ui,
        state: GameState.PLAYING,
        level: 1,
        score: 0,
        currentAttemptScore: 0,
        distance: 10,
        tries: 1,
        simulationTime: 1,
        _hudValues: Object.create(null),
        _nextDistanceHudUpdate: 0,
        updateHudValue: Game.prototype.updateHudValue
    };

    Game.prototype.updateUI.call(game);
    Game.prototype.updateUI.call(game);
    game.distance = 25;
    game.simulationTime = 1.05;
    Game.prototype.updateUI.call(game);

    assert.deepEqual(writes, { level: 1, score: 1, distance: 1, tries: 1 });

    game.simulationTime = 1.11;
    Game.prototype.updateUI.call(game);
    assert.equal(writes.distance, 2);
});

test('browser simulation reuses mutable state until the live world is invalidated', () => {
    const game = {
        simulationTime: 0,
        penguin: {
            x: 100, y: 200, vx: 0, vy: 0, radius: 10,
            state: 'idle', crashedFrameCount: 0
        },
        planets: [],
        bonuses: [],
        target: {
            id: 'target_1', position: { x: 700, y: 300 },
            width: 50, height: 50, orbitSystem: null
        },
        slingshot: {
            anchor: { x: 100, y: 200 },
            velocityMultiplier: 100,
            maxPullback: 100,
            minPullback: 0
        },
        stageRect: { x: 0, y: 0, width: 800, height: 600 },
        flightRect: { x: -100, y: -100, width: 1000, height: 800 },
        levelRules: {},
        physics: { gravitationalConstant: 3 },
        tries: 0,
        planetCollisions: 0,
        currentAttemptScore: 0,
        distance: 0
    };

    stepGameSimulation(game, 1 / 60);
    const state = game._runtimeSimulationState;
    stepGameSimulation(game, 1 / 60);
    assert.equal(game._runtimeSimulationState, state);

    game.penguin.state = 'pullback';
    game.penguin.x = 45;
    game.penguin.y = 260;
    stepGameSimulation(game, 1 / 60);
    assert.equal(game.penguin.x, 45);
    assert.equal(game.penguin.y, 260);
    assert.equal(game._runtimeSimulationState, state);

    invalidateGameSimulationState(game);
    assert.equal(game._runtimeSimulationState, null);
});

test('simulation state reconciles reordered runtime collections by stable ID', () => {
    const planetA = { position: { x: 10, y: 20 }, radius: 10, collisionRadius: 9, mass: 1, gravitationalReach: 100, orbitSystem: null };
    const planetB = { id: 'authored-planet', position: { x: 30, y: 40 }, radius: 12, collisionRadius: 11, mass: 2, gravitationalReach: 200, orbitSystem: null };
    const makeBonus = (id, x) => ({
        id,
        position: { x, y: 50 },
        width: 20,
        value: 100,
        state: 'Idle',
        orbitSystem: null,
        collect() { this.state = 'Hit'; },
        reset() { this.state = 'Idle'; }
    });
    const bonusA = makeBonus(null, 60);
    const bonusB = makeBonus('authored-bonus', 80);
    const game = {
        simulationTime: 0,
        runTick: 0,
        penguin: { x: 0, y: 0, vx: 0, vy: 0, radius: 8, state: 'idle', crashedFrameCount: 0 },
        planets: [planetA, planetB],
        bonuses: [bonusA, bonusB],
        portals: [],
        target: { position: { x: 700, y: 300 }, width: 50, height: 50, orbitSystem: null },
        slingshot: { anchor: { x: 100, y: 200 }, velocityMultiplier: 10, maxPullback: 100, minPullback: 0 },
        stageRect: { x: 0, y: 0, width: 800, height: 600 },
        flightRect: { x: 0, y: 0, width: 800, height: 600 },
        levelRules: {},
        physics: { gravitationalConstant: 3 },
        tries: 0,
        planetCollisions: 0,
        currentAttemptScore: 0,
        distance: 0
    };
    const state = captureGameSimulationState(game);
    assert.equal(planetA.id, '__planet_1');
    assert.equal(bonusA.id, '__bonus_1');
    assert.equal(game.target.id, '__target_1');

    state.planets[0].position = { x: 111, y: 112 };
    state.planets[1].position = { x: 211, y: 212 };
    state.bonuses[0].position = { x: 311, y: 312 };
    state.bonuses[0].collected = true;
    state.bonuses[1].position = { x: 411, y: 412 };
    game.planets.reverse();
    game.bonuses.reverse();

    applyGameSimulationState(game, state);

    assert.deepEqual(planetA.position, { x: 111, y: 112 });
    assert.deepEqual(planetB.position, { x: 211, y: 212 });
    assert.deepEqual(bonusA.position, { x: 311, y: 312 });
    assert.equal(bonusA.state, 'Hit');
    assert.deepEqual(bonusB.position, { x: 411, y: 412 });
});

test('indexed simulation events resolve their runtime object through captured stable IDs', () => {
    const planetA = { id: 'planet-a' };
    const planetB = { id: 'planet-b' };
    const crashedInto = [];
    const game = {
        _runtimeSimulationState: { planets: [{ id: 'planet-a' }, { id: 'planet-b' }], bonuses: [] },
        planets: [planetB, planetA],
        bonuses: [],
        penguin: { state: 'soaring', beginCrash: planet => crashedInto.push(planet) },
        playSound() {},
        endRecordingShotPath() {},
        preserveCrashedPenguin() {},
        tryAgain() {},
        updateUI() {}
    };

    applyGameSimulationEvents(game, [{
        type: SimulationEventType.PLANET_COLLISION,
        planetIndex: 0
    }], 1 / 60);

    assert.deepEqual(crashedInto, [planetA]);
});

test('shot paths retain every distinct flight position without cumulative accuracy loss', () => {
    const game = {
        penguin: { state: 'soaring' },
        isRecordingPath: true,
        currentShotPath: [],
        shotPaths: [],
        shotColors: ['#fff'],
        currentColorIndex: 0
    };

    for (let x = 0; x < 5000; x++) {
        Game.prototype.recordPathPoint.call(game, x, Math.sin(x / 20) * 100);
    }
    assert.equal(game.currentShotPath.length, 5000);
    assert.deepEqual(game.currentShotPath[2400], {
        x: 2400,
        y: Math.sin(2400 / 20) * 100
    });

    // Identical stationary samples add no geometry or memory.
    Game.prototype.recordPathPoint.call(game, 4999, Math.sin(4999 / 20) * 100);
    assert.equal(game.currentShotPath.length, 5000);

    for (let attempt = 0; attempt < 10; attempt++) {
        game.currentShotPath = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
        game.isRecordingPath = true;
        Game.prototype.endRecordingShotPath.call(game);
    }
    assert.equal(game.shotPaths.length, 7);
});

test('level-end buttons handle clicks before the screen-wide continue action', () => {
    let buttonClicks = 0;
    let continueCalls = 0;
    const screen = createLevelEndScreenFixture({
        elements: [{
            handleClick: () => {
                buttonClicks++;
                return true;
            }
        }],
        handleContinue: () => continueCalls++
    });

    const handled = LevelEndScreen.prototype.handleClick.call(screen, 250, 430);

    assert.equal(handled, true);
    assert.equal(buttonClicks, 1);
    assert.equal(continueCalls, 0);
});

test('level-end Main Menu action closes the score card and returns to menu', () => {
    const calls = [];
    const screen = createLevelEndScreenFixture({
        uiManager: { playSound: () => calls.push('sound') },
        game: { returnToMenu: () => calls.push('menu') },
        stopAllLoopingSounds: () => calls.push('stop'),
        close: () => calls.push('close')
    });

    LevelEndScreen.prototype.handleMainMenu.call(screen);

    assert.deepEqual(calls, ['stop', 'sound', 'close', 'menu']);
});

test('level-end continuation reaches game over at the configured final level', () => {
    let endGameCalls = 0;
    const game = {
        level: LEVEL_CATALOG_CONFIG.maxGeneratedLevel,
        state: GameState.SCORING,
        levelLoader: { maximumSelectableLevel: LEVEL_CATALOG_CONFIG.maxGeneratedLevel },
        uiManager: {
            audioManager: null,
            playSound() {}
        },
        endGame() {
            endGameCalls++;
            this.state = GameState.GAME_OVER;
        },
        nextLevel: () => assert.fail('final level must not advance')
    };
    const screen = createLevelEndScreenFixture({
        game,
        uiManager: {
            playSound() {}
        },
        close() {},
        stopAllLoopingSounds() {}
    });

    LevelEndScreen.prototype.handleContinue.call(screen);

    assert.equal(game.state, GameState.GAME_OVER);
    assert.equal(endGameCalls, 1);
});

test('custom level completion uses its friendly name and browses instead of advancing', () => {
    const calls = [];
    const game = {
        level: 'custom-1755298123456-ab12cd',
        levelMetadata: { name: 'Orbit Practice', saveId: 'local-1' },
        levelLoader: { maximumSelectableLevel: 25 },
        showLevelBrowser: options => calls.push(['browse', options]),
        nextLevel: () => calls.push('next'),
        endGame: () => calls.push('end')
    };
    const screen = createLevelEndScreenFixture({
        game,
        uiManager: { playSound() {} },
        close: () => calls.push('close'),
        stopAllLoopingSounds() {}
    });

    assert.equal(getCompletionTitle(game, 25), 'Orbit Practice Complete!');
    LevelEndScreen.prototype.handleContinue.call(screen);
    assert.deepEqual(calls, ['close', ['browse', { initialSource: 'local' }]]);
});

test('playing a saved level exits an active editor session', () => {
    const calls = [];
    const game = {
        levelEditor: {
            active: true,
            exit() { calls.push('exit-editor'); this.active = false; },
            enter: () => calls.push('enter-editor')
        },
        uiManager: { closeAllScreens: () => calls.push('close-screens') },
        loadLevel: definition => calls.push(['load', definition.name]),
        setState: state => calls.push(['state', state])
    };
    const record = {
        id: 'local-1',
        name: 'Saved Level',
        description: '',
        level: { name: 'Saved Level', objects: [] }
    };

    assert.equal(Game.prototype.loadSavedLevel.call(game, record), true);
    assert.deepEqual(calls, [
        'exit-editor',
        'close-screens',
        ['load', 'Saved Level'],
        ['state', GameState.PLAYING]
    ]);
    assert.equal(game.levelMetadata.saveId, 'local-1');
});

test('opening an official catalog level preserves its numeric campaign identity', () => {
    const calls = [];
    const game = {
        levelLoader: { levels: new Map() },
        levelEditor: {
            active: false,
            enter: () => calls.push('enter-editor')
        },
        uiManager: { closeAllScreens: () => calls.push('close-screens') },
        loadLevel: selector => calls.push(['load', selector])
    };
    const record = {
        id: '3',
        source: 'official',
        name: 'Official Three',
        description: '',
        level: { name: 'Official Three', objects: [] }
    };

    assert.equal(Game.prototype.loadSavedLevel.call(game, record, { edit: true }), true);
    assert.equal(game.level, 3);
    assert.deepEqual(calls, ['close-screens', ['load', 3], 'enter-editor']);
    assert.deepEqual(game.levelMetadata.catalogReference, { id: '3', source: 'official' });
});

test('catalog levels are fetched and validated before the active UI is closed', async () => {
    const calls = [];
    const summary = { id: 'cloud-1', source: 'cloud', name: 'Cloud Level', description: '' };
    const game = {
        levelCatalogService: {
            getDefinition: async reference => {
                calls.push(['fetch', reference.id]);
                return { name: 'Cloud Level', objects: [] };
            }
        },
        loadSavedLevel: (record, options) => {
            calls.push(['load', record.id, options.edit]);
            return true;
        }
    };

    assert.equal(await Game.prototype.loadCatalogLevel.call(game, summary, { edit: true }), true);
    assert.deepEqual(calls, [
        ['fetch', 'cloud-1'],
        ['load', 'cloud-1', true]
    ]);

    game.levelCatalogService.getDefinition = async () => ({ name: 'Invalid' });
    await assert.rejects(
        Game.prototype.loadCatalogLevel.call(game, summary),
        /objects.*must be an array/s
    );
    assert.equal(calls.length, 2);
});

test('editor dirty state follows the current definition and returns clean after undo-equivalent restoration', () => {
    const definition = { name: 'Draft', objects: [] };
    const editor = {
        active: true,
        mode: 'edit',
        game: { exportCurrentLevel: () => structuredClone(definition) },
        currentDocumentDefinition: LevelEditor.prototype.currentDocumentDefinition
    };

    LevelEditor.prototype.markClean.call(editor);
    assert.equal(LevelEditor.prototype.isDirty.call(editor), false);
    definition.name = 'Changed';
    assert.equal(LevelEditor.prototype.isDirty.call(editor), true);
    definition.name = 'Draft';
    assert.equal(LevelEditor.prototype.isDirty.call(editor), false);
});

test('editor object discovery hides runtime-only helpers', () => {
    class Planet {}
    class Target {}
    class Penguin {}
    class Arrow {}
    class BonusPopup {}
    const planet = new Planet();
    const target = new Target();
    const editor = {
        game: {
            planets: [planet],
            bonuses: [],
            gameObjects: [planet, target, new Penguin(), new Arrow(), new BonusPopup()]
        }
    };

    assert.deepEqual(LevelEditor.prototype.getAllGameObjects.call(editor), [planet, target]);
});

test('Game validates a level before clearing the current world', () => {
    const sentinel = { id: 'existing-world' };
    const validationError = new Error('invalid level');
    const game = createGameFixture({
        levelLoader: { assertLevelValid: () => { throw validationError; } },
        gameObjects: [sentinel],
        planets: [sentinel],
        bonuses: [],
        physics: { clear: () => assert.fail('physics must not clear before validation') }
    });

    assert.throws(() => Game.prototype.loadLevel.call(game, 99), validationError);
    assert.deepEqual(game.gameObjects, [sentinel]);
    assert.deepEqual(game.planets, [sentinel]);
});

test('generic object updates skip the penguin dedicated simulation path', () => {
    let penguinUpdates = 0;
    let objectUpdates = 0;
    const penguin = { update: () => penguinUpdates++ };
    const ordinaryObject = { update: () => objectUpdates++ };
    const game = createGameFixture({
        penguin,
        gameObjects: [penguin, ordinaryObject]
    });

    Game.prototype.updateGameObjects.call(game, 1 / 60);

    assert.equal(penguinUpdates, 0);
    assert.equal(objectUpdates, 1);
});

test('Target visual updates accept simulation options and do not advance orbit twice', () => {
    const target = new Target(100, 100);
    target.isHit = true;
    target.orbitSystem.update = () => assert.fail('visual update must not advance simulation orbit');

    assert.doesNotThrow(() => target.update(1 / 60, { updateOrbit: false }));
    assert.equal(target.hitFrameCount, 1);
});

test('runtime orbit setup uses shared normalization and preserves canonical zero values', () => {
    const lookup = () => null;
    const object = {
        constructor: { name: 'Fixture' },
        position: { x: 20, y: 30 },
        orbitSystem: new OrbitSystem()
    };

    GameObjectFactory.applyOrbitToObject(object, {
        orbitCenter: { x: 0, y: 0 },
        orbitRadius: 25,
        orbitSpeed: 0,
        speed: 99,
        orbitAngle: 0,
        angle: 2,
        orbitType: 'circular'
    }, lookup);

    assert.equal(object.orbitSystem.gameObjectLookup, lookup);
    assert.equal(object.orbitSystem.orbitSpeed, 0);
    assert.equal(object.orbitSystem.orbitAngle, 0);
    assert.equal(object.orbitSystem.orbitRadius, 25);
});

test('runtime slingshot construction consumes shared gameplay defaults', () => {
    const slingshot = new Slingshot(100, 300);

    assert.equal(slingshot.maxPullback, LEVEL_DEFAULTS.slingshot.maxPullback);
    assert.equal(slingshot.minPullback, LEVEL_DEFAULTS.slingshot.minPullback);
    assert.equal(slingshot.velocityMultiplier, LEVEL_DEFAULTS.slingshot.velocityMultiplier);
});

test('delayed pointing arrows reveal the configured target without a loader error', () => {
    const timers = createTimeoutFixture();

    withGlobalOverrides({ setTimeout: timers.setTimeout }, () => {
        const arrow = GameObjectFactory.create({
            type: 'pointingarrow',
            position: { x: 10, y: 20 },
            properties: {
                pointingAt: { x: 80, y: 90 },
                pointAfterDelay: 1.5
            }
        });
        assert.equal(arrow.visible, false);
        assert.equal(timers.scheduled[0].delay, 1500);
        assert.doesNotThrow(() => timers.scheduled[0].callback());
        assert.equal(arrow.visible, true);
        assert.deepEqual(arrow.pointingAt, { x: 80, y: 90 });
    });
});

test('a playing Game frame invokes the penguin simulation exactly once', () => {
    let genericPenguinUpdates = 0;
    let simulationUpdates = 0;
    const penguin = {
        state: 'soaring',
        position: { x: 100, y: 300 },
        update: () => genericPenguinUpdates++
    };
    const game = createGameFixture({
        state: GameState.PLAYING,
        gameObjects: [penguin],
        penguin,
        updateGameObjects: Game.prototype.updateGameObjects,
        updateSimulation: () => {
            simulationUpdates++;
            return { events: [] };
        }
    });

    Game.prototype.update.call(game, 1 / 60);

    assert.equal(genericPenguinUpdates, 0);
    assert.equal(simulationUpdates, 1);
});

test('planet collision preserves the crashed penguin and immediately resets the launcher', () => {
    const calls = [];
    const penguin = {
        state: 'soaring',
        beginCrash: () => {
            penguin.state = 'crashed';
            calls.push('crash');
        }
    };
    const game = {
        penguin,
        planets: [{}],
        bonuses: [],
        playSound: () => {},
        endRecordingShotPath: () => calls.push('path-ended'),
        preserveCrashedPenguin: () => calls.push(`preserved-${penguin.state}`),
        tryAgain: () => {
            penguin.state = 'idle';
            calls.push('ready');
        },
        updateUI: () => {}
    };

    applyGameSimulationEvents(game, [{
        type: SimulationEventType.PLANET_COLLISION,
        planetIndex: 0
    }], 1 / 60);

    assert.equal(penguin.state, 'idle');
    assert.deepEqual(calls, ['crash', 'path-ended', 'preserved-crashed', 'ready']);
});

test('detached crashed penguins continue moving without controlling the launcher', () => {
    const crashed = Object.assign(Object.create(Penguin.prototype), {
        x: 100,
        y: 100,
        vx: 60,
        vy: 0,
        radius: 8,
        crashedFrameCount: 2,
        isSpinning: false,
        currentAnimation: null,
        currentAnimationType: 'xc'
    });
    const stage = { x: 0, y: 0, width: 800, height: 600 };

    assert.equal(crashed.updateDetachedCrash(1 / 60, [], stage), true);
    assert.equal(crashed.x, 101);
    assert.equal(crashed.updateDetachedCrash(1 / 60, [], stage), false);
});

test('Kevin cam follows the off-screen arrow and renders in the bottom-left inset', () => {
    const { calls, context } = createRecordingContext();
    let penguinDraws = 0;
    const game = createGameFixture({
        canvas: { width: 800, height: 600 },
        ctx: context,
        arrow: { visible: false },
        penguin: {
            x: 900,
            y: 300,
            state: 'soaring',
            draw: () => penguinDraws++
        },
        kevinCam: {
            widthRatio: 0.22,
            aspectRatio: 4 / 3,
            minWidth: 140,
            maxWidth: 200,
            margin: 12,
            headerHeight: 25,
            zoom: 2.2
        }
    });

    Game.prototype.drawKevinCam.call(game);
    assert.equal(calls.length, 0);
    assert.equal(penguinDraws, 0);

    game.arrow.visible = true;
    Game.prototype.drawKevinCam.call(game);

    assert.equal(penguinDraws, 1);
    assert.deepEqual(calls.find(call => call[0] === 'strokeRect'), ['strokeRect', 13.5, 457.5, 173, 129]);
    assert.equal(
        calls.filter(call => call[0] === 'fillText').map(call => call[1]).join(''),
        'kEvIn cAm'
    );

    const callsBeforeDisabling = calls.length;
    game.settingsManager = { get: key => key !== 'kevinCamEnabled' };
    Game.prototype.drawKevinCam.call(game);
    assert.equal(calls.length, callsBeforeDisabling);
    assert.equal(penguinDraws, 1);
});

test('main Kevin render is clipped to the playfield', () => {
    const { calls, context } = createRecordingContext();
    let penguinDraws = 0;
    const game = createGameFixture({
        ctx: context,
        stageRect: { x: 0, y: 0, width: 800, height: 600 },
        penguin: { draw: () => penguinDraws++ }
    });

    Game.prototype.drawPenguinInPlayfield.call(game);

    assert.equal(penguinDraws, 1);
    assert.deepEqual(calls, [
        ['save'],
        ['beginPath'],
        ['rect', 0, 0, 800, 600],
        ['clip'],
        ['restore']
    ]);
});

test('real Penguin rendering draws a preprocessed frame without pixel-buffer work', () => {
    const calls = [];
    const cachedFrame = { kind: 'cached-frame' };
    const context = {
        imageSmoothingEnabled: true,
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        translate: (...args) => calls.push(['translate', ...args]),
        scale: (...args) => calls.push(['scale', ...args]),
        drawImage: (...args) => calls.push(['drawImage', ...args])
    };
    const penguin = Object.assign(Object.create(Penguin.prototype), {
        x: 125,
        y: 240,
        aniFrame: 1,
        currentAnimationType: 'xc',
        metadata: {
            xc: {
                frame_width: 23,
                frame_height: 31,
                registration_points: [[10, 12], [11, 11]]
            }
        },
        processedSpriteFrames: { xc: [{}, cachedFrame] }
    });

    penguin.drawRealSprite(context);

    assert.deepEqual(calls, [
        ['save'],
        ['translate', 125, 240],
        ['translate', -11, -11],
        ['scale', 1.2, 1.2],
        ['drawImage', cachedFrame, 0, 0],
        ['restore']
    ]);
});

test('a penguin that hits the target is not rendered', () => {
    const penguin = Object.assign(Object.create(Penguin.prototype), {
        state: 'hitTarget'
    });
    let drawCalls = 0;
    const context = new Proxy({}, {
        get() {
            drawCalls += 1;
            return () => {};
        }
    });

    penguin.draw(context);
    assert.equal(drawCalls, 0);
});

test('confirmation modal defaults to cancel and supports keyboard selection', () => {
    const selections = [];
    const documentFixture = {
        ...globalThis.document,
        createElement: () => ({
            getContext: () => ({
                font: '',
                measureText: text => ({ width: text.length * 8 })
            })
        })
    };

    withGlobalOverrides({ document: documentFixture }, () => {
        const manager = new UIManager({ getContext: () => ({}) }, null);
        const modal = manager.showConfirmation({
            title: 'Return to Menu?',
            message: 'Current progress will be lost.',
            onConfirm: () => selections.push('confirm'),
            onCancel: () => selections.push('cancel')
        });

        assert.equal(modal.selectedAction, 1);
        assert.equal(manager.handleKeyPress({ code: 'Escape' }), true);
        assert.deepEqual(selections, ['cancel']);
        assert.equal(manager.activeScreens.length, 0);

        const secondModal = manager.showConfirmation({
            onConfirm: () => selections.push('confirm'),
            onCancel: () => selections.push('cancel')
        });
        assert.equal(manager.handleKeyPress({ code: 'ArrowLeft' }), true);
        assert.equal(secondModal.selectedAction, 0);
        assert.equal(manager.handleKeyPress({ code: 'Enter' }), true);
        assert.deepEqual(selections, ['cancel', 'confirm']);
        assert.equal(manager.activeScreens.length, 0);
    });
});

test('trajectory lines and trail marks are clipped to the playfield', () => {
    const { calls, context } = createRecordingContext();
    const rendered = [];
    const game = createGameFixture({
        ctx: context,
        stageRect: { x: 0, y: 0, width: 800, height: 600 },
        drawAllShotPaths: () => rendered.push('shot paths'),
        drawAlphaMasks: () => rendered.push('alpha masks'),
        physics: { drawTrace: () => rendered.push('physics trace') }
    });

    Game.prototype.drawPlayfieldTraces.call(game);

    assert.deepEqual(rendered, ['shot paths', 'alpha masks', 'physics trace']);
    assert.deepEqual(calls, [
        ['save'],
        ['beginPath'],
        ['rect', 0, 0, 800, 600],
        ['clip'],
        ['restore']
    ]);
});

test('alpha-mask rendering draws the canvas cached at launch without pixel-buffer work', () => {
    const calls = [];
    const renderCanvas = { kind: 'colored-alpha-mask' };
    const context = {
        globalAlpha: 1,
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        translate: (...args) => calls.push(['translate', ...args]),
        drawImage: (...args) => calls.push(['drawImage', ...args])
    };
    const game = {
        penguin: { x: 120, y: 230 },
        shotColors: ['#ff00aa'],
        currentColorIndex: 0,
        alphaMasks: [],
        getColoredAlphaMaskCanvas: color => {
            assert.equal(color, '#ff00aa');
            return renderCanvas;
        }
    };

    Game.prototype.createAlphaMaskAtLaunchPosition.call(game);
    Game.prototype.drawAlphaMasks.call(game, context);

    assert.equal(game.alphaMasks[0].renderCanvas, renderCanvas);
    assert.deepEqual(calls, [
        ['save'],
        ['translate', 120, 230],
        ['drawImage', renderCanvas, -8, -13],
        ['restore']
    ]);
});

test('director launch preserves the release point for the alpha-mask marker', () => {
    let markerPosition = null;
    const game = {
        penguin: {
            x: 175,
            y: 265,
            setPosition(x, y) { this.x = x; this.y = y; },
            launch() {},
            setState() {}
        },
        slingshot: {
            launchModel: 'director',
            position: { x: 100, y: 300 },
            anchor: { x: 100, y: 300 },
            maxPullback: 100,
            minPullback: 0,
            sourceFrameRate: 30,
            coordinateScale: 1
        },
        launches: [],
        tries: 0,
        resetSimulationSpeedControl() {},
        recordRunLaunch() {},
        createAlphaMaskAtLaunchPosition(position) { markerPosition = position; },
        invalidateSimulationState() {},
        updateUI() {},
        playSound() {},
        physics: { clearTrace() {} },
        startRecordingShotPath() {}
    };
    const releasePosition = { x: 175, y: 265 };

    Game.prototype.launchPenguin.call(
        game,
        { x: 300, y: -140 },
        { angle: 335, power: 82 }
    );

    assert.deepEqual(markerPosition, releasePosition);
    assert.notDeepEqual({ x: game.penguin.x, y: game.penguin.y }, releasePosition);
});

test('main starfield wraps with layered drift independent of Kevin', () => {
    const { calls, context } = createRecordingContext();
    const game = createGameFixture({
        canvas: { width: 800, height: 600 },
        ctx: context,
        starfieldTime: 5,
        starDriftSpeed: { x: 2, y: 0.4 },
        stars: [
            { x: 5, y: 6, size: 3 },
            { x: 200, y: 100, size: 1 }
        ]
    });

    Game.prototype.drawStars.call(game);

    assert.deepEqual(calls.filter(call => call[0] === 'fillRect'), [
        ['fillRect', 35, 12, 3, 3],
        ['fillRect', 210, 102, 1, 1]
    ]);
    assert.equal(game.ctx.globalAlpha, 1);
});

test('main playfield star generator populates a visible background', () => {
    const game = createGameFixture({
        canvas: { width: 800, height: 600 },
        stars: []
    });

    Game.prototype.generateStars.call(game);

    assert.equal(game.stars.length, 100);
    assert.equal(game.stars.every(star => (
        star.x >= 0 && star.x < 800 &&
        star.y >= 0 && star.y < 600 &&
        star.size >= 1 && star.size <= 3
    )), true);
});

test('GameManager resume is idempotent and pause cancels the only RAF', () => {
    const animationFrames = createAnimationFrameFixture();

    withGlobalOverrides({
        requestAnimationFrame: animationFrames.requestAnimationFrame,
        cancelAnimationFrame: animationFrames.cancelAnimationFrame
    }, () => {
        const manager = Object.create(GameManager.prototype);
        Object.assign(manager, {
            assetsLoaded: true,
            isPageVisible: true,
            isRunning: false,
            animationFrameId: null,
            lastTime: 123,
            simulationAccumulator: 0.01
        });

        manager.resume();
        manager.resume();

        assert.equal(animationFrames.requested.length, 1);
        assert.equal(manager.animationFrameId, 1);
        assert.equal(manager.lastTime, 0);
        assert.equal(manager.simulationAccumulator, 0);

        manager.pause();
        manager.pause();

        assert.deepEqual(animationFrames.cancelled, [1]);
        assert.equal(manager.animationFrameId, null);
        assert.equal(manager.isRunning, false);
    });
});

test('GameManager accumulates high-refresh frames into exact 60 Hz simulation steps', () => {
    const animationFrames = createAnimationFrameFixture();
    const updates = [];
    let renders = 0;

    withGlobalOverrides({
        requestAnimationFrame: animationFrames.requestAnimationFrame
    }, () => {
        const manager = Object.create(GameManager.prototype);
        Object.assign(manager, {
            isRunning: true,
            isPageVisible: true,
            animationFrameId: 1,
            lastTime: 1000,
            simulationAccumulator: 0,
            assetsLoaded: true,
            inputManager: null,
            performanceUtils: { recordFrameTime: () => {} },
            game: {
                state: GameState.PLAYING,
                levelEditor: null,
                update: deltaTime => updates.push(deltaTime),
                render: () => renders++
            }
        });

        manager.gameLoop(1000 + 1000 / 120);
        assert.deepEqual(updates, []);
        assert.equal(renders, 1);

        manager.gameLoop(1000 + 2000 / 120);
        assert.deepEqual(updates, [1 / 60]);
        assert.equal(renders, 2);

        manager.gameLoop(1000 + 4000 / 120);
        assert.deepEqual(updates, [1 / 60, 1 / 60]);
        assert.equal(renders, 3);
    });
});

test('GameManager carries irregular frame remainders without variable simulation steps', () => {
    const animationFrames = createAnimationFrameFixture();
    const updates = [];

    withGlobalOverrides({
        requestAnimationFrame: animationFrames.requestAnimationFrame
    }, () => {
        const manager = Object.create(GameManager.prototype);
        Object.assign(manager, {
            isRunning: true,
            isPageVisible: true,
            animationFrameId: 1,
            lastTime: 1000,
            simulationAccumulator: 0,
            assetsLoaded: true,
            inputManager: null,
            performanceUtils: { recordFrameTime: () => {} },
            game: {
                state: GameState.PLAYING,
                levelEditor: null,
                update: deltaTime => updates.push(deltaTime),
                render: () => {}
            }
        });

        for (const currentTime of [1007, 1019, 1028, 1041, 1050]) {
            manager.gameLoop(currentTime);
        }

        assert.deepEqual(updates, [1 / 60, 1 / 60, 1 / 60]);
        assert.ok(Math.abs(manager.simulationAccumulator) < 1e-12);
    });
});

test('Game fast-forward unlocks after five soaring seconds and resets on terminal state', () => {
    const classes = new Set();
    const button = {
        style: {},
        classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
        setAttribute(name, value) { this[name] = value; }
    };
    const game = Object.create(Game.prototype);
    Object.assign(game, {
        penguin: { state: 'soaring' },
        simulationSpeed: 1,
        soaringElapsedTime: 0,
        simulationSpeedButton: button
    });

    game.updateSimulationSpeedControl(4.99);
    assert.equal(button.style.display, 'none');
    game.updateSimulationSpeedControl(0.01);
    assert.equal(button.style.display, 'block');

    game.simulationSpeed = 2;
    game.updateSimulationSpeedButton();
    assert.equal(game.getSimulationSpeedMultiplier(), 2);
    assert.equal(classes.has('is-active'), true);

    game.penguin.state = 'crashed';
    game.updateSimulationSpeedControl(1 / 60);
    assert.equal(game.getSimulationSpeedMultiplier(), 1);
    assert.equal(game.soaringElapsedTime, 0);
    assert.equal(button.style.display, 'none');
});

test('Stellar Mode starts at the fast-forward unlock and stops with the attempt', () => {
    let starts = 0;
    let stops = 0;
    const button = {
        style: {},
        classList: { toggle() {} },
        setAttribute() {}
    };
    const game = Object.create(Game.prototype);
    Object.assign(game, {
        penguin: { state: 'soaring' },
        simulationSpeed: 1,
        soaringElapsedTime: 0,
        simulationSpeedButton: button,
        settingsManager: { get: key => key === 'stellarModeEnabled' },
        audioManager: {
            playStellarMusic: () => { starts++; },
            stopStellarMusic: () => { stops++; }
        }
    });

    game.updateSimulationSpeedControl(4.99);
    assert.equal(starts, 0);
    game.updateSimulationSpeedControl(0.01);
    assert.equal(starts, 1);
    game.resetSimulationSpeedControl();
    assert.equal(stops, 1);
});

test('Stellar music crossfades the regular background music out and back in', () => {
    const ramps = [];
    const gain = {
        value: 0.4,
        cancelScheduledValues() {},
        setValueAtTime(value) { this.value = value; },
        linearRampToValueAtTime(value, time) { ramps.push({ value, time }); }
    };
    const audio = Object.create(AudioManager.prototype);
    Object.assign(audio, {
        audioContext: { currentTime: 10 },
        backgroundMusicGain: { gain },
        backgroundMusicSuppressed: false,
        backgroundMusicDimmed: false,
        masterVolume: AUDIO_CONFIG.defaultMasterVolume
    });

    audio.setBackgroundMusicSuppressed(true);
    assert.deepEqual(ramps.at(-1), {
        value: 0,
        time: 10 + AUDIO_CONFIG.stellarMusic.fadeSeconds
    });

    audio.setBackgroundMusicSuppressed(false);
    assert.deepEqual(ramps.at(-1), {
        value: AUDIO_CONFIG.backgroundMusic.volume * AUDIO_CONFIG.defaultMasterVolume,
        time: 10 + AUDIO_CONFIG.stellarMusic.fadeSeconds
    });
});

test('GameManager double speed runs two fixed simulation steps per display interval', () => {
    const animationFrames = createAnimationFrameFixture();
    const updates = [];

    withGlobalOverrides({ requestAnimationFrame: animationFrames.requestAnimationFrame }, () => {
        const manager = Object.create(GameManager.prototype);
        Object.assign(manager, {
            isRunning: true,
            isPageVisible: true,
            animationFrameId: 1,
            lastTime: 1000,
            simulationAccumulator: 0,
            assetsLoaded: true,
            inputManager: null,
            performanceUtils: { recordFrameTime: () => {} },
            game: {
                state: GameState.PLAYING,
                levelEditor: null,
                getSimulationSpeedMultiplier: () => 2,
                update: deltaTime => updates.push(deltaTime),
                render: () => {}
            }
        });

        manager.gameLoop(1000 + 1000 / 60);
        assert.deepEqual(updates, [1 / 60, 1 / 60]);
    });
});

test('paused input policy matches paused events while gameplay declines them', () => {
    const game = { state: GameState.PAUSED, levelEditor: { active: false } };
    const canvas = createEventTargetFixture();
    const root = { game, canvas };
    const manager = new InputManager(root);
    registerDefaultInputContexts(manager, root);

    assert.equal(manager.registrations.get('paused').context.matches(), true);
    assert.equal(manager.registrations.get('gameplay').context.matches(), false);

    manager.destroy();
});

test('headless baseline can complete the simple straight-line level', () => {
    const engine = new HeadlessGameEngine();
    engine.loadLevel({
        startPosition: { x: 100, y: 300 },
        objects: [
            {
                type: 'slingshot',
                position: { x: 100, y: 300 },
                properties: { velocityMultiplier: 15 }
            },
            {
                type: 'target',
                position: { x: 750, y: 300 },
                properties: { width: 80, height: 80 }
            }
        ]
    });

    const result = engine.simulateTrajectory(0, 300, 20);

    assert.equal(result.success, true);
    assert.equal(result.reason, 'target_hit');
});

test('headless trajectories allow extended orbit time by default', () => {
    const engine = new HeadlessGameEngine();

    assert.equal(DEFAULT_MAX_SIMULATION_TIME, 120);
    assert.equal(engine.maxSimulationTime, DEFAULT_MAX_SIMULATION_TIME);
});

test('all-bonuses headless mode rejects target hits that miss a bonus', () => {
    const level = {
        startPosition: { x: 100, y: 300 },
        objects: [
            {
                type: 'slingshot',
                position: { x: 100, y: 300 },
                properties: { velocityMultiplier: 15 }
            },
            {
                type: 'target',
                position: { x: 750, y: 300 },
                properties: { width: 80, height: 80 }
            },
            {
                type: 'bonus',
                position: { x: 400, y: 500 },
                properties: { id: 'off_route', value: 3000 }
            }
        ]
    };
    const normalEngine = new HeadlessGameEngine();
    normalEngine.loadLevel(level);
    const strictEngine = new HeadlessGameEngine({ requireAllBonuses: true });
    strictEngine.loadLevel(level);

    assert.equal(normalEngine.simulateTrajectory(0, 300, 20).success, true);
    const strictResult = strictEngine.simulateTrajectory(0, 300, 20);
    assert.equal(strictResult.success, false);
    assert.equal(strictResult.reason, 'target_blocked');
    assert.equal(strictResult.requiredBonuses, 1);
    assert.deepEqual(strictResult.collectedBonuses, []);
});

test('all-bonuses headless mode accepts a route that collects every bonus', () => {
    const engine = new HeadlessGameEngine({ requireAllBonuses: true });
    engine.loadLevel({
        startPosition: { x: 100, y: 300 },
        objects: [
            {
                type: 'slingshot',
                position: { x: 100, y: 300 },
                properties: { velocityMultiplier: 15 }
            },
            {
                type: 'target',
                position: { x: 750, y: 300 },
                properties: { width: 80, height: 80 }
            },
            {
                type: 'bonus',
                position: { x: 400, y: 300 },
                properties: { id: 'on_route', value: 3000 }
            }
        ]
    });

    const result = engine.simulateTrajectory(0, 300, 20);
    assert.equal(result.success, true);
    assert.equal(result.reason, 'target_hit');
    assert.deepEqual(result.collectedBonuses, ['on_route']);
});

test('parallel trajectory workers preserve the all-bonuses requirement', async () => {
    const engine = new HeadlessGameEngine({ requireAllBonuses: true });
    engine.loadLevel({
        startPosition: { x: 100, y: 300 },
        objects: [
            {
                type: 'slingshot',
                position: { x: 100, y: 300 },
                properties: { velocityMultiplier: 15 }
            },
            {
                type: 'target',
                position: { x: 750, y: 300 },
                properties: { width: 80, height: 80 }
            },
            {
                type: 'bonus',
                position: { x: 400, y: 500 },
                properties: { id: 'off_route', value: 3000 }
            }
        ]
    });

    const results = await engine.findWorkingTrajectoriesAsync(
        [0, 0],
        [300, 300],
        2,
        20,
        { workers: 2, nearMissLimit: 5 }
    );

    assert.deepEqual(results, []);
    assert.equal(engine.lastNearMisses.length, 2);
    assert.equal(engine.lastNearMisses.every(result => result.reason === 'target_blocked'), true);
    assert.equal(engine.lastNearMisses.every(result => Number.isFinite(result.targetDistance)), true);
});

test('all-bonuses summary explicitly reports and prints the closest trajectories', () => {
    const lines = [];
    const nearMisses = [
        {
            angle: 12.5,
            power: 42,
            collectedBonuses: ['one', 'two'],
            targetDistance: 8.25,
            reason: 'target_blocked',
            distance: 900
        },
        {
            angle: 15,
            power: 40,
            collectedBonuses: ['one'],
            targetDistance: 20,
            reason: 'planet_collision',
            distance: 700
        }
    ];

    withGlobalOverrides({
        console: { ...console, log: message => lines.push(String(message)) }
    }, () => printLevelSummary({
        levelPath: 'fixture.json',
        requireAllBonuses: true,
        totalBonuses: 3,
        successfulTrajectories: 0,
        totalSamples: 100,
        showingClosest: true,
        allResults: nearMisses,
        asciiMaps: [],
        duration: 0.25
    }, false, false));

    assert.equal(lines.includes('No trajectory collected all 3 bonuses and hit the target.'), true);
    assert.equal(lines.includes('Closest 2 trajectories:'), true);
    assert.equal(lines.some(line => (
        line.includes('bonuses=2/3') &&
        line.includes('targetDistance=8.25') &&
        line.includes('outcome=target_blocked')
    )), true);
});

test('headless loader resolves object-linked orbits in level 10', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/manual/level10.json', import.meta.url), 'utf8'));
    const engine = new HeadlessGameEngine();

    assert.equal(engine.loadLevel(level), true);
    assert.doesNotThrow(() => engine.simulateTrajectory(0, 10, 0.1));

    const orbitingPlanet = engine.initialState.planets[0];
    assert.equal(orbitingPlanet.orbit.targetId, 'planet_4');
    assert.equal(orbitingPlanet.orbit.angle, 43.072066666667155);
    assert.equal(engine.physics.planets[1].gravitationalReach, 5000);
});

test('level 12 preserves its tuned collision radii', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/manual/level12.json', import.meta.url), 'utf8'));
    const engine = new HeadlessGameEngine();
    engine.loadLevel(level);

    assert.equal(engine.initialState.planets[0].collisionRadius, 62.8);
    assert.equal(engine.initialState.planets[1].collisionRadius, 65.8);
});

test('level 8 legacy zero reaches retain normal planet gravity', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/manual/level8.json', import.meta.url), 'utf8'));
    const engine = new HeadlessGameEngine();
    engine.loadLevel(level);

    assert.ok(engine.initialState.planets.length > 0);
    assert.equal(engine.initialState.planets.every(planet => planet.gravitationalReach === 5000), true);
    assert.equal(engine.physics.planets.every(planet => planet.gravitationalReach === 5000), true);
});

test('headless launch power follows the production nonlinear pullback curve', () => {
    const penguin = new HeadlessPenguin(0, 0);
    penguin.launch(0, 100, { velocityMultiplier: 8, maxPullback: 100 });

    assert.equal(penguin.velocity.x, 640);
    assert.equal(penguin.velocity.y, 0);
});

test('ASCII trajectory output plots the route and level landmarks', () => {
    const output = renderAsciiTrajectory({
        objects: [
            { type: 'slingshot', position: { x: 0, y: 0 }, properties: {} },
            { type: 'planet', position: { x: 50, y: 20 }, properties: {} },
            {
                type: 'planet',
                position: { x: 75, y: 20 },
                properties: { orbit: { orbitTargetId: 'root', orbitRadius: 25, orbitSpeed: 1 } }
            },
            { type: 'target', position: { x: 100, y: 0 }, properties: {} }
        ]
    }, {
        angle: 0,
        power: 50,
        trajectory: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
        finalPosition: { x: 100, y: 0 }
    }, 30, 10);

    assert.match(output, /S/);
    assert.match(output, /T/);
    assert.match(output, /O/);
    assert.match(output, /o/);
    assert.match(output, /\. flight path/);
    assert.match(output, /^\/launch 0 50/m);
});

test('ASCII launch commands reload the level and fire the exact sampled angle and power', () => {
    const calls = [];
    const game = createGameFixture({
        level: 7,
        slingshot: {
            velocityMultiplier: 15,
            maxPullback: 100,
            minPullback: 10
        },
        loadLevel: level => calls.push(['loadLevel', level]),
        setState: state => calls.push(['setState', state]),
        launchPenguin: velocity => calls.push(['launchPenguin', velocity])
    });

    const velocity = Game.prototype.launchTestTrajectory.call(game, 12.3456789, 67.8901234);

    assert.deepEqual(calls.slice(0, 2), [
        ['loadLevel', 7],
        ['setState', GameState.PLAYING]
    ]);
    assert.deepEqual(calls[2], ['launchPenguin', velocity]);

    let launched = null;
    let hidden = false;
    Console.prototype.launchTrajectory.call({
        game: { launchTestTrajectory: (angle, power) => launched = { angle, power } },
        hide: () => hidden = true,
        log: () => assert.fail('valid launch command should not log an error')
    }, ['12.3456789', '67.8901234']);

    assert.deepEqual(launched, { angle: 12.3456789, power: 67.8901234 });
    assert.equal(hidden, true);
});

test('the /last console command repeats the most recent launch', () => {
    const launches = [];
    const consoleFixture = {
        game: {
            launches: [{ angle: 12.3456789, power: 67.8901234 }],
            launchTestTrajectory: (angle, power) => launches.push({ angle, power })
        },
        hide: () => {},
        launchTrajectory: Console.prototype.launchTrajectory
    };

    Console.prototype.repeatLastLaunch.call(consoleFixture);

    assert.deepEqual(launches, [{ angle: 12.3456789, power: 67.8901234 }]);
});

test('the /last console command reports when there is no previous launch', () => {
    const messages = [];
    Console.prototype.repeatLastLaunch.call({
        game: { launches: [] },
        log: message => messages.push(message)
    });

    assert.deepEqual(messages, ['No launch to repeat. Use /launch [angle] [power] first.']);
});

test('submitting a console launch cannot bubble Enter into gameplay', () => {
    let keydownHandler = null;
    let submitted = null;
    let propagationStopped = false;
    let defaultPrevented = false;
    const consoleFixture = {
        input: {
            value: '/launch 48.04387568555759 53.76599634369287',
            addEventListener: (type, handler) => {
                if (type === 'keydown') keydownHandler = handler;
            }
        },
        executeCommand(command) {
            assert.equal(propagationStopped, true);
            submitted = command;
        },
        navigateHistory: () => {}
    };
    Console.prototype.setupEventListeners.call(consoleFixture);

    keydownHandler({
        key: 'Enter',
        preventDefault: () => defaultPrevented = true,
        stopPropagation: () => propagationStopped = true
    });

    assert.equal(defaultPrevented, true);
    assert.equal(propagationStopped, true);
    assert.equal(submitted, '/launch 48.04387568555759 53.76599634369287');
    assert.equal(consoleFixture.input.value, '');
});

test('ASCII trajectory samples prioritize collected bonuses before distance', () => {
    const results = [
        { distance: 900, collectedBonuses: ['bonus_1'] },
        { distance: 500, collectedBonuses: ['bonus_1', 'bonus_2'] },
        { distance: 700, collectedBonuses: ['bonus_1', 'bonus_2'] }
    ];

    results.sort(compareAsciiTrajectoryResults);

    assert.deepEqual(results.map(result => result.distance), [700, 500, 900]);
});

test('ASCII trajectory samples favor distinct high-scoring routes over near-duplicates', () => {
    const route = (score, distance, offset) => ({
        score,
        distance,
        trajectory: [
            { x: 0, y: offset },
            { x: 200, y: offset },
            { x: 400, y: offset }
        ],
        finalPosition: { x: 600, y: offset }
    });
    const best = route(1000, 900, 0);
    const nearDuplicate = route(990, 850, 4);
    const distinctSecond = route(980, 800, 100);
    const distinctThird = route(970, 700, 200);

    const selected = selectDiverseAsciiResults([
        nearDuplicate,
        distinctThird,
        best,
        distinctSecond
    ], 3);

    assert.deepEqual(selected, [best, distinctSecond, distinctThird]);
});
