import test from 'node:test';
import assert from 'node:assert/strict';

import { predictAimAssistTrajectory } from '../js/aimAssist.js';
import { createSimulationStateFromLevel } from '../js/simulationState.js';

function createState(objects = []) {
    return createSimulationStateFromLevel({
        name: 'Aim assist fixture',
        startPosition: { x: 100, y: 300 },
        targetPosition: { x: 750, y: 550 },
        objects: [
            { type: 'slingshot', position: { x: 100, y: 300 }, properties: {} },
            { type: 'target', position: { x: 750, y: 550 }, properties: {} },
            ...objects
        ],
        rules: { gravitationalConstant: 0 }
    });
}

test('aim assist predicts a bounded trajectory without mutating live state', () => {
    const state = createState();
    state.penguin.position = { x: 40, y: 300 };
    const originalState = structuredClone(state);
    const points = predictAimAssistTrajectory(state, { x: 120, y: 0 }, {
        previewSeconds: 0.5,
        timeStep: 1 / 60,
        sampleEverySteps: 5
    });

    assert.deepEqual(state, originalState);
    assert.deepEqual(points[0], { x: 40, y: 300 });
    assert.equal(points.length, 7);
    assert.ok(points.at(-1).x > points[0].x);
});

test('aim assist horizon is tunable and stops at a predicted collision', () => {
    const state = createState([
        {
            type: 'planet',
            position: { x: 145, y: 300 },
            properties: { radius: 10, collisionRadius: 10, mass: 0, gravitationalReach: 1 }
        }
    ]);
    state.penguin.position = { x: 100, y: 300 };

    const shortPath = predictAimAssistTrajectory(state, { x: 60, y: 0 }, {
        previewSeconds: 0.2,
        sampleEverySteps: 1
    });
    const longPath = predictAimAssistTrajectory(state, { x: 60, y: 0 }, {
        previewSeconds: 2,
        sampleEverySteps: 1
    });

    assert.ok(shortPath.length < longPath.length);
    assert.ok(longPath.length < 121, 'collision should terminate the two-second preview early');
});

test('aim assist marks portal jumps as disconnected path segments', () => {
    const state = createState([
        { type: 'portal', position: { x: 150, y: 300 }, properties: {
            id: 'red', pairedPortalId: 'blue', color: 'red', rotation: 0
        } },
        { type: 'portal', position: { x: 400, y: 300 }, properties: {
            id: 'blue', pairedPortalId: 'red', color: 'blue', rotation: 180
        } }
    ]);
    const points = predictAimAssistTrajectory(state, { x: 6000, y: 0 }, {
        previewSeconds: 1 / 60,
        timeStep: 1 / 60,
        sampleEverySteps: 1
    });

    assert.equal(points.some(point => point.move === true), true);
});
