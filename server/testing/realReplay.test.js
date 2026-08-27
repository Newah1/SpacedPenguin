import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';

import { CommunityLevelClient } from '../../js/catalog/communityLevelClient.js';
import { replayRun } from '../../js/replay/runReplay.js';
import { createLevelServer } from '../app.js';

const level = {
    name: 'Real replay integration',
    description: 'Exercises the browser client contract against worker replay.',
    startPosition: { x: 0, y: 0 },
    targetPosition: { x: 300, y: 0 },
    objects: [
        {
            type: 'slingshot',
            position: { x: 0, y: 0 },
            properties: { velocityMultiplier: 8, minPullback: 10, maxPullback: 100 }
        },
        {
            type: 'target',
            position: { x: 300, y: 0 },
            properties: { width: 60, height: 60 }
        }
    ],
    rules: { scoreMultiplier: 1 }
};

const proof = {
    proofVersion: 1,
    simulationVersion: 1,
    actions: [{ tick: 0, type: 'launch', angle: 0, power: 50 }]
};

test('public client, HTTP server, worker replay, SQLite, and leaderboard interoperate', async t => {
    const server = createLevelServer({
        verifierPool: { size: 1, maxQueue: 2, timeoutMs: 5000 },
        rateLimiter: { check() {} },
        logger: { error() {} }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
        server.close();
        await once(server, 'close');
        await server.verifier.close();
        server.database.close();
    });

    const client = new CommunityLevelClient({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        requestTimeoutMs: 5000
    });
    const published = await client.publishLevel(level, proof);
    assert.match(published.id, /^[0-9a-f-]{36}$/);

    const authoritative = replayRun(level, proof).score;
    const submitted = await client.submitScore(published.id, {
        initials: 'KEV',
        claimedScore: authoritative.score,
        proof,
        idempotencyKey: 'real-replay-score-1'
    });
    assert.equal(submitted.accepted, true);
    assert.equal(submitted.rank, 1);
    assert.equal(submitted.result.score, authoritative.score);

    const scores = await client.getScores(published.id);
    assert.deepEqual(scores.items.map(item => [item.initials, item.score]), [
        ['KEV', authoritative.score]
    ]);
});
