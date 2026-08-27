import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import { Penguin } from '../js/runtime/entities/penguin.js';
import { LevelEditorOverlayRenderer } from '../js/editor/views/overlayRenderer.js';
import { applyGameSimulationEvents } from '../js/runtime/gameSimulationAdapter.js';
import { SimulationEventType } from '../js/simulation/simulationEngine.js';
import { Portal } from '../js/runtime/entities/gameObjects.js';
import { createRecordingContext } from './testFixtures.js';

test('editor portal arrow points out of the active face', () => {
    const { calls, context } = createRecordingContext();
    const portal = {
        position: { x: 100, y: 80 },
        width: 48,
        height: 18,
        rotation: 0,
        tint: '#f00'
    };

    LevelEditorOverlayRenderer.prototype.drawPortalDirectionArrow.call({}, context, portal);

    assert.deepEqual(calls.find(call => call[0] === 'moveTo'), ['moveTo', 100, 66]);
    assert.deepEqual(calls.find(call => call[0] === 'lineTo'), ['lineTo', 100, 42]);
});

test('only the deeper portal rim is redrawn above the penguin', () => {
    const portal = new Portal(100, 80, { width: 48, height: 18, rotation: 0 });
    const arcs = [];
    const context = {
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        beginPath() {},
        stroke() {},
        ellipse: (...args) => arcs.push(args)
    };

    portal.drawForeground(context);

    assert.equal(arcs.length, 1);
    assert.deepEqual(arcs[0].slice(-2), [0, Math.PI]);
});

test('live penguin trail does not connect portal endpoints', () => {
    const penguin = new Penguin();
    penguin.trail = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    penguin.markTrailDiscontinuity({ x: 100, y: 50 });
    penguin.trail.push({ x: 110, y: 50 });
    const { calls, context } = createRecordingContext();

    penguin.drawTrailCanvas(context);

    assert.deepEqual(
        calls.filter(call => call[0] === 'moveTo'),
        [['moveTo', 0, 0], ['moveTo', 100, 50]]
    );
    assert.deepEqual(
        calls.filter(call => call[0] === 'lineTo'),
        [['lineTo', 10, 0], ['lineTo', 110, 50]]
    );
});

test('portal events mark the live trail at the exit', () => {
    const marked = [];
    const game = {
        penguin: { markTrailDiscontinuity: position => marked.push(position) },
        playSound() {},
        beginPortalTransition() {},
        recordPortalTransit() {},
        updateUI() {}
    };
    const exitPosition = { x: 320, y: 240 };

    applyGameSimulationEvents(game, [{
        type: SimulationEventType.PORTAL_TELEPORTED,
        entryPosition: { x: 50, y: 20 },
        exitPosition,
        playSound: false
    }], 1 / 60);

    assert.deepEqual(marked, [exitPosition]);
});
