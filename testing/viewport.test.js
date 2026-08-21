import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createViewport,
    createWorldCamera,
    screenToStage,
    stageToScreen,
    updateFollowCamera
} from '../js/viewport.js';

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

test('fit camera contains an expanded playfield and preserves its aspect ratio', () => {
    const camera = createWorldCamera(
        { x: 0, y: 0, width: 2400, height: 1200 },
        { mode: 'fit' }
    );
    assert.equal(camera.scale, 1 / 3);
    assert.equal(camera.offsetX, 0);
    assert.equal(camera.offsetY, 100);
    assert.deepEqual(camera.viewRect, { x: 0, y: 0, width: 2400, height: 1200 });
});

test('follow camera eases beyond its dead zone and remains inside the playfield', () => {
    let camera = createWorldCamera(
        { x: 0, y: 0, width: 2400, height: 1800 },
        { mode: 'follow', zoom: 1 },
        { x: 400, y: 300 }
    );
    const originalX = camera.viewRect.x;
    camera = updateFollowCamera(camera, {
        x: 790,
        y: 300,
        velocity: { x: 500, y: 0 }
    }, 1 / 60);
    assert.ok(camera.viewRect.x > originalX);

    for (let index = 0; index < 300; index++) {
        camera = updateFollowCamera(camera, {
            x: 2390,
            y: 1790,
            velocity: { x: 1000, y: 1000 }
        }, 1 / 60);
    }
    assert.ok(camera.viewRect.x + camera.viewRect.width <= 2400);
    assert.ok(camera.viewRect.y + camera.viewRect.height <= 1800);
});

test('camera-aware screen and world conversions remain inverse', () => {
    const viewport = createViewport(960, 540, 2);
    const camera = createWorldCamera(
        { x: 0, y: 0, width: 2400, height: 1800 },
        { mode: 'follow', zoom: 1 },
        { x: 1200, y: 900 }
    );
    const canvas = {
        getBoundingClientRect: () => ({ left: 20, top: 30, width: 960, height: 540 })
    };
    const screenPoint = stageToScreen(canvas, viewport, 1200, 900, camera);
    const worldPoint = screenToStage(canvas, viewport, screenPoint.x, screenPoint.y, camera);
    assert.deepEqual(worldPoint, { x: 1200, y: 900 });
});
