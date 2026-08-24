import test from 'node:test';
import assert from 'node:assert/strict';
import './nodeShims.js';

import { SimulationEventType, stepSimulation } from '../js/simulationEngine.js';
import { createSimulationStateFromLevel } from '../js/simulationState.js';
import { getPortalOutwardDirection } from '../js/portalGeometry.js';

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

function runNormalCrossing({ rotation, fromFront }) {
    const state = createSimulationStateFromLevel(portalLevel(rotation));
    const portal = state.portals.find(candidate => candidate.id === 'entry');
    const outward = getPortalOutwardDirection(portal);
    const side = fromFront ? 1 : -1;
    state.penguin.position = {
        x: portal.position.x + outward.x * 100 * side,
        y: portal.position.y + outward.y * 100 * side
    };
    state.penguin.velocity = {
        x: -outward.x * 6000 * side,
        y: -outward.y * 6000 * side
    };
    state.penguin.state = 'soaring';
    return stepSimulation(state, 1 / 60);
}

test('portal teleports when crossed from its active face', () => {
    const result = runNormalCrossing({ rotation: 0, fromFront: true });

    assert.equal(
        result.events.some(event => event.type === SimulationEventType.PORTAL_TELEPORTED),
        true
    );
    assert.ok(result.state.penguin.position.y > 0);
});

test('portal is inert when crossed from behind', () => {
    const result = runNormalCrossing({ rotation: 0, fromFront: false });

    assert.equal(
        result.events.some(event => event.type === SimulationEventType.PORTAL_TELEPORTED),
        false
    );
    assert.ok(result.state.penguin.position.y <= Number.EPSILON);
    assert.equal(result.state.penguin.velocity.y, -6000);
});

test('rotating a portal rotates which side is active', () => {
    const result = runNormalCrossing({ rotation: 90, fromFront: true });

    assert.equal(
        result.events.some(event => event.type === SimulationEventType.PORTAL_TELEPORTED),
        true
    );
});

test('directional acceptance is consistent for cardinal and diagonal rotations', () => {
    for (const rotation of [0, 45, 90, 180, 270]) {
        const front = runNormalCrossing({ rotation, fromFront: true });
        const back = runNormalCrossing({ rotation, fromFront: false });
        assert.equal(
            front.events.some(event => event.type === SimulationEventType.PORTAL_TELEPORTED),
            true,
            `rotation ${rotation} should accept an approach against its outward normal`
        );
        assert.equal(
            back.events.some(event => event.type === SimulationEventType.PORTAL_TELEPORTED),
            false,
            `rotation ${rotation} should reject an approach from behind`
        );
    }
});
