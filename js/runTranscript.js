// Versioned, transport-neutral proof transcript validation and recording.

export const PROOF_VERSION = 1;
export const SIMULATION_VERSION = 1;

export const RunActionType = Object.freeze({
    LAUNCH: 'launch',
    RETRY: 'retry'
});

export const RUN_PROOF_LIMITS = Object.freeze({
    maxActions: 20,
    maxLaunches: 10,
    maxFlightTicksPerAttempt: 7200,
    maxTotalTicks: 10800,
    minLaunchAngle: -360,
    maxLaunchAngle: 360,
    maxLaunchPower: 100
});

const LAUNCH_POWER_EPSILON = 1e-9;

const TOP_LEVEL_FIELDS = new Set(['proofVersion', 'simulationVersion', 'actions']);
const ACTION_FIELDS = Object.freeze({
    [RunActionType.LAUNCH]: new Set(['tick', 'type', 'angle', 'power']),
    [RunActionType.RETRY]: new Set(['tick', 'type'])
});

export class RunTranscriptError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'RunTranscriptError';
        this.code = code;
        this.details = details;
    }
}

export function validateRunTranscript(input, options = {}) {
    try {
        return { valid: true, transcript: assertValidRunTranscript(input, options), errors: [] };
    } catch (error) {
        if (!(error instanceof RunTranscriptError)) throw error;
        return {
            valid: false,
            transcript: null,
            errors: [{ code: error.code, message: error.message, details: error.details }]
        };
    }
}

export function assertValidRunTranscript(input, options = {}) {
    const limits = { ...RUN_PROOF_LIMITS, ...(options.limits || {}) };
    if (!isPlainObject(input)) fail('INVALID_TRANSCRIPT', 'Transcript must be an object.');
    rejectUnknownFields(input, TOP_LEVEL_FIELDS, 'transcript');
    if (input.proofVersion !== (options.proofVersion ?? PROOF_VERSION)) {
        fail('UNSUPPORTED_PROOF_VERSION', `Unsupported proof version ${String(input.proofVersion)}.`);
    }
    if (input.simulationVersion !== (options.simulationVersion ?? SIMULATION_VERSION)) {
        fail('UNSUPPORTED_SIMULATION_VERSION', `Unsupported simulation version ${String(input.simulationVersion)}.`);
    }
    if (!Array.isArray(input.actions)) fail('INVALID_ACTIONS', 'Transcript actions must be an array.');
    if (input.actions.length === 0) fail('EMPTY_TRANSCRIPT', 'Transcript must contain at least one action.');
    if (input.actions.length > limits.maxActions) {
        fail('TOO_MANY_ACTIONS', `Transcript exceeds ${limits.maxActions} actions.`);
    }

    let priorTick = -1;
    let launches = 0;
    const actions = input.actions.map((action, index) => {
        if (!isPlainObject(action)) fail('INVALID_ACTION', `Action ${index} must be an object.`, { index });
        const allowedFields = ACTION_FIELDS[action.type];
        if (!allowedFields) fail('UNSUPPORTED_ACTION', `Action ${index} has an unsupported type.`, { index });
        rejectUnknownFields(action, allowedFields, `action ${index}`);
        if (!Number.isSafeInteger(action.tick) || action.tick < 0) {
            fail('INVALID_ACTION_TICK', `Action ${index} tick must be a non-negative safe integer.`, { index });
        }
        if (action.tick <= priorTick) {
            fail('UNORDERED_ACTIONS', 'Action ticks must be strictly increasing.', { index });
        }
        if (action.tick >= limits.maxTotalTicks) {
            fail('RUN_TICK_LIMIT_EXCEEDED', `Action ${index} exceeds the run tick limit.`, { index });
        }
        priorTick = action.tick;

        if (action.type === RunActionType.LAUNCH) {
            launches += 1;
            if (launches > limits.maxLaunches) {
                fail('TOO_MANY_LAUNCHES', `Transcript exceeds ${limits.maxLaunches} launches.`);
            }
            if (!Number.isFinite(action.angle) || action.angle < limits.minLaunchAngle || action.angle > limits.maxLaunchAngle) {
                fail('INVALID_LAUNCH_ANGLE', `Action ${index} angle is outside the supported range.`, { index });
            }
            if (!Number.isFinite(action.power) || action.power < 0 || action.power > limits.maxLaunchPower) {
                fail('INVALID_LAUNCH_POWER', `Action ${index} power must be between 0 and ${limits.maxLaunchPower}.`, { index });
            }
            return { tick: action.tick, type: action.type, angle: action.angle, power: action.power };
        }
        return { tick: action.tick, type: action.type };
    });

    return {
        proofVersion: input.proofVersion,
        simulationVersion: input.simulationVersion,
        actions
    };
}

export class RunTranscriptRecorder {
    constructor(versions = {}) {
        this.proofVersion = versions.proofVersion ?? PROOF_VERSION;
        this.simulationVersion = versions.simulationVersion ?? SIMULATION_VERSION;
        this.actions = [];
        this.frozen = false;
    }

    recordLaunch(tick, angle, power) {
        const maximum = RUN_PROOF_LIMITS.maxLaunchPower;
        const normalizedPower = power > maximum && power <= maximum + LAUNCH_POWER_EPSILON
            ? maximum
            : power;
        return this.record({ tick, type: RunActionType.LAUNCH, angle, power: normalizedPower });
    }

    recordRetry(tick) {
        return this.record({ tick, type: RunActionType.RETRY });
    }

    record(action) {
        if (this.frozen) throw new RunTranscriptError('TRANSCRIPT_FROZEN', 'Completed transcript cannot be changed.');
        const candidate = this.snapshotWith(action);
        assertValidRunTranscript(candidate);
        this.actions.push({ ...action });
        return this;
    }

    freeze() {
        const transcript = assertValidRunTranscript(this.snapshotWith());
        this.frozen = true;
        return Object.freeze({ ...transcript, actions: Object.freeze(transcript.actions.map(Object.freeze)) });
    }

    snapshotWith(action) {
        return {
            proofVersion: this.proofVersion,
            simulationVersion: this.simulationVersion,
            actions: action ? [...this.actions, action] : [...this.actions]
        };
    }
}

function rejectUnknownFields(value, allowed, location) {
    const unknown = Object.keys(value).find(key => !allowed.has(key));
    if (unknown) fail('UNKNOWN_FIELD', `Unknown field "${unknown}" in ${location}.`, { field: unknown, location });
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function fail(code, message, details) {
    throw new RunTranscriptError(code, message, details);
}
