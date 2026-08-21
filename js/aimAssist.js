import { SIMULATION_CONFIG } from './config/gameConfig.js';
import { SimulationEventType, stepSimulationMutable } from './simulationEngine.js';
import { cloneSimulationState } from './simulationState.js';

export function predictAimAssistTrajectory(stateInput, velocity, options = {}) {
    const config = { ...SIMULATION_CONFIG.aimAssist, ...options };
    const state = cloneSimulationState(stateInput);
    state.penguin.velocity = { ...velocity };
    state.penguin.state = 'soaring';
    state.penguin.crashFramesRemaining = 0;
    state.counters.tries += 1;

    const points = [{ ...state.penguin.position }];
    const totalSteps = Math.max(0, Math.ceil(config.previewSeconds / config.timeStep));
    const sampleEverySteps = Math.max(1, Math.round(config.sampleEverySteps));

    for (let step = 1; step <= totalSteps; step++) {
        const result = stepSimulationMutable(state, config.timeStep, { emitMovementEvents: false });
        for (const event of result.events) {
            if (event.type === SimulationEventType.PORTAL_TELEPORTED) {
                points.push({ ...event.entryPosition });
                points.push({ ...event.exitPosition, move: true });
            }
        }
        const terminal = state.penguin.state !== 'soaring';
        if (terminal || step % sampleEverySteps === 0 || step === totalSteps) {
            points.push({ ...state.penguin.position });
        }
        if (terminal) break;
    }

    return points;
}
