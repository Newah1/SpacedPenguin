import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { once } from 'node:events';
import { createLevelServer } from '../app.js';
import { ApiError } from '../errors.js';

const validLevel = Object.freeze({
    name: 'Tiny Orbit',
    description: 'A small community level',
    startPosition: { x: 100, y: 200 },
    targetPosition: { x: 700, y: 200 },
    objects: [
        { type: 'slingshot', position: { x: 100, y: 200 }, properties: {} },
        { type: 'target', position: { x: 700, y: 200 }, properties: { width: 50, height: 50 } }
    ],
    rules: { maxTries: 5, scoreMultiplier: 1 }
});

const proof = Object.freeze({
    proofVersion: 1,
    simulationVersion: 1,
    actions: [{ tick: 1, type: 'launch', angle: 0, power: 50 }]
});

function publication(level = validLevel) {
    return { schemaVersion: 1, simulationVersion: 1, level, completionProof: proof };
}

function scorePayload(overrides = {}) {
    return {
        initials: ' kev ',
        claimedScore: 1200,
        simulationVersion: 1,
        scoreVersion: 1,
        proof,
        idempotencyKey: 'score-key-0001',
        ...overrides
    };
}

let server;
let baseUrl;
let verifier;

beforeEach(async () => {
    verifier = {
        publicationCalls: 0,
        scoreCalls: 0,
        async verifyPublication() {
            this.publicationCalls++;
            return { completed: true };
        },
        async verifyScore() {
            this.scoreCalls++;
            return {
                completed: true,
                result: { score: 1200, tries: 2, distance: 2000.5, bonusScore: 200, multiplier: 1 }
            };
        }
    };
    server = createLevelServer({ verifier, rateLimiter: { check() {} }, logger: { error() {} } });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
    server.close();
    await once(server, 'close');
    server.database.close();
});

async function jsonRequest(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const body = response.status === 304 ? null : await response.json();
    return { response, body };
}

async function post(path, body) {
    return jsonRequest(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function publish(level = validLevel) {
    const result = await post('/api/v1/levels', publication(level));
    assert.equal(result.response.status, 201, JSON.stringify(result.body));
    return result.body;
}

test('status advertises all independent protocol versions', async () => {
    const { response, body } = await jsonRequest('/api/v1/status');
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
        apiVersion: 1,
        schemaVersion: 1,
        proofVersion: 1,
        simulationVersion: 1,
        scoreVersion: 1
    });
});

test('publishes only after verification and serves immutable definitions with ETags', async () => {
    const published = await publish();
    assert.equal(verifier.publicationCalls, 1);
    assert.match(published.id, /^[0-9a-f-]{36}$/);
    assert.equal(published.name, validLevel.name);

    const fetched = await jsonRequest(`/api/v1/levels/${published.id}`);
    assert.equal(fetched.response.status, 200);
    assert.equal(fetched.body.definition.name, validLevel.name);
    assert.equal(fetched.response.headers.get('etag'), `"${published.definitionHash}"`);

    const conditional = await fetch(`${baseUrl}/api/v1/levels/${published.id}`, {
        headers: { 'if-none-match': fetched.response.headers.get('etag') }
    });
    assert.equal(conditional.status, 304);
    assert.equal(await conditional.text(), '');

    const duplicate = await post('/api/v1/levels', publication());
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.body.error.code, 'DUPLICATE_LEVEL');
    assert.equal(verifier.publicationCalls, 1, 'duplicates are rejected before expensive replay');
});

test('failed publication replay never inserts a level', async () => {
    verifier.verifyPublication = async () => {
        verifier.publicationCalls++;
        throw new ApiError(422, 'COMPLETION_PROOF_FAILED', 'The submitted run did not complete the level.', { reason: 'target_not_reached' });
    };
    const failed = await post('/api/v1/levels', publication());
    assert.equal(failed.response.status, 422);
    assert.equal(failed.body.error.code, 'COMPLETION_PROOF_FAILED');
    const listed = await jsonRequest('/api/v1/levels');
    assert.equal(listed.body.items.length, 0);
});

test('canonicalizes insignificant launch-power overflow before verification', async () => {
    let verifiedProof;
    verifier.verifyPublication = async ({ proof: submittedProof }) => {
        verifiedProof = submittedProof;
        return { completed: true };
    };
    const noisyProof = {
        ...proof,
        actions: [{ ...proof.actions[0], power: 100.00000000000001 }]
    };

    const result = await post('/api/v1/levels', {
        ...publication(),
        completionProof: noisyProof
    });

    assert.equal(result.response.status, 201, JSON.stringify(result.body));
    assert.equal(verifiedProof.actions[0].power, 100);
});

