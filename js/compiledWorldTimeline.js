import { advanceOrbitGraph } from './orbitSimulation.js';
import { cloneSimulationState } from './simulationState.js';

function worldEntities(state) {
    return [...state.planets, ...state.bonuses, state.target];
}

/**
 * Exact, read-only world motion compiled at a fixed simulation step.
 *
 * World entities never depend on the penguin, so headless candidates can
 * share their world frames. Frames store positions and mutable orbit fields
 * after each orbit step, matching stepSimulation's
 * advance-world-before-collision ordering.
 */
export class CompiledWorldTimeline {
    constructor(initialState, timeStep, maxSteps) {
        if (!(timeStep > 0)) throw new RangeError('timeStep must be positive');
        if (!Number.isInteger(maxSteps) || maxSteps < 0) {
            throw new RangeError('maxSteps must be a non-negative integer');
        }

        this.timeStep = timeStep;
        this.maxSteps = maxSteps;
        this.planetCount = initialState.planets.length;
        this.bonusCount = initialState.bonuses.length;
        this.entityCount = this.planetCount + this.bonusCount + 1;
        this.positions = new Float64Array(maxSteps * this.entityCount * 2);
        this.orbitStates = new Float64Array(maxSteps * this.entityCount * 3);
        this.compile(initialState);
    }

    compile(initialState) {
        let entities = worldEntities(cloneSimulationState(initialState));
        for (let step = 0; step < this.maxSteps; step++) {
            entities = advanceOrbitGraph(entities, this.timeStep);
            const frameOffset = step * this.entityCount * 2;
            const orbitFrameOffset = step * this.entityCount * 3;
            for (let index = 0; index < entities.length; index++) {
                const positionOffset = frameOffset + index * 2;
                this.positions[positionOffset] = entities[index].position.x;
                this.positions[positionOffset + 1] = entities[index].position.y;
                const orbitOffset = orbitFrameOffset + index * 3;
                const orbit = entities[index].orbit;
                this.orbitStates[orbitOffset] = orbit?.angle ?? 0;
                this.orbitStates[orbitOffset + 1] = orbit?.velocity.x ?? 0;
                this.orbitStates[orbitOffset + 2] = orbit?.velocity.y ?? 0;
            }
        }
    }

    applyFrame(state, step) {
        if (!Number.isInteger(step) || step < 0 || step >= this.maxSteps) {
            throw new RangeError(`timeline step ${step} is outside 0..${this.maxSteps - 1}`);
        }
        const frameOffset = step * this.entityCount * 2;
        const orbitFrameOffset = step * this.entityCount * 3;
        let entityIndex = 0;
        for (const planet of state.planets) {
            applyPosition(planet.position, this.positions, frameOffset + entityIndex * 2);
            applyOrbitState(planet.orbit, this.orbitStates, orbitFrameOffset + entityIndex * 3);
            entityIndex++;
        }
        for (const bonus of state.bonuses) {
            applyPosition(bonus.position, this.positions, frameOffset + entityIndex * 2);
            applyOrbitState(bonus.orbit, this.orbitStates, orbitFrameOffset + entityIndex * 3);
            entityIndex++;
        }
        applyPosition(state.target.position, this.positions, frameOffset + entityIndex * 2);
        applyOrbitState(state.target.orbit, this.orbitStates, orbitFrameOffset + entityIndex * 3);
    }
}

function applyPosition(target, positions, offset) {
    target.x = positions[offset];
    target.y = positions[offset + 1];
}

function applyOrbitState(orbit, orbitStates, offset) {
    if (!orbit) return;
    orbit.angle = orbitStates[offset];
    orbit.velocity.x = orbitStates[offset + 1];
    orbit.velocity.y = orbitStates[offset + 2];
}
