import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LevelSaveService,
    LocalLevelRepository
} from '../js/platform/persistence/levelSaveService.js';
import {
    LevelCatalogService,
    LocalLevelCatalogSource
} from '../js/catalog/levelCatalogService.js';
import { readAppConfig } from '../js/config/appConfig.js';
import {
    RemoteLevelCatalogError,
    RemoteLevelCatalogSource
} from '../js/catalog/remoteLevelCatalogSource.js';
import { createConfiguredLevelCatalog } from '../js/catalog/levelCatalogComposition.js';
import { OfficialLevelCatalogSource } from '../js/catalog/officialLevelCatalogSource.js';

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

test('app configuration defaults to local-only and rejects unsafe server URLs', () => {
    assert.equal(readAppConfig(undefined, { location: { href: 'https://game.example/' } }).levelServer.baseUrl, null);

    const configured = readAppConfig({
        levelServer: { baseUrl: '/levels-api/', requestTimeoutMs: 2500 }
    }, { location: { href: 'https://game.example/play' } });
    assert.deepEqual(configured.levelServer, { baseUrl: '/levels-api', requestTimeoutMs: 2500 });

    const errors = [];
    const invalid = readAppConfig({ levelServer: { baseUrl: 'http://levels.example' } }, {
        location: { href: 'https://game.example/' },
        logger: { error: message => errors.push(message) }
    });
    assert.equal(invalid.levelServer.baseUrl, null);
    assert.match(errors[0], /using local levels only/i);
});

test('configured catalog stays local-only without a URL and adds remote without probing it', async () => {
    let fetchCalls = 0;
    const repository = new LocalLevelRepository(createStorage());
    const localOnly = createConfiguredLevelCatalog(repository, {
        appConfig: { levelServer: { baseUrl: null } },
        fetchImpl: async () => { fetchCalls++; }
    });
    assert.deepEqual(localOnly.getSources(), [{ id: 'local', label: 'My Levels' }]);
    assert.equal(fetchCalls, 0);

    const configured = createConfiguredLevelCatalog(repository, {
        appConfig: { levelServer: { baseUrl: 'https://levels.example', requestTimeoutMs: 3000 } },
        fetchImpl: async () => { fetchCalls++; }
    });
    assert.deepEqual(configured.getSources().map(source => source.id), ['local', 'community']);
    assert.equal(configured.defaultSource, 'local');
    assert.equal(fetchCalls, 0);
});

test('configured game catalog exposes official levels before owned and community sources', () => {
    const repository = new LocalLevelRepository(createStorage());
    const levelLoader = {
        activeCollection: 'shipped',
        levels: new Map([[1, { name: 'Official One', description: 'Campaign', objects: [] }]])
    };
    const catalog = createConfiguredLevelCatalog(repository, {
        levelLoader,
        appConfig: { levelServer: { baseUrl: 'https://levels.example' } },
        fetchImpl: async () => assert.fail('source discovery must not fetch')
    });

    assert.deepEqual(catalog.getSources().map(source => source.id), ['official', 'local', 'community']);
    assert.equal(catalog.defaultSource, 'official');
});

test('official catalog resolves loaded campaign summaries and cloned definitions', async () => {
    const definition = { name: 'Official One', description: 'Campaign', objects: [{ type: 'planet' }] };
    const source = new OfficialLevelCatalogSource({
        activeCollection: 'shipped',
        levels: new Map([[1, definition]])
    });
    source.definitions.set(2, { name: 'Outer Orbit', description: 'Searchable', objects: [] });
    for (let level = 3; level <= 25; level++) {
        source.definitions.set(level, { name: `Official ${level}`, description: '', objects: [] });
    }

    const page = await source.query({ text: 'outer', pageSize: 24 });
    assert.deepEqual(page.items.map(item => item.id), ['2']);
    assert.equal(page.items[0].source, 'official');
    assert.equal(page.items[0].capabilities.edit, false);

    const loaded = await source.getDefinition('1');
    loaded.name = 'Changed';
    assert.equal((await source.getDefinition('1')).name, 'Official One');
    await assert.rejects(source.getDefinition('26'), /not found/i);
});

