import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import LiveLevelMutator from '../js/liveLevelMutator.js';
import LiveEditCommand from '../js/editorCommands/liveEditCommand.js';
import {
    LiveEditCommandType,
    liveEditCommandRegistry
} from '../js/editorCommands/index.js';
import LevelEditor from '../js/levelEditor.js';
import { EditorInputContext } from '../js/input/contexts/editorInputContext.js';
import EditorObjectService from '../js/levelEditor/editorObjectService.js';

class Planet {}
class Bonus {}
class Target {}

function createGame() {
    return {
        gameObjects: [],
        planets: [],
        bonuses: [],
        portals: [],
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
    editor.objectService = new EditorObjectService(editor);

    assert.equal(editor.objectService.allocateName('Planet', next), 'Planet 2');
    assert.equal(editor.objectService.allocateId('Planet', next), 'planet_2');
});

test('editor context declares one pointer event stream and no synthetic click pass', () => {
    const context = new EditorInputContext({ game: {} });

    assert.deepEqual(context.inputTypes.filter(type => type.startsWith('pointer') || type === 'contextmenu' || type === 'wheel'), [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'contextmenu',
        'wheel'
    ]);
    assert.equal(context.inputTypes.includes('click'), false);
    assert.equal(context.inputTypes.includes('mousedown'), false);
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
