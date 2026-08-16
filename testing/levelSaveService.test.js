import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LevelSaveService,
    LocalLevelRepository
} from '../js/levelSaveService.js';
import {
    LevelCatalogService,
    LocalLevelCatalogSource
} from '../js/levelCatalogService.js';

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

test('local catalog returns lightweight searchable cursor pages', async () => {
    const repository = new LocalLevelRepository(createStorage(), 'catalog-levels');
    repository.save({
        id: 'local-1',
        name: 'Moon Relay',
        description: 'Thread the inner planets',
        author: 'Ada',
        tags: ['technical'],
        capabilities: { play: true, edit: true },
        level: { name: 'Moon Relay', objects: [{ type: 'planet' }] }
    });
    repository.save({
        id: 'local-2',
        name: 'Quiet Orbit',
        description: 'A gentle introduction',
        capabilities: { play: true, edit: false },
        level: { name: 'Quiet Orbit', objects: [] }
    });
    const catalog = new LevelCatalogService({
        sources: [new LocalLevelCatalogSource(repository)]
    });

    const first = await catalog.query({ pageSize: 1 });
    assert.equal(first.items.length, 1);
    assert.equal(first.total, 2);
    assert.equal(first.nextCursor, '1');
    assert.equal('level' in first.items[0], false);

    const second = await catalog.query({ cursor: first.nextCursor, pageSize: 1 });
    assert.equal(second.items.length, 1);
    assert.equal(second.nextCursor, null);

    const searched = await catalog.query({ text: 'ADA' });
    assert.deepEqual(searched.items.map(item => item.id), ['local-1']);
    assert.deepEqual(searched.items[0].tags, ['technical']);
});

test('catalog details and definitions are resolved separately and cloned', async () => {
    const repository = new LocalLevelRepository(createStorage(), 'catalog-details');
    repository.save({
        id: 'local-detail',
        name: 'Detail Level',
        description: 'Inspect me',
        level: { name: 'Detail Level', objects: [{ type: 'bonus' }], rules: { maxTries: 4 } }
    });
    const catalog = new LevelCatalogService({
        sources: [new LocalLevelCatalogSource(repository)]
    });

    const details = await catalog.getDetails({ id: 'local-detail', source: 'local' });
    const definition = await catalog.getDefinition({ id: 'local-detail', source: 'local' });
    assert.equal(details.objectCount, 1);
    assert.deepEqual(details.rules, { maxTries: 4 });
    assert.equal('level' in details, false);

    definition.name = 'Mutated';
    assert.equal((await catalog.getDefinition('local-detail')).name, 'Detail Level');
});

test('saving an existing local level preserves its creation timestamp', async () => {
    const repository = new LocalLevelRepository(createStorage(), 'catalog-timestamps');
    const service = new LevelSaveService({ repository });
    const original = await service.save({ name: 'Version One', objects: [] });
    const updated = await service.save({ name: 'Version Two', objects: [] }, { id: original.id });

    assert.equal(updated.createdAt, original.createdAt);
    assert.equal(service.canPlay({ capabilities: { play: false } }), false);
});
