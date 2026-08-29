import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createViewport,
    createWorldCamera,
    panWorldCamera,
    screenToStage,
    stageToScreen,
    updateFollowCamera
} from '../js/rendering/viewport.js';
import { calculateViewportIndicator } from '../js/rendering/viewportGuidanceRenderer.js';

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

test('portrait follow camera crops the world around its focus instead of shrinking it', () => {
    const camera = createWorldCamera(
        { x: 0, y: 0, width: 800, height: 600 },
        { mode: 'follow', zoom: 1.5 },
        { x: 400, y: 300 }
    );

    assert.equal(camera.mode, 'follow');
    assert.equal(camera.scale, 1.5);
    assert.ok(Math.abs(camera.viewRect.x - 133.33333333333331) < 1e-9);
    assert.equal(camera.viewRect.y, 100);
    assert.ok(Math.abs(camera.viewRect.width - 533.3333333333333) < 1e-9);
    assert.equal(camera.viewRect.height, 400);
    assert.ok(camera.viewRect.width < 800);
    assert.ok(camera.viewRect.height < 600);
    assert.equal(camera.viewRect.x + camera.viewRect.width / 2, 400);
    assert.equal(camera.viewRect.y + camera.viewRect.height / 2, 300);
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

test('manual camera panning moves the portrait view and clamps it to the authored stage', () => {
    const camera = createWorldCamera(
        { x: 0, y: 0, width: 800, height: 600 },
        { mode: 'follow', zoom: 1.7 },
        { x: 100, y: 300 }
    );
    const moved = panWorldCamera(camera, 500, -500);

    assert.ok(moved.viewRect.x > camera.viewRect.x);
    assert.equal(moved.viewRect.x + moved.viewRect.width, 800);
    assert.equal(moved.viewRect.y, 0);
    assert.equal(moved.scale, camera.scale);
});

test('portrait camera-aware screen and world conversions remain inverse at high DPI', () => {
    const viewport = createViewport(393, 851, 2);
    const camera = createWorldCamera(
        { x: 0, y: 0, width: 800, height: 600 },
        { mode: 'follow', zoom: 1.5 },
        { x: 400, y: 300 }
    );
    const canvas = {
        getBoundingClientRect: () => ({ left: 12, top: 18, width: 393, height: 851 })
    };
    const screenPoint = stageToScreen(canvas, viewport, 400, 300, camera);
    const worldPoint = screenToStage(canvas, viewport, screenPoint.x, screenPoint.y, camera);

    assert.ok(Math.abs(screenPoint.x - (12 + 393 / 2)) < 1e-9);
    assert.ok(Math.abs(screenPoint.y - (18 + 851 / 2)) < 1e-9);
    assert.ok(Math.abs(worldPoint.x - 400) < 1e-9);
    assert.ok(Math.abs(worldPoint.y - 300) < 1e-9);
});

test('portrait viewport guidance projects an offscreen target onto the right edge', () => {
    const camera = createWorldCamera(
        { x: 0, y: 0, width: 800, height: 600 },
        { mode: 'follow', zoom: 1.5 },
        { x: 400, y: 300 }
    );
    const marker = calculateViewportIndicator(camera, { x: 750, y: 300 });

    assert.ok(marker);
    assert.equal(marker.x, 762);
    assert.equal(marker.y, 300);
    assert.equal(marker.angle, 0);
});

test('portrait viewport guidance projects an offscreen target onto the top edge', () => {
    const camera = createWorldCamera(
        { x: 0, y: 0, width: 800, height: 600 },
        { mode: 'follow', zoom: 1.5 },
        { x: 400, y: 300 }
    );
    const marker = calculateViewportIndicator(camera, { x: 400, y: 50 });

    assert.ok(marker);
    assert.equal(marker.x, 400);
    assert.equal(marker.y, 38);
    assert.equal(marker.angle, -Math.PI / 2);
});

test('viewport guidance omits landmarks already inside the camera view', () => {
    const camera = createWorldCamera(
        { x: 0, y: 0, width: 800, height: 600 },
        { mode: 'follow', zoom: 1.5 },
        { x: 400, y: 300 }
    );

    assert.equal(calculateViewportIndicator(camera, { x: 400, y: 300 }), null);
});
