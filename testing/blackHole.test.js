import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
import { stepSimulationMutable } from '../js/simulation/simulationEngine.js';
import { LevelObjectType } from '../js/levels/levelSchema.js';

function blackHoleLevel(position = { x: 300, y: 300 }) {
    return {
        name: 'Black Hole Test',
        startPosition: { x: 100, y: 300 },
        targetPosition: { x: 700, y: 300 },
        objects: [
            {
                type: LevelObjectType.BLACK_HOLE,
                position,
                properties: {
                    id: 'black-hole-1',
                    radius: 32,
                    mass: 500,
                    gravitationalReach: 5000
                }
            }
        ],
        rules: { gravitationalConstant: 3 }
    };
}

test('black hole participates in gravity', () => {
    const state = createSimulationStateFromLevel(blackHoleLevel());
    assert.equal(state.planets.length, 1);
    assert.equal(state.planets[0].type, LevelObjectType.BLACK_HOLE);
    assert.equal(state.planets[0].collisionRadius, 0);

    state.penguin.state = 'soaring';
    state.penguin.position = { x: 100, y: 300 };
    state.penguin.velocity = { x: 0, y: 0 };

    stepSimulationMutable(state, 1 / 60);

    assert.ok(state.penguin.velocity.x > 0, 'black hole should accelerate the penguin toward itself');
    assert.equal(state.penguin.state, 'soaring');
});

test('black hole has no collision even through its center', () => {
    const center = { x: 300, y: 300 };
    const state = createSimulationStateFromLevel(blackHoleLevel(center));
    state.penguin.state = 'soaring';
    state.penguin.position = { ...center };
    state.penguin.velocity = { x: 20, y: 0 };

    const { events } = stepSimulationMutable(state, 1 / 60);

    assert.equal(state.penguin.state, 'soaring');
    assert.ok(state.penguin.position.x > center.x, 'penguin should pass through the black hole');
    assert.equal(events.some(event => event.type === 'planet_collision'), false);
});
