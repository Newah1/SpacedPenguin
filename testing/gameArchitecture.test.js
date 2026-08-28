import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import './nodeShims.js';

import { GameSession } from '../js/runtime/gameSession.js';
import { GameState } from '../js/runtime/gameState.js';
import { RuntimeWorld } from '../js/runtime/runtimeWorld.js';
import { GameRenderer } from '../js/rendering/gameRenderer.js';

test('GameSession owns campaign, level, attempt, and score transitions', () => {
    const session = new GameSession();
    session.startCampaign();
    session.tries = 3;
    session.currentAttemptScore = 25;
    session.advanceLevel();

    assert.equal(session.level, 2);
    assert.equal(session.tries, 0);
    assert.equal(session.currentAttemptScore, 0);
    assert.equal(session.setState(GameState.PLAYING).changed, true);

    session.applyLevelScore({
        levelContribution: 700,
        totalScore: 1200,
        scoreImprovement: 500
    });
    assert.deepEqual({
        contribution: session.currentLevelBestScore,
        score: session.score,
        improvement: session.lastScoreImprovement
    }, { contribution: 700, score: 1200, improvement: 500 });
});

test('RuntimeWorld owns render membership and invalidates by revision', () => {
    let invalidations = 0;
    const world = new RuntimeWorld({ onSimulationInvalidated: () => invalidations++ });
    const object = { renderOrder: 2 };

    assert.equal(world.addGameObject(object), true);
    assert.equal(world.addGameObject(object), false);
    assert.deepEqual(world.renderables(), [object]);
    assert.equal(world.revision, 1);

    world.touch();
    assert.equal(invalidations, 1);
    assert.equal(world.removeGameObject(object), true);
    assert.equal(world.renderables().length, 0);
});

test('GameRenderer caches draw order against RuntimeWorld revision', () => {
    const values = [{ renderOrder: 5 }, { renderOrder: -1 }];
    const world = { revision: 1, renderables: () => values };
    const renderer = new GameRenderer({ runtimeWorld: () => world });

    assert.deepEqual(renderer.sortedObjects(), [values[1], values[0]]);
    values.push({ renderOrder: -2 });
    assert.equal(renderer.sortedObjects().length, 2);
    world.revision++;
    assert.deepEqual(renderer.sortedObjects(), [values[2], values[1], values[0]]);
});

test('runtime collaborators import GameState directly without cycling through game.js', async () => {
    const paths = [
        '../js/levels/levelLoader.js',
        '../js/editor/levelEditor.js',
        '../js/editor/controllers/gravitySculptController.js',
        '../js/ui/views/levelEndScreen.js',
        '../js/input/inputActions.js'
    ];
    for (const path of paths) {
        const source = await readFile(new URL(path, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /from ['"][^'"]*game\.js['"]/);
    }
});
