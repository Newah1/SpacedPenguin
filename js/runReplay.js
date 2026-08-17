import { calculateCommunityScore } from './communityScore.js';
import {
    launchSimulationPenguinMutable,
    SimulationEventType,
    stepSimulationTickMutable
} from './simulationEngine.js';
import {
    createSimulationStateFromLevel,
    resetSimulationAttempt
} from './simulationState.js';
import {
    assertValidRunTranscript,
    RUN_PROOF_LIMITS,
    RunActionType,
    RunTranscriptError
} from './runTranscript.js';

const OBSERVABLE_EVENTS = new Set(Object.values(SimulationEventType).filter(
    type => type !== SimulationEventType.PENGUIN_MOVED
));

/**
 * Replays a proof from a fresh level state. Protocol actions happen at the
 * start of their numbered tick; physics then advances exactly 1/60 second.
 */
export function replayRun(level, transcriptInput, options = {}) {
    const limits = { ...RUN_PROOF_LIMITS, ...(options.limits || {}) };
    const transcript = assertValidRunTranscript(transcriptInput, { limits });
    const initialState = createSimulationStateFromLevel(level, {
        source: options.source || 'run proof level'
    });
    let state = resetSimulationAttempt(initialState);
    let actionIndex = 0;
    let flightTicks = 0;
    let terminal = null;
    const events = [];

    while (state.runTick < limits.maxTotalTicks && !terminal) {
        const tick = state.runTick;
        const action = transcript.actions[actionIndex];
        if (action?.tick === tick) {
            applyAction(state, initialState, action, actionIndex);
            if (action.type === RunActionType.RETRY) {
                state = resetSimulationAttempt(initialState, state);
                flightTicks = 0;
            } else {
                flightTicks = 0;
            }
            actionIndex += 1;
        }

        const wasInFlight = state.penguin.state === 'soaring' || state.penguin.state === 'crashed';
        const stepped = stepSimulationTickMutable(state, { emitMovementEvents: false });
        if (wasInFlight) flightTicks += 1;
        if (flightTicks > limits.maxFlightTicksPerAttempt) {
            return finish(false, 'flight_tick_limit', state, events, transcript);
        }

        const observed = stepped.events.filter(event => OBSERVABLE_EVENTS.has(event.type));
        for (const event of observed) events.push({ tick, ...event });
        const targetHit = observed.find(event => event.type === SimulationEventType.TARGET_HIT);
        const ruleFailure = observed.find(event => event.type === SimulationEventType.RULE_FAILURE);
        if (targetHit) terminal = { success: true, reason: 'target_hit' };
        else if (ruleFailure) terminal = { success: false, reason: `rule_failure:${ruleFailure.rule}` };
        else if (observed.some(event => event.type === SimulationEventType.PLANET_COLLISION)) {
            // The browser immediately invokes tryAgain for a planet collision.
            state = resetSimulationAttempt(initialState, state);
            flightTicks = 0;
        } else if (observed.some(event => event.type === SimulationEventType.ATTEMPT_RESET_REQUIRED)) {
            state = resetSimulationAttempt(initialState, state);
            flightTicks = 0;
        }

        if (terminal && actionIndex < transcript.actions.length) {
            throw new RunTranscriptError(
                'ACTION_AFTER_TERMINAL',
                'Transcript contains an action after the run ended.',
                { index: actionIndex, terminalTick: tick }
            );
        }

        // There is no possible future input or automatic outcome from idle.
        if (!terminal && actionIndex >= transcript.actions.length && state.penguin.state === 'idle') {
            return finish(false, 'actions_exhausted', state, events, transcript);
        }
    }

    if (!terminal) return finish(false, 'run_tick_limit', state, events, transcript);
    return finish(terminal.success, terminal.reason, state, events, transcript);
}

function applyAction(state, initialState, action, index) {
    if (action.type === RunActionType.LAUNCH) {
        if (state.penguin.state !== 'idle') {
            throw new RunTranscriptError('ILLEGAL_LAUNCH', 'Launch is only legal while the penguin is ready.', { index });
        }
        if (action.power > state.slingshot.maxPullback) {
            throw new RunTranscriptError('INVALID_LAUNCH_POWER', 'Launch power exceeds the level slingshot limit.', {
                index,
                maximum: state.slingshot.maxPullback
            });
        }
        launchSimulationPenguinMutable(state, action.angle, action.power);
        return;
    }
    if (state.penguin.state !== 'soaring' && state.penguin.state !== 'crashed') {
        throw new RunTranscriptError('ILLEGAL_RETRY', 'Retry is only legal during an active attempt.', { index });
    }
    // Keep this reference in the signature to make reset semantics explicit.
    void initialState;
}

function finish(success, reason, state, events, transcript) {
    return {
        success,
        reason,
        runTick: state.runTick,
        state,
        events,
        transcript,
        score: success ? calculateCommunityScore({
            distance: state.counters.distance,
            tries: state.counters.tries,
            bonusScore: state.counters.currentAttemptScore,
            multiplier: state.rules.scoreMultiplier
        }) : null
    };
}
