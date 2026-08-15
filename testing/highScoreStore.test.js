import test from 'node:test';
import assert from 'node:assert/strict';
import { HighScoreStore } from '../js/highScoreStore.js';

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value)
    };
}

test('high scores rank all-time and daily entries independently', () => {
    const store = new HighScoreStore(memoryStorage());
    store.add({ name: 'Ada', region: 'NY', score: 500, achievedAt: new Date(2026, 7, 15, 10) });
    store.add({ name: 'Bea', region: 'CA', score: 900, achievedAt: new Date(2026, 7, 14, 10) });
    store.add({ name: 'Cal', region: 'ON', score: 700, achievedAt: new Date(2026, 7, 15, 11) });

    assert.deepEqual(store.getAllTime().map(entry => entry.name), ['Bea', 'Cal', 'Ada']);
    assert.deepEqual(store.getToday(new Date(2026, 7, 15)).map(entry => entry.name), ['Cal', 'Ada']);
});

test('qualification matches the original inclusive tenth-place cutoff', () => {
    const store = new HighScoreStore(memoryStorage());
    for (let score = 100; score <= 1000; score += 100) {
        store.add({ name: `P${score}`, region: 'US', score, achievedAt: new Date(2026, 7, 15) });
    }

    assert.equal(store.getCutoff(), 100);
    assert.equal(store.qualifies(100), true);
    assert.equal(store.qualifies(99), false);
});

test('corrupt saved leaderboard data falls back to an empty board', () => {
    const storage = memoryStorage();
    storage.setItem('spacedPenguinHighScores', '{bad json');
    const store = new HighScoreStore(storage);
    assert.deepEqual(store.getAllTime(), []);
    assert.equal(store.qualifies(0), true);
});
