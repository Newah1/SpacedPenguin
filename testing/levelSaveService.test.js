import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LevelSaveService,
    LocalLevelRepository
} from '../js/levelSaveService.js';

function createStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value)
    };
}

test('local level saves run strategies and advertise editable ownership', async () => {
    const repository = new LocalLevelRepository(createStorage(), 'test-levels');
    const service = new LevelSaveService({ repository });
    const strategyCalls = [];
    service.addSaveStrategy(context => {
        strategyCalls.push(context.record.name);
        context.record.level.strategyMarker = true;
    });

    const saved = await service.save({
        name: 'Local Creation',
        description: 'Editable by its author',
        objects: []
    }, { thumbnail: 'data:image/png;base64,test' });

    assert.deepEqual(strategyCalls, ['Local Creation']);
    assert.equal(saved.source, 'local');
    assert.deepEqual(saved.capabilities, { play: true, edit: true });
    assert.equal(service.canEdit(saved), true);
    assert.equal(service.load(saved.id).level.strategyMarker, true);
});

test('level edit capability can be denied by a future repository record', () => {
    const service = new LevelSaveService({ repository: new LocalLevelRepository(createStorage()) });

    assert.equal(service.canEdit({ capabilities: { play: true, edit: false } }), false);
    // Existing local records written before capabilities were introduced stay editable.
    assert.equal(service.canEdit({ source: 'local' }), true);
});
