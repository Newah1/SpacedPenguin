import test from 'node:test';
import assert from 'node:assert/strict';
import {
    adjustNumericValue,
    getNumericNudge
} from '../js/editor/views/editorControlFactory.js';

test('editor number controls offer precise and magnitude-aware large nudges', () => {
    assert.equal(getNumericNudge({}, 450, 1), 1);
    assert.equal(getNumericNudge({}, 450, 10), 100);
    assert.equal(getNumericNudge({ step: 0.05 }, 1, 1), 0.05);
    assert.equal(getNumericNudge({ step: 0.05 }, 1, 10), 1);
    assert.equal(adjustNumericValue({}, 450, 1, 10), 550);
    assert.equal(adjustNumericValue({ step: 0.05 }, 0.9, -1), 0.85);
});

test('editor number nudges respect field bounds and initialize empty values', () => {
    assert.equal(adjustNumericValue({ min: 0 }, 0, -1, 10), 0);
    assert.equal(adjustNumericValue({ min: 1, max: 10 }, 9, 1, 10), 10);
    assert.equal(adjustNumericValue({ min: 3 }, '', 1), 4);
});
