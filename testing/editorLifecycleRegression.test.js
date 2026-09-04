import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';
import { Game } from '../js/game.js';
import { LevelLoader } from '../js/levels/levelLoader.js';
import RuntimeObjectMembership from '../js/runtime/runtimeObjectMembership.js';
import EditorRuntimeProjector from '../js/editor/services/editorRuntimeProjector.js';
import LevelDocument from '../js/editor/state/levelDocument.js';
import { projectDocumentDefinition } from '../js/editor/services/documentProjectionTransaction.js';
import CommandHistory from '../js/editor/commands/live/commandHistory.js';
import EditorCommandBus from '../js/editor/commands/editorCommandBus.js';
import { LevelSaveService, LocalLevelRepository } from '../js/platform/persistence/levelSaveService.js';

function definition(name = 'Editor regression') {
    return {
        name, startPosition: { x: 100, y: 300 }, targetPosition: { x: 700, y: 300 },
        objects: [], rules: { requiredBonuses: 0 }
    };
}

function runtime() {
    const game = {
        gameObjects: [], planets: [], bonuses: [], physics: {},
        levelLoader: new LevelLoader(null),
        loadLevel: Game.prototype.loadLevel,
        addGameObject(object) { this.gameObjects.push(object); },
        resetSimulationSpeedControl() {}, invalidateSimulationState() {},
        clearAllShotPaths() {}, clearAlphaMasks() {}, beginRecordedRun() {},
        resetWorldCamera() { this.viewRect = this.stageRect; }
    };
    game.world = { membership: new RuntimeObjectMembership(game), addGameObject: object => game.addGameObject(object) };
    game.runtimeWorld = () => game.world;
    return game;
}

test('structural projection preserves save identity and updates the existing saved record', async () => {
    const storage = new Map();
    const repository = new LocalLevelRepository({
        getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)
    });
    const saves = new LevelSaveService({ repository });
    const original = await saves.save(definition());
    const game = runtime();
    game.loadLevel(original.level);
    game.levelMetadata.saveId = original.id;
    game.levelMetadata.catalogReference = { id: original.id, source: 'local' };
    const projector = new EditorRuntimeProjector(game);
    const next = definition('Added a planet');
    next.objects.push({ type: 'planet', position: { x: 400, y: 300 }, properties: { id: 'planet_1', mass: 0 } });
    projector.applyDefinition(original.level, next);
    assert.equal(game.levelMetadata.saveId, original.id);
    assert.deepEqual(game.levelMetadata.catalogReference, { id: original.id, source: 'local' });
    assert.equal(game.levelMetadata.name, next.name);
    await saves.save(next, { id: game.levelMetadata.saveId });
    assert.equal(repository.list().length, 1);
    assert.deepEqual(repository.load(original.id).level, next);
    projector.applyDefinition(next, original.level);
    assert.equal(game.levelMetadata.saveId, original.id);
});

test('failed structural projection recovers the document, runtime and save identity', () => {
    const game = runtime();
    const document = LevelDocument.fromDefinition(definition());
    game.loadLevel(document.toDefinition());
    game.levelMetadata.saveId = 'saved-level';
    game.levelMetadata.catalogReference = { id: 'saved-level', source: 'local' };
    const projector = new EditorRuntimeProjector(game);
    const before = document.toDefinition();
    const next = structuredClone(before);
    next.objects.push({ type: 'planet', position: { x: 400, y: 300 }, properties: { id: 'planet_1', mass: 0 } });
    const load = game.loadLevel;
    let fail = true;
    game.loadLevel = function (level) {
        const result = load.call(this, level);
        if (fail) { fail = false; throw new Error('projection failed'); }
        return result;
    };
    assert.throws(() => projectDocumentDefinition({ document, projector, definition: next }), /projection failed/);
    assert.deepEqual(document.toDefinition(), before);
    assert.deepEqual(game.loadedLevelDefinition, before);
    assert.equal(game.planets.length, 0);
    assert.equal(game.levelMetadata.saveId, 'saved-level');
    assert.deepEqual(game.levelMetadata.catalogReference, { id: 'saved-level', source: 'local' });
});

test('repeated materialized loads keep one preview and preserve official levels', () => {
    const game = runtime();
    const official = definition('Official');
    game.levelLoader.levels.set(1, official);
    for (let index = 0; index < 20; index++) game.loadLevel(definition(`Preview ${index}`));
    assert.equal(game.levelLoader.levels.size, 2);
    assert.equal(game.levelLoader.validationResults.size, 1);
    assert.equal(game.levelLoader.levels.get(1), official);
    assert.equal(game.loadedLevelDefinition.name, 'Preview 19');
    const before = game.loadedLevelDefinition;
    assert.throws(() => game.loadLevel({ ...definition(), objects: [{ type: 'invalid' }] }));
    assert.equal(game.loadedLevelDefinition, before);
    assert.deepEqual(game.levelLoader.levels.get(game.level), before);
    game.loadLevel(game.level);
    assert.deepEqual(game.loadedLevelDefinition, before);
});

test('failed undo and redo retain their commands and can be retried', () => {
    const history = new CommandHistory(null, {});
    const bus = new EditorCommandBus({ history });
    let value = 1;
    let failUndo = true;
    let failRedo = false;
    const command = {
        undo() { if (failUndo) throw new Error('undo projection failed'); value = 0; return true; },
        do() { if (failRedo) throw new Error('redo projection failed'); value = 1; return true; }
    };
    history.recordCommand(command);
    assert.equal(bus.undo(), false);
    assert.match(bus.lastError.message, /undo projection failed/);
    assert.deepEqual(history.undoStack, [command]);
    assert.deepEqual(history.redoStack, []);
    assert.equal(value, 1);
    failUndo = false;
    assert.equal(bus.undo(), true);
    assert.equal(bus.lastError, null);
    failRedo = true;
    assert.equal(bus.redo(), false);
    assert.match(bus.lastError.message, /redo projection failed/);
    assert.deepEqual(history.redoStack, [command]);
    assert.deepEqual(history.undoStack, []);
    assert.equal(value, 0);
    failRedo = false;
    assert.equal(bus.redo(), true);
    assert.equal(bus.lastError, null);
    assert.equal(value, 1);
});
