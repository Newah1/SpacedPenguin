import './nodeShims.js';

import assert from 'node:assert/strict';
import test from 'node:test';

import { Game } from '../js/game.js';
import { CommunityScoreUploadScreen } from '../js/ui/views/communityScoreUploadScreen.js';

function gameFixture(overrides = {}) {
    return Object.assign(Object.create(Game.prototype), {
        runTick: 0,
        invalidateSimulationState() {},
        exportCurrentLevel: () => ({ name: 'Fixture', description: '', objects: [], rules: {} }),
        levelMetadata: {},
        levelEditor: { mode: 'play' },
        levelRules: { scoreMultiplier: 1 },
        distance: 100,
        tries: 1,
        currentAttemptScore: 25,
        showMessage() {},
        ...overrides
    });
}

test('a completed run freezes the exact level and launch transcript', () => {
    const game = gameFixture();
    game.beginRecordedRun(game.exportCurrentLevel());
    game.recordRunLaunch(0, 50);
    game.runTick = 12;
    const completed = game.completeRecordedRun();

    assert.deepEqual(completed.proof.actions, [
        { tick: 0, type: 'launch', angle: 0, power: 50 }
    ]);
    assert.equal(Object.isFrozen(completed.proof), true);
    assert.equal(completed.level.name, 'Fixture');
});

test('publishing uses the authored level captured before moving-world play', async () => {
    const publishedCalls = [];
    const authored = { name: 'Authored', description: '', objects: [], rules: {} };
    const game = gameFixture({
        completedRun: {
            level: authored,
            proof: { proofVersion: 1, simulationVersion: 1, actions: [{ tick: 0, type: 'launch', angle: 0, power: 50 }] }
        },
        exportCurrentLevel: () => ({ ...authored, name: 'Moved runtime state' }),
        communityLevelClient: {
            async publishLevel(level, proof) {
                publishedCalls.push({ level, proof });
                return { id: 'community-1', name: level.name };
            }
        }
    });

    const result = await game.publishEditedLevel();
    assert.equal(result.id, 'community-1');
    assert.deepEqual(publishedCalls[0].level, authored);
    assert.deepEqual(game.levelMetadata.catalogReference, { id: 'community-1', source: 'community' });
});

test('score upload normalizes native-UI initials and preserves idempotency for retry', async t => {
    const originalStorage = globalThis.localStorage;
    const stored = new Map();
    globalThis.localStorage = {
        getItem: key => stored.get(key) || null,
        setItem: (key, value) => stored.set(key, value)
    };
    t.after(() => {
        globalThis.localStorage = originalStorage;
    });

    const attempts = [];
    const game = gameFixture({
        completedRun: {
            level: {},
            proof: { proofVersion: 1, simulationVersion: 1, actions: [{ tick: 0, type: 'launch', angle: 0, power: 50 }] }
        },
        levelMetadata: { catalogReference: { source: 'community', id: 'level-1' } },
        communityLevelClient: {
            async submitScore(_levelId, submission) {
                attempts.push(structuredClone(submission));
                if (attempts.length === 1) throw new Error('offline');
                return { rank: 2, result: { score: submission.claimedScore } };
            }
        }
    });

    await assert.rejects(game.offerCommunityScoreUpload(' kev '), /offline/);
    const idempotencyKey = game.pendingCommunityScoreSubmission.idempotencyKey;
    const retried = await game.submitPendingCommunityScore();
    assert.equal(retried.rank, 2);
    assert.equal(attempts[0].initials, 'KEV');
    assert.equal(attempts[0].idempotencyKey, idempotencyKey);
    assert.equal(attempts[1].idempotencyKey, idempotencyKey);
    assert.equal(game.pendingCommunityScoreSubmission, null);
});

test('score upload rejects invalid native-UI initials before creating a submission', async () => {
    const game = gameFixture({
        completedRun: { level: {}, proof: { proofVersion: 1, simulationVersion: 1, actions: [] } },
        levelMetadata: { catalogReference: { source: 'community', id: 'level-1' } },
        communityLevelClient: { submitScore: () => assert.fail('invalid initials must not upload') }
    });

    await assert.rejects(game.offerCommunityScoreUpload('K1'), /exactly three letters/);
    assert.equal(game.pendingCommunityScoreSubmission, undefined);
});

test('score upload view loads the current community leaderboard', async () => {
    const renders = [];
    const screen = Object.assign(Object.create(CommunityScoreUploadScreen.prototype), {
        game: {
            levelMetadata: { catalogReference: { source: 'community', id: 'level-1' } },
            communityLevelClient: {
                async getScores(levelId, options) {
                    assert.equal(levelId, 'level-1');
                    assert.equal(options.limit, 10);
                    assert.equal(options.signal.aborted, false);
                    return { items: [{ initials: 'KEV', score: 4200 }] };
                }
            }
        },
        renderLeaderboard: (scores, options = {}) => renders.push({ scores, options })
    });

    const scores = await screen.refreshLeaderboard();

    assert.deepEqual(scores, [{ initials: 'KEV', score: 4200 }]);
    assert.equal(renders[0].options.loading, true);
    assert.deepEqual(renders.at(-1).scores, scores);
});
