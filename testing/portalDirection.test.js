import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import { SimulationEventType, stepSimulation } from '../js/simulationEngine.js';
import { createSimulationStateFromLevel } from '../js/simulationState.js';

function portalLevel(rotation = 0) {
    return {
        name: 'One-sided portal fixture',
        startPosition: { x: 0, y: 0 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 0, y: 0 }, properties: { velocityMultiplier: 8 } },
            { type: 'target', position: { x: 700, y: 300 }, properties: { width: 60, height: 60 } },
            { type: 'portal', position: { x: 50, y: 0 }, properties: {
                id: 'entry', pairedPortalId: 'exit', color: 'red', width: 48, height: 18, rotation
            } },
            { type: 'portal', position: { x: 300, y: 0 }, properties: {
                id: 'exit', pairedPortalId: 'entry', color: 'blue', width: 48, height: 18, rotation: rotation + 180
            } }
        ],
        rules: { gravitationalConstant: 0 }
    };
}

function runCrossing({ startX, velocityX, rotation = 0 }) {
    const state = createSimulationStateFromLevel(portalLevel(rotation));
    state.penguin.position = { x: startX, y: 0 };
    state.penguin.velocity = { x: velocityX, y: 0 };
    state.penguin.state = 'soaring';
    return stepSimulation(state, 1 / 60);
}

test('portal teleports when crossed from its active face', () => {
    const result = runCrossing({ startX: 0, velocityX: 6000 });

    assert.equal(
        result.events.some(event => event.type === SimulationEventType.PORTAL_TELEPORTED),
        true
    );
    assert.ok(result.state.penguin.position.x > 300);
});

test('portal is inert when crossed from behind', () => {
    const result = runCrossing({ startX: 100, velocityX: -6000 });

    assert.equal(
        result.events.some(event => event.type === SimulationEventType.PORTAL_TELEPORTED),
        false
    );
    assert.ok(result.state.penguin.position.x < 50);
    assert.equal(result.state.penguin.velocity.x, -6000);
});

test('rotating a portal rotates which side is active', () => {
    const result = runCrossing({ startX: 100, velocityX: -6000, rotation: 180 });

    assert.equal(
        result.events.some(event => event.type === SimulationEventType.PORTAL_TELEPORTED),
        true
    );
});