test('level listing uses stable cursor pagination and supported sorts', async () => {
    const names = ['Zulu', 'Alpha', 'Mike'];
    for (const [index, name] of names.entries()) {
        await publish({ ...validLevel, name, description: `unique-${index}` });
    }
    const first = await jsonRequest('/api/v1/levels?sort=name&limit=2');
    assert.deepEqual(first.body.items.map(item => item.name), ['Alpha', 'Mike']);
    assert.ok(first.body.nextCursor);
    const second = await jsonRequest(`/api/v1/levels?sort=name&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    assert.deepEqual(second.body.items.map(item => item.name), ['Zulu']);
    assert.equal(second.body.nextCursor, null);

    const wrongSort = await jsonRequest(`/api/v1/levels?sort=newest&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    assert.equal(wrongSort.response.status, 400);
    assert.equal(wrongSort.body.error.code, 'INVALID_CURSOR');
});

test('validates and ranks scores, normalizes initials, and makes retries idempotent', async () => {
    const level = await publish();
    const submitted = await post(`/api/v1/levels/${level.id}/scores`, scorePayload());
    assert.equal(submitted.response.status, 201);
    assert.equal(submitted.body.rank, 1);
    assert.equal(submitted.body.result.initials, 'KEV');
    assert.equal(submitted.body.result.score, 1200);
    assert.equal(verifier.scoreCalls, 1);

    const retry = await post(`/api/v1/levels/${level.id}/scores`, scorePayload());
    assert.equal(retry.response.status, 200);
    assert.equal(retry.body.idempotent, true);
    assert.equal(verifier.scoreCalls, 1, 'idempotent retry skips replay');

    const conflict = await post(`/api/v1/levels/${level.id}/scores`, scorePayload({ initials: 'ABC' }));
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT');

    const listing = await jsonRequest(`/api/v1/levels/${level.id}/scores`);
    assert.equal(listing.body.items.length, 1);
});

test('rejects forged score and malformed initials without storing either', async () => {
    const level = await publish();
    const mismatch = await post(`/api/v1/levels/${level.id}/scores`, scorePayload({ claimedScore: 999 }));
    assert.equal(mismatch.response.status, 422);
    assert.equal(mismatch.body.error.code, 'CLAIMED_SCORE_MISMATCH');

    const initials = await post(`/api/v1/levels/${level.id}/scores`, scorePayload({ initials: 'K3V', idempotencyKey: 'score-key-0002' }));
    assert.equal(initials.response.status, 400);
    assert.equal(initials.body.error.code, 'INVALID_INITIALS');

    const listing = await jsonRequest(`/api/v1/levels/${level.id}/scores`);
    assert.equal(listing.body.items.length, 0);
});

test('rejects unknown fields, illegal transcripts, and unsupported public features before replay', async () => {
    const unknown = await post('/api/v1/levels', { ...publication(), surprise: true });
    assert.equal(unknown.body.error.code, 'UNKNOWN_FIELD');
    const unordered = await post('/api/v1/levels', publication(validLevel));
    assert.equal(unordered.response.status, 201);

    const illegal = await post('/api/v1/levels', {
        ...publication({ ...validLevel, name: 'Second unique level' }),
        completionProof: { proofVersion: 1, simulationVersion: 1, actions: [
            { tick: 3, type: 'launch', angle: 0, power: 50 },
            { tick: 2, type: 'retry' }
        ] }
    });
    assert.equal(illegal.body.error.code, 'INVALID_PROOF');
    const custom = await post('/api/v1/levels', publication({
        ...validLevel,
        name: 'Custom behavior',
        rules: { customBehaviors: ['anything'] }
    }));
    assert.equal(custom.body.error.code, 'UNSUPPORTED_LEVEL_FEATURE');
    assert.equal(verifier.publicationCalls, 1);
});

test('hidden levels are absent from all public reads', async () => {
    const level = await publish();
    server.database.prepare("UPDATE levels SET status = 'hidden' WHERE id = ?").run(level.id);
    const fetched = await jsonRequest(`/api/v1/levels/${level.id}`);
    assert.equal(fetched.response.status, 404);
    const listed = await jsonRequest('/api/v1/levels');
    assert.deepEqual(listed.body.items, []);
    const scores = await jsonRequest(`/api/v1/levels/${level.id}/scores`);
    assert.equal(scores.response.status, 404);
});
