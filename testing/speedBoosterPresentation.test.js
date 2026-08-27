import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import { SpeedBooster } from '../js/runtime/entities/gameObjects.js';
import { RENDER_CONFIG } from '../js/config/renderConfig.js';
import { createRecordingContext } from './testFixtures.js';

function createBoosterContext() {
    const { calls, context } = createRecordingContext();
    context.closePath = (...args) => calls.push(['closePath', ...args]);
    context.fill = (...args) => calls.push(['fill', ...args]);
    return { calls, context };
}

test('speed booster marquee rate scales with its configured multiplier', () => {
    const spacing = 16;
    const normal = new SpeedBooster(0, 0, { speedMultiplier: 1 });
    const double = new SpeedBooster(0, 0, { speedMultiplier: 2 });

    assert.equal(normal.getArrowMarqueeOffset(250, spacing), 6);
    assert.equal(double.getArrowMarqueeOffset(250, spacing), 12);
});

test('speed booster arrows wrap as a clipped repeating strip', () => {
    const booster = new SpeedBooster(0, 0, { width: 64, height: 32, speedMultiplier: 1 });
    const config = RENDER_CONFIG.entities.speedBooster;
    const spacing = booster.width / (config.arrowCount + 1);
    const periodMilliseconds = spacing / config.marqueePixelsPerSecond * 1000;
    const firstFrame = createBoosterContext();
    const wrappedFrame = createBoosterContext();

    booster.drawSprite(firstFrame.context, 0);
    booster.drawSprite(wrappedFrame.context, periodMilliseconds);

    assert.deepEqual(
        firstFrame.calls.filter(([method]) => method === 'moveTo'),
        wrappedFrame.calls.filter(([method]) => method === 'moveTo')
    );
    assert.equal(firstFrame.calls.some(([method]) => method === 'clip'), true);
    assert.equal(
        firstFrame.calls.filter(([method]) => method === 'fill').length,
        config.arrowCount + 3
    );
});
