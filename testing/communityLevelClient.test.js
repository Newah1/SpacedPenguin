import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CommunityLevelApiError,
    CommunityLevelClient,
    createIdempotencyKey,
    resolveCommunityApiRoot
} from '../js/communityLevelClient.js';

function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

test('community API roots accept deployment, api, and api version URLs', () => {
    assert.equal(resolveCommunityApiRoot('https://levels.example'), 'https://levels.example/api/v1');
    assert.equal(resolveCommunityApiRoot('/api'), '/api/v1');
    assert.equal(resolveCommunityApiRoot('/api/v1/'), '/api/v1');
});

test('publishing sends the level and versioned completion proof', async () => {
    const requests = [];
    const client = new CommunityLevelClient({
        baseUrl: '/api',
        fetchImpl: async (url, options) => {
            requests.push({ url, options });
            return jsonResponse({ item: { id: 'published-1' } }, 201);
        }
    });
    const proof = {
        proofVersion: 1,
        simulationVersion: 1,
        actions: [{ tick: 0, type: 'launch', angle: 0, power: 50 }]
    };
    await client.publishLevel({ name: 'Proof', objects: [] }, proof);
    assert.equal(requests[0].url, '/api/v1/levels');
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
        schemaVersion: 1,
        simulationVersion: 1,
        level: { name: 'Proof', objects: [] },
        completionProof: proof
    });
});

test('browser fetch is invoked with the global receiver', async () => {
    let receiver;
    const client = new CommunityLevelClient({
        baseUrl: '/api',
        fetchImpl: function () {
            receiver = this;
            return jsonResponse({ items: [], nextCursor: null });
        }
    });

    await client.getScores('level-1');

    assert.equal(receiver, globalThis);
});

test('unencodable submissions are not mislabeled as server outages', async () => {
    const client = new CommunityLevelClient({
        baseUrl: '/api',
        fetchImpl: async () => { throw new Error('fetch should not be called'); }
    });
    const level = { name: 'Circular' };
    level.self = level;

    await assert.rejects(
        client.publishLevel(level, { proofVersion: 1, simulationVersion: 1, actions: [] }),
        error => error instanceof CommunityLevelApiError && error.code === 'INVALID_REQUEST_PAYLOAD'
    );
});

test('score submission normalizes initials and carries an idempotency key', async () => {
    let submitted;
    const client = new CommunityLevelClient({
        baseUrl: '/api/v1',
        fetchImpl: async (_url, options) => {
            submitted = JSON.parse(options.body);
            return jsonResponse({ accepted: true, rank: 1 });
        }
    });
    const proof = { proofVersion: 1, simulationVersion: 1, actions: [] };
    await client.submitScore('level/1', {
        initials: ' kev ', claimedScore: 123, proof, idempotencyKey: 'request-1'
    });
    assert.equal(submitted.initials, 'KEV');
    assert.equal(submitted.idempotencyKey, 'request-1');
    assert.equal(submitted.scoreVersion, 1);
});

test('server errors preserve stable code, status, and details', async () => {
    const client = new CommunityLevelClient({
        baseUrl: '/api',
        fetchImpl: async () => jsonResponse({
            error: { code: 'SCORE_MISMATCH', message: 'Nope', details: { expected: 5 } }
        }, 422)
    });
    await assert.rejects(
        client.getScores('missing'),
        error => error instanceof CommunityLevelApiError &&
            error.code === 'SCORE_MISMATCH' && error.status === 422 && error.details.expected === 5
    );
});

test('idempotency fallback creates an RFC 4122 version 4 shape', () => {
    const crypto = {
        getRandomValues(bytes) {
            bytes.fill(0x12);
            return bytes;
        }
    };
    assert.match(createIdempotencyKey(crypto), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
