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
const Console = (await import('../js/console.js')).default;
const { GameManager } = await import('../js/main.js');
const { InputActionManager } = await import('../js/inputActions.js');
const { LevelEndScreen } = await import('../js/levelEndScreen.js');
const LevelEditor = (await import('../js/levelEditor.js')).default;
const { OrbitSystem, Slingshot, Target, TextObject } = await import('../js/gameObjects.js');
const { LEVEL_DEFAULTS } = await import('../js/config/gameConfig.js');
const { GameObjectFactory } = await import('../js/levelLoader.js');
const {
    DEFAULT_MAX_SIMULATION_TIME,
    HeadlessGameEngine,
    HeadlessPenguin
} = await import('./headlessEngine.js');
const {
    compareAsciiTrajectoryResults,
    renderAsciiTrajectory,
    selectDiverseAsciiResults
} = await import('./levelTester.js');

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

test('level export uses editor-authored root metadata', () => {
    const game = {
        level: 1,
        levelMetadata: { name: 'Root settings test', description: 'Saved from the editor' },
        levelRules: null,
        slingshot: { position: { x: 100, y: 200 } },
        penguin: null,
        target: { position: { x: 700, y: 300 } },
        getAllObjectsForExport: () => []
    };

    const exported = Game.prototype.exportCurrentLevel.call(game);

    assert.equal(exported.name, 'Root settings test');
    assert.equal(exported.description, 'Saved from the editor');
});

test('text factory restores an explicitly exported wrap limit', () => {
    const textObject = GameObjectFactory.createTextObject({ x: 10, y: 20 }, {
        content: 'Tutorial text',
        width: 360,
        padding: 10,
        maxWidth: 340
    });

    assert.equal(textObject.width, 360);
    assert.equal(textObject.maxWidth, 340);
});

test('planet factory respects an explicit collision radius', () => {
    const planet = GameObjectFactory.createPlanet({ x: 100, y: 200 }, {
        radius: 65.8413472395633,
        collisionRadius: 62.8,
        mass: 128.841347239563
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

    const game = {
        addDiscoveredProperties: Game.prototype.addDiscoveredProperties,
        isInternalProperty: Game.prototype.isInternalProperty
    };
    const properties = Game.prototype.extractAllProperties.call(game, textObject);

    assert.equal(properties.width, 360);
});

test('level export derives canonical object types from the shared schema', () => {
    const textObject = new TextObject(10, 20, 'Tutorial text');
    const game = {
        getObjectCoordinates: Game.prototype.getObjectCoordinates,
        extractAllProperties: Game.prototype.extractAllProperties,
        addDiscoveredProperties: Game.prototype.addDiscoveredProperties,
        isInternalProperty: Game.prototype.isInternalProperty,
        exportOrbitSystem: Game.prototype.exportOrbitSystem
    };

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
        const arrow = GameObjectFactory.createPointingArrow({ x: 10, y: 20 }, {
            pointingAt: { x: 80, y: 90 },
            pointAfterDelay: 1.5
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
            lastTime: 123
        });

        manager.resume();
        manager.resume();

        assert.equal(animationFrames.requested.length, 1);
        assert.equal(manager.animationFrameId, 1);
        assert.equal(manager.lastTime, 0);

        manager.pause();
        manager.pause();

        assert.deepEqual(animationFrames.cancelled, [1]);
        assert.equal(manager.animationFrameId, null);
        assert.equal(manager.isRunning, false);
    });
});

test('paused input context keeps keyboard/UI active but disables gameplay listeners', () => {
    const game = { state: GameState.PAUSED, levelEditor: { active: false } };
    const canvas = createEventTargetFixture();
    const manager = new InputActionManager({ game, canvas });

    manager.updateActiveActions();

    assert.equal(manager.activeActions.has('keyboard'), true);
    assert.equal(manager.activeActions.has('ui'), true);
    assert.equal(manager.activeActions.has('gameplay'), false);

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
        { workers: 2 }
    );

    assert.deepEqual(results, []);
});

test('headless loader resolves object-linked orbits in level 10', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/level10.json', import.meta.url), 'utf8'));
    const engine = new HeadlessGameEngine();

    assert.equal(engine.loadLevel(level), true);
    assert.doesNotThrow(() => engine.simulateTrajectory(0, 10, 0.1));

    const orbitingPlanet = engine.initialState.planets[0];
    assert.equal(orbitingPlanet.orbit.targetId, 'planet_4');
    assert.equal(orbitingPlanet.orbit.angle, 43.072066666667155);
    assert.equal(engine.physics.planets[1].gravitationalReach, 5000);
});

test('level 12 preserves its tuned collision radii', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/level12.json', import.meta.url), 'utf8'));
    const engine = new HeadlessGameEngine();
    engine.loadLevel(level);

    assert.equal(engine.initialState.planets[0].collisionRadius, 62.8);
    assert.equal(engine.initialState.planets[1].collisionRadius, 65.8);
});

test('level 8 legacy zero reaches retain normal planet gravity', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/level8.json', import.meta.url), 'utf8'));
    const engine = new HeadlessGameEngine();
    engine.loadLevel(level);

    assert.ok(engine.initialState.planets.length > 0);
    assert.equal(engine.initialState.planets.every(planet => planet.gravitationalReach === 5000), true);
    assert.equal(engine.physics.planets.every(planet => planet.gravitationalReach === 5000), true);
});

test('headless launch power follows the production nonlinear pullback curve', () => {
    const penguin = new HeadlessPenguin(0, 0);
    penguin.launch(0, 100, { velocityMultiplier: 8, maxPullback: 100 });

    assert.equal(penguin.velocity.x, 1280);
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
