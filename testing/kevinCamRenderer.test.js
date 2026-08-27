import test from 'node:test';
import assert from 'node:assert/strict';
import { KevinCamRenderer } from '../js/rendering/kevinCamRenderer.js';

function createContext() {
    const calls = [];
    const ctx = { calls };
    for (const method of [
        'save', 'restore', 'fillRect', 'fillText', 'translate', 'rotate',
        'beginPath', 'rect', 'clip', 'scale', 'strokeRect'
    ]) {
        ctx[method] = (...args) => calls.push([method, ...args]);
    }
    return ctx;
}

test('Kevin Cam renders only for a visible soaring penguin', () => {
    const renderer = new KevinCamRenderer({ starCount: 2 });
    const ctx = createContext();
    let penguinDraws = 0;
    const penguin = {
        state: 'soaring',
        x: 100,
        y: 200,
        draw(receivedContext) {
            assert.equal(receivedContext, ctx);
            penguinDraws++;
        }
    };

    renderer.draw({ ctx, enabled: true, arrowVisible: true, penguin });

    assert.equal(penguinDraws, 1);
    assert.equal(ctx.calls.some(([method]) => method === 'strokeRect'), true);
});

test('Kevin Cam skips drawing when disabled or Kevin is not soaring', () => {
    const renderer = new KevinCamRenderer();
    const ctx = createContext();
    const penguin = { state: 'idle', x: 0, y: 0, draw: () => assert.fail('should not draw') };

    renderer.draw({ ctx, enabled: false, arrowVisible: true, penguin });
    renderer.draw({ ctx, enabled: true, arrowVisible: true, penguin });

    assert.deepEqual(ctx.calls, []);
});
