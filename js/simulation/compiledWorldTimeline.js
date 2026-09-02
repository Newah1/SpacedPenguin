import { advanceOrbitGraph } from './orbitSimulation.js';
import { cloneSimulationState } from './simulationState.js';
import { advanceWaypointPathsMutable } from './waypointSimulation.js';

function worldEntities(state) {
    return [
        ...state.planets,
        ...state.bonuses,
        ...(state.portals || []),
        ...(state.speedBoosters || []),
        ...(state.deflectorBumpers || []),
        ...(state.decorations || []),
        state.target,
        state.slingshot
    ];
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
        this.portalCount = initialState.portals?.length || 0;
        this.speedBoosterCount = initialState.speedBoosters?.length || 0;
        this.deflectorBumperCount = initialState.deflectorBumpers?.length || 0;
        this.decorationCount = initialState.decorations?.length || 0;
        this.entityCount = this.planetCount + this.bonusCount + this.portalCount +
            this.speedBoosterCount + this.deflectorBumperCount + this.decorationCount + 2;
        this.positions = new Float64Array(maxSteps * this.entityCount * 2);
        this.slingshotAnchors = new Float64Array(maxSteps * 2);
        this.orbitStates = new Float64Array(maxSteps * this.entityCount * 4);
        this.waypointPhases = new Float64Array(maxSteps * this.entityCount);
        this.compile(initialState);
    }

    compile(initialState) {
        let entities = worldEntities(cloneSimulationState(initialState));
        for (let step = 0; step < this.maxSteps; step++) {
            entities = advanceOrbitGraph(entities, this.timeStep);
            advanceWaypointPathsMutable(entities, this.timeStep);
            const frameOffset = step * this.entityCount * 2;
            const orbitFrameOffset = step * this.entityCount * 4;
            for (let index = 0; index < entities.length; index++) {
                const positionOffset = frameOffset + index * 2;
                this.positions[positionOffset] = entities[index].position.x;
                this.positions[positionOffset + 1] = entities[index].position.y;
                const orbitOffset = orbitFrameOffset + index * 4;
                const orbit = entities[index].orbit;
                this.orbitStates[orbitOffset] = orbit?.angle ?? 0;
                this.orbitStates[orbitOffset + 1] = orbit?.velocity.x ?? 0;
                this.orbitStates[orbitOffset + 2] = orbit?.velocity.y ?? 0;
                this.orbitStates[orbitOffset + 3] = orbit?.frameAccumulator ?? 0;
                this.waypointPhases[step * this.entityCount + index] =
                    entities[index].waypointPath?.phase ?? 0;
            }
            const slingshot = entities.at(-1);
            const anchor = slingshot.anchorPosition || slingshot.position;
            this.slingshotAnchors[step * 2] = anchor.x;
            this.slingshotAnchors[step * 2 + 1] = anchor.y;
        }
    }

    applyFrame(state, step) {
        if (!Number.isInteger(step) || step < 0 || step >= this.maxSteps) {
            throw new RangeError(`timeline step ${step} is outside 0..${this.maxSteps - 1}`);
        }
        const frameOffset = step * this.entityCount * 2;
        const orbitFrameOffset = step * this.entityCount * 4;
        let entityIndex = 0;
        for (const planet of state.planets) {
            applyPosition(planet.position, this.positions, frameOffset + entityIndex * 2);
            applyOrbitState(planet.orbit, this.orbitStates, orbitFrameOffset + entityIndex * 4);
            applyWaypointPhase(planet.waypointPath, this.waypointPhases, step * this.entityCount + entityIndex);
            entityIndex++;
        }
        for (const bonus of state.bonuses) {
            applyPosition(bonus.position, this.positions, frameOffset + entityIndex * 2);
            applyOrbitState(bonus.orbit, this.orbitStates, orbitFrameOffset + entityIndex * 4);
            applyWaypointPhase(bonus.waypointPath, this.waypointPhases, step * this.entityCount + entityIndex);
            entityIndex++;
        }
        for (const portal of state.portals || []) {
            applyPosition(portal.position, this.positions, frameOffset + entityIndex * 2);
            applyWaypointPhase(portal.waypointPath, this.waypointPhases, step * this.entityCount + entityIndex);
            entityIndex++;
        }
        for (const speedBooster of state.speedBoosters || []) {
            applyPosition(speedBooster.position, this.positions, frameOffset + entityIndex * 2);
            applyWaypointPhase(speedBooster.waypointPath, this.waypointPhases, step * this.entityCount + entityIndex);
            entityIndex++;
        }
        for (const bumper of state.deflectorBumpers || []) {
            applyPosition(bumper.position, this.positions, frameOffset + entityIndex * 2);
            applyWaypointPhase(bumper.waypointPath, this.waypointPhases, step * this.entityCount + entityIndex);
            entityIndex++;
        }
        for (const decoration of state.decorations || []) {
            applyPosition(decoration.position, this.positions, frameOffset + entityIndex * 2);
            applyWaypointPhase(decoration.waypointPath, this.waypointPhases, step * this.entityCount + entityIndex);
            entityIndex++;
        }
        applyPosition(state.target.position, this.positions, frameOffset + entityIndex * 2);
        applyOrbitState(state.target.orbit, this.orbitStates, orbitFrameOffset + entityIndex * 4);
        applyWaypointPhase(state.target.waypointPath, this.waypointPhases, step * this.entityCount + entityIndex);
        entityIndex++;
        applyPosition(state.slingshot.position, this.positions, frameOffset + entityIndex * 2);
        applyPosition(state.slingshot.anchorPosition, this.slingshotAnchors, step * 2);
        applyWaypointPhase(state.slingshot.waypointPath, this.waypointPhases, step * this.entityCount + entityIndex);
    }
}

function applyWaypointPhase(path, phases, offset) {
    if (path) path.phase = phases[offset];
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
    orbit.frameAccumulator = orbitStates[offset + 3];
}
