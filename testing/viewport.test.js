import test from 'node:test';
import assert from 'node:assert/strict';

import { createViewport, screenToStage, stageToScreen } from '../js/viewport.js';

test('16:9 viewport preserves the stage and centers horizontal gutters', () => {
    const viewport = createViewport(1920, 1080, 1);

    assert.equal(viewport.backingWidth, 1920);
    assert.equal(viewport.backingHeight, 1080);
    assert.equal(viewport.scale, 1.8);
    assert.equal(viewport.offsetX, 240);
    assert.equal(viewport.offsetY, 0);
    assert.equal(viewport.viewRect.x, 0);
    assert.equal(viewport.viewRect.y, 0);
    assert.equal(viewport.viewRect.width, 800);
    assert.equal(viewport.viewRect.height, 600);
});

test('portrait viewport preserves the stage and centers vertical gutters', () => {
    const viewport = createViewport(600, 900, 1);

    assert.equal(viewport.scale, 0.75);
    assert.equal(viewport.offsetX, 0);
    assert.equal(viewport.offsetY, 225);
    assert.equal(viewport.viewRect.x, 0);
    assert.equal(viewport.viewRect.y, 0);
    assert.equal(viewport.viewRect.width, 800);
    assert.equal(viewport.viewRect.height, 600);
});

test('screen and stage coordinate conversions are inverse at high DPI', () => {
    const viewport = createViewport(960, 540, 2);
    const canvas = {
        getBoundingClientRect: () => ({ left: 20, top: 30, width: 960, height: 540 })
    };
    const screenPoint = stageToScreen(canvas, viewport, 400, 300);
    const stagePoint = screenToStage(canvas, viewport, screenPoint.x, screenPoint.y);

    assert.deepEqual(screenPoint, { x: 500, y: 300 });
    assert.deepEqual(stagePoint, { x: 400, y: 300 });
});
