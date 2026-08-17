import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../errors.js';
import { Router } from '../router.js';

test('dispatches declarative routes by method and path', async () => {
    const router = new Router();
    const calls = [];
    router.route({
        method: 'GET',
        path: '/levels/:levelId/scores',
        handler: async ({ params, url }) => calls.push({ levelId: params.levelId, limit: url.searchParams.get('limit') })
    });

    const handled = await router.dispatch({ method: 'GET', url: '/levels/level%201/scores?limit=10' }, {});

    assert.equal(handled, true);
    assert.deepEqual(calls, [{ levelId: 'level 1', limit: '10' }]);
});

test('does not dispatch a path registered for a different method', async () => {
    const router = new Router();
    let called = false;
    router.post('/levels', async () => { called = true; });

    const handled = await router.dispatch({ method: 'GET', url: '/levels' }, {});

    assert.equal(handled, false);
    assert.equal(called, false);
});

test('rejects malformed encoded path parameters', async () => {
    const router = new Router();
    router.get('/levels/:levelId', async () => {});

    await assert.rejects(
        router.dispatch({ method: 'GET', url: '/levels/%ZZ' }, {}),
        error => error instanceof ApiError && error.status === 400 && error.code === 'INVALID_PATH'
    );
});
