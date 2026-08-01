import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './nodeShims.js';

const { integratePlanetGravity } = await import('../js/simulation.js');
const { Game, GameState } = await import('../js/game.js');
const { GameManager } = await import('../js/main.js');
const { InputActionManager } = await import('../js/inputActions.js');
const { HeadlessGameEngine, HeadlessPenguin } = await import('./headlessEngine.js');
const { renderAsciiTrajectory } = await import('./levelTester.js');

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
    const fakeGame = {
        state: GameState.PAUSED,
        deltaTime: 0,
        uiManager: { update: () => uiUpdates++ },
        updateGameObjects: () => worldUpdates++
    };

    Game.prototype.update.call(fakeGame, 1 / 60);

    assert.equal(uiUpdates, 1);
    assert.equal(worldUpdates, 0);
});

test('generic object updates skip the penguin dedicated simulation path', () => {
    let penguinUpdates = 0;
    let objectUpdates = 0;
    const penguin = { update: () => penguinUpdates++ };
    const ordinaryObject = { update: () => objectUpdates++ };
    const fakeGame = {
        penguin,
        gameObjects: [penguin, ordinaryObject]
    };

    Game.prototype.updateGameObjects.call(fakeGame, 1 / 60);

    assert.equal(penguinUpdates, 0);
    assert.equal(objectUpdates, 1);
});

test('a playing Game frame invokes the penguin simulation exactly once', () => {
    let genericPenguinUpdates = 0;
    let dedicatedPenguinUpdates = 0;
    const penguin = {
        state: 'soaring',
        position: { x: 100, y: 300 },
        update: () => genericPenguinUpdates++
    };
    const fakeGame = {
        state: GameState.PLAYING,
        deltaTime: 0,
        uiManager: { update() {} },
        gameObjects: [penguin],
        penguin,
        updateGameObjects: Game.prototype.updateGameObjects,
        updatePenguinPhysics: () => dedicatedPenguinUpdates++,
        target: { checkCollision: () => false },
        flightRect: { x: -400, y: -400, width: 1600, height: 1400 },
        isInBounds: () => true,
        levelRules: null
    };

    Game.prototype.update.call(fakeGame, 1 / 60);

    assert.equal(genericPenguinUpdates, 0);
    assert.equal(dedicatedPenguinUpdates, 1);
});

test('Kevin cam follows the off-screen arrow and renders in the bottom-left inset', () => {
    const calls = [];
    let penguinDraws = 0;
    const ctx = {
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        fillRect: (...args) => calls.push(['fillRect', ...args]),
        strokeRect: (...args) => calls.push(['strokeRect', ...args]),
        fillText: text => calls.push(['fillText', text]),
        translate: (...args) => calls.push(['translate', ...args]),
        rotate: angle => calls.push(['rotate', angle]),
        scale: (...args) => calls.push(['scale', ...args]),
        beginPath: () => calls.push(['beginPath']),
        rect: (...args) => calls.push(['rect', ...args]),
        clip: () => calls.push(['clip'])
    };
    const fakeGame = {
        canvas: { width: 800, height: 600 },
        ctx,
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
    };

    Game.prototype.drawKevinCam.call(fakeGame);
    assert.equal(calls.length, 0);
    assert.equal(penguinDraws, 0);

    fakeGame.arrow.visible = true;
    Game.prototype.drawKevinCam.call(fakeGame);

    assert.equal(penguinDraws, 1);
    assert.deepEqual(calls.find(call => call[0] === 'strokeRect'), ['strokeRect', 13.5, 457.5, 173, 129]);
    assert.equal(
        calls.filter(call => call[0] === 'fillText').map(call => call[1]).join(''),
        'kEvIn cAm'
    );
});

test('main starfield wraps with layered drift independent of Kevin', () => {
    const draws = [];
    const fakeGame = {
        canvas: { width: 800, height: 600 },
        ctx: {
            fillStyle: '',
            globalAlpha: 1,
            fillRect: (...args) => draws.push(args)
        },
        starfieldTime: 5,
        starDriftSpeed: { x: 2, y: 0.4 },
        stars: [
            { x: 5, y: 6, size: 3 },
            { x: 200, y: 100, size: 1 }
        ]
    };

    Game.prototype.drawStars.call(fakeGame);

    assert.deepEqual(draws, [
        [35, 12, 3, 3],
        [210, 102, 1, 1]
    ]);
    assert.equal(fakeGame.ctx.globalAlpha, 1);
});

test('main playfield star generator populates a visible background', () => {
    const fakeGame = {
        canvas: { width: 800, height: 600 },
        stars: []
    };

    Game.prototype.generateStars.call(fakeGame);

    assert.equal(fakeGame.stars.length, 100);
    assert.equal(fakeGame.stars.every(star => (
        star.x >= 0 && star.x < 800 &&
        star.y >= 0 && star.y < 600 &&
        star.size >= 1 && star.size <= 3
    )), true);
});

test('GameManager resume is idempotent and pause cancels the only RAF', () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const requested = [];
    const cancelled = [];

    globalThis.requestAnimationFrame = callback => {
        requested.push(callback);
        return requested.length;
    };
    globalThis.cancelAnimationFrame = id => cancelled.push(id);

    try {
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

        assert.equal(requested.length, 1);
        assert.equal(manager.animationFrameId, 1);
        assert.equal(manager.lastTime, 0);

        manager.pause();
        manager.pause();

        assert.deepEqual(cancelled, [1]);
        assert.equal(manager.animationFrameId, null);
        assert.equal(manager.isRunning, false);
    } finally {
        globalThis.requestAnimationFrame = originalRequestAnimationFrame;
        globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
});

test('paused input context keeps keyboard/UI active but disables gameplay listeners', () => {
    const game = { state: GameState.PAUSED, levelEditor: { active: false } };
    const canvas = {
        addEventListener() {},
        removeEventListener() {}
    };
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

test('headless loader resolves object-linked orbits in level 10', async () => {
    const level = JSON.parse(await readFile(new URL('../levels/level10.json', import.meta.url), 'utf8'));
    const engine = new HeadlessGameEngine();

    assert.equal(engine.loadLevel(level), true);
    assert.doesNotThrow(() => engine.simulateTrajectory(0, 10, 0.1));

    const orbitingPlanet = engine.physics.planets[0].sprite;
    const centerPlanet = engine.physics.planets[1].sprite;
    assert.equal(orbitingPlanet.orbit.center, centerPlanet);
    assert.equal(orbitingPlanet.initialOrbitTime, 43.072066666667155);
    assert.equal(engine.physics.planets[1].gravitationalReach, 0);
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
});