test('remote catalog maps list, details, and immutable definitions', async () => {
    const requests = [];
    const fetchImpl = async (url, options) => {
        requests.push({ url, options });
        const body = url.includes('cursor=next')
            ? { items: [], nextCursor: null }
            : url.endsWith('/levels/level%2Fone')
                ? {
                    id: 'level/one',
                    name: 'Server Orbit',
                    description: 'Remote challenge',
                    objectCount: 3,
                    publishedAt: '2026-08-16T12:00:00.000Z',
                    definitionHash: 'abc123',
                    definition: { name: 'Server Orbit', objects: [] }
                }
                : {
                    items: [{
                        id: 'level/one',
                        name: 'Server Orbit',
                        objectCount: 3,
                        publishedAt: '2026-08-16T12:00:00.000Z',
                        definitionHash: 'abc123'
                    }],
                    nextCursor: 'next'
                };
        return { ok: true, status: 200, json: async () => body };
    };
    const remote = new RemoteLevelCatalogSource({
        baseUrl: 'https://levels.example/api', requestTimeoutMs: 1000, fetchImpl
    });
    const catalog = new LevelCatalogService({
        sources: [new LocalLevelCatalogSource(new LocalLevelRepository(createStorage())), remote],
        defaultSource: 'local'
    });

    assert.deepEqual(catalog.getSources(), [
        { id: 'local', label: 'My Levels' },
        { id: 'community', label: 'Community Levels' }
    ]);
    const page = await catalog.query({
        source: 'community', text: 'orbit & moon', cursor: null, pageSize: 500, sort: 'name'
    });
    assert.equal(page.items[0].source, 'community');
    assert.equal(page.items[0].capabilities.edit, false);
    assert.equal(page.items[0].objectCount, 3);
    assert.equal(page.items[0].definitionHash, 'abc123');
    assert.match(requests[0].url, /^https:\/\/levels\.example\/api\/v1\/levels\?/);
    assert.match(requests[0].url, /q=orbit\+%26\+moon/);
    assert.match(requests[0].url, /limit=100/);

    const details = await catalog.getDetails({ source: 'community', id: 'level/one' });
    const definition = await catalog.getDefinition({ source: 'community', id: 'level/one' });
    assert.equal(details.updatedAt, details.publishedAt);
    assert.equal(details.capabilities.edit, false);
    assert.deepEqual(definition, { name: 'Server Orbit', objects: [] });
    definition.name = 'Changed client copy';
    assert.equal((await catalog.getDefinition({ source: 'community', id: 'level/one' })).name, 'Server Orbit');
});

test('remote catalog invokes browser fetch with the global receiver', async () => {
    let receiver;
    const remote = new RemoteLevelCatalogSource({
        baseUrl: '/api',
        fetchImpl: function () {
            receiver = this;
            return {
                ok: true,
                status: 200,
                json: async () => ({ items: [], nextCursor: null })
            };
        }
    });

    await remote.query();

    assert.equal(receiver, globalThis);
});

test('remote catalog preserves API errors and isolates local browsing from remote failures', async () => {
    const repository = new LocalLevelRepository(createStorage());
    repository.save({ id: 'safe-local', name: 'Safe Local', level: { name: 'Safe Local', objects: [] } });
    const remote = new RemoteLevelCatalogSource({
        baseUrl: '/api',
        fetchImpl: async () => ({
            ok: false,
            status: 429,
            json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Try again later.', details: { retry: 10 } } })
        })
    });
    const catalog = new LevelCatalogService({
        sources: [new LocalLevelCatalogSource(repository), remote]
    });

    await assert.rejects(
        catalog.query({ source: 'community' }),
        error => error instanceof RemoteLevelCatalogError &&
            error.code === 'RATE_LIMITED' && error.status === 429 && error.details.retry === 10
    );
    assert.deepEqual((await catalog.query({ source: 'local' })).items.map(item => item.id), ['safe-local']);
});

test('remote catalog distinguishes timeout from caller cancellation', async () => {
    const neverFetches = (url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const timed = new RemoteLevelCatalogSource({ baseUrl: '/api', requestTimeoutMs: 5, fetchImpl: neverFetches });
    await assert.rejects(timed.query(), error => error.code === 'REQUEST_TIMEOUT');

    const cancelled = new RemoteLevelCatalogSource({ baseUrl: '/api', requestTimeoutMs: 1000, fetchImpl: neverFetches });
    const controller = new AbortController();
    const pending = cancelled.query({ signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
});
