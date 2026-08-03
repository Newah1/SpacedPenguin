import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import LiveLevelMutator from '../js/liveLevelMutator.js';
import LiveEditCommand from '../js/editorCommands/liveEditCommand.js';
import {
    createLiveEditHistory,
    LiveEditCommandType,
    liveEditCommandRegistry
} from '../js/editorCommands/index.js';
import LevelEditor from '../js/levelEditor.js';
import { LevelEditorInputAction } from '../js/inputActions.js';

class Planet {}
class Bonus {}
class Target {}

function createGame() {
    return {
        gameObjects: [],
        planets: [],
        bonuses: [],
        textObjects: [],
        pointingArrows: [],
        target: null,
        unrelated: [],
        physics: {
            planets: [],
            bonuses: [],
            addPlanet(object) { this.planets.push(object); },
            removePlanet(object) { this.planets = this.planets.filter(value => value !== object); },
            addBonus(object) { this.bonuses.push(object); },
            removeBonus(object) { this.bonuses = this.bonuses.filter(value => value !== object); }
        },
        addGameObject(object) { this.gameObjects.push(object); },
        removeGameObject(object) {
            this.gameObjects = this.gameObjects.filter(value => value !== object);
        }
    };
}

test('live mutator keeps runtime and physics collections synchronized', () => {
    const game = createGame();
    const mutator = new LiveLevelMutator(game);
    const planet = new Planet();
    const bonus = new Bonus();

    assert.equal(mutator.addObject(planet), true);
    assert.equal(mutator.addObject(bonus), true);
    assert.deepEqual(game.gameObjects, [planet, bonus]);
    assert.deepEqual(game.planets, [planet]);
    assert.deepEqual(game.bonuses, [bonus]);
    assert.deepEqual(game.physics.planets, [planet]);
    assert.deepEqual(game.physics.bonuses, [bonus]);

    assert.equal(mutator.removeObject(planet), true);
    assert.equal(mutator.removeObject(bonus), true);
    assert.deepEqual(game.gameObjects, []);
    assert.deepEqual(game.planets, []);
    assert.deepEqual(game.bonuses, []);
    assert.deepEqual(game.physics.planets, []);
    assert.deepEqual(game.physics.bonuses, []);
});

test('live mutator only touches registered collections and protects singletons', () => {
    const game = createGame();
    const mutator = new LiveLevelMutator(game);
    const target = new Target();
    const secondTarget = new Target();
    const unrelatedReference = { keep: true };
    game.unrelated.push(unrelatedReference);

    assert.equal(mutator.addObject(target), true);
    assert.equal(game.target, target);
    assert.equal(mutator.addObject(secondTarget), false);
    assert.deepEqual(game.gameObjects, [target]);

    mutator.removeObject(target);
    assert.equal(game.target, null);
    assert.deepEqual(game.unrelated, [unrelatedReference]);
});

test('editor-generated names and IDs fill gaps without collisions', () => {
    const editor = Object.create(LevelEditor.prototype);
    editor.game = createGame();
    editor.game.gameObjects.push(
        Object.assign(new Planet(), { name: 'Planet 1', id: 'planet_1' }),
        Object.assign(new Planet(), { name: 'Planet 3', id: 'planet_3' })
    );
    const next = new Planet();

    assert.equal(editor.generateObjectName(next, 'Planet'), 'Planet 2');
    assert.equal(editor.generateObjectId(next, 'Planet'), 'planet_2');
});

test('editor input uses one pointer event stream and no synthetic click pass', () => {
    const events = [];
    const canvas = {
        addEventListener(event) { events.push(event); },
        removeEventListener() {}
    };
    const action = new LevelEditorInputAction({ canvas, game: {} });

    action.setupListeners();

    assert.deepEqual(events, [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'contextmenu'
    ]);
    assert.equal(events.includes('click'), false);
    assert.equal(events.includes('mousedown'), false);
});

test('orbit clone data is restored before deserializeObject returns', () => {
    class Planet {
        constructor(x, y) {
            this.position = { x, y };
        }
    }
    const editor = Object.create(LevelEditor.prototype);
    editor.game = { assetLoader: null };
    const clone = editor.deserializeObject({
        className: 'Planet',
        properties: {
            position: { x: 10, y: 20 },
            orbitSystem: {
                orbitCenter: { x: 100, y: 200 },
                orbitRadius: 75,
                orbitSpeed: 2,
                orbitAngle: 0.5,
                orbitType: 'circular',
                orbitParams: {}
            }
        }
    }, Planet);

    assert.equal(clone.orbitSystem.orbitRadius, 75);
    assert.deepEqual(clone.orbitSystem.orbitCenter, { x: 100, y: 200 });
});

test('typed command strategies replay against the same live runtime object', () => {
    const game = createGame();
    const mutator = new LiveLevelMutator(game);
    const selections = [];
    const history = createLiveEditHistory({
        mutator,
        refresh: object => selections.push(object),
        updateOrbitSystem() {}
    }, 2);
    const planet = Object.assign(new Planet(), { position: { x: 10, y: 20 } });

    assert.equal(history.execute(LiveEditCommandType.ADD_OBJECT, { object: planet }), true);
    assert.deepEqual(game.planets, [planet]);
    assert.equal(history.undo(), true);
    assert.deepEqual(game.planets, []);
    assert.equal(history.redo(), true);
    assert.deepEqual(game.planets, [planet]);

    planet.position = { x: 30, y: 40 };
    history.recordExecuted(LiveEditCommandType.MOVE_OBJECT, {
        object: planet,
        before: { x: 10, y: 20 },
        after: { x: 30, y: 40 }
    });
    history.undo();
    assert.deepEqual(planet.position, { x: 10, y: 20 });
    history.redo();
    assert.deepEqual(planet.position, { x: 30, y: 40 });
    assert.equal(selections.at(-1), planet);
});

test('every registered strategy implements the do/undo command contract', () => {
    for (const type of Object.values(LiveEditCommandType)) {
        const CommandClass = liveEditCommandRegistry.commandClasses.get(type);
        assert.equal(CommandClass.prototype instanceof LiveEditCommand, true);
        assert.equal(typeof CommandClass.prototype.do, 'function');
        assert.equal(typeof CommandClass.prototype.undo, 'function');
        assert.equal(CommandClass.type, type);
    }
});
