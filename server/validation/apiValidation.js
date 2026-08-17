import { API_VERSIONS, SERVER_LIMITS } from '../config.js';
import { ApiError, badRequest } from '../errors.js';

const MAX_LAUNCH_POWER = 100;
const LAUNCH_POWER_EPSILON = 1e-9;

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, allowed, path) {
    const unknown = Object.keys(value).filter(key => !allowed.includes(key));
    if (unknown.length) throw badRequest('UNKNOWN_FIELD', `Unsupported field at ${path}.`, { fields: unknown });
}

function requireVersion(actual, expected, field) {
    if (actual !== expected) {
        throw new ApiError(409, 'CLIENT_VERSION_UNSUPPORTED', `Unsupported ${field}.`, {
            field, received: actual, supported: expected
        });
    }
}

export function validateProof(proof) {
    if (!isRecord(proof)) throw badRequest('INVALID_PROOF', 'Proof must be an object.');
    exactKeys(proof, ['proofVersion', 'simulationVersion', 'actions'], '$.proof');
    requireVersion(proof.proofVersion, API_VERSIONS.proofVersion, 'proofVersion');
    requireVersion(proof.simulationVersion, API_VERSIONS.simulationVersion, 'simulationVersion');
    if (!Array.isArray(proof.actions) || proof.actions.length === 0 || proof.actions.length > SERVER_LIMITS.maxActions) {
        throw badRequest('INVALID_PROOF', `Proof actions must contain 1-${SERVER_LIMITS.maxActions} entries.`);
    }
    let priorTick = -1;
    let launches = 0;
    const actions = [];
    for (let index = 0; index < proof.actions.length; index++) {
        const action = proof.actions[index];
        if (!isRecord(action)) throw badRequest('INVALID_PROOF', `Action ${index} must be an object.`);
        if (action.type === 'launch') {
            exactKeys(action, ['tick', 'type', 'angle', 'power'], `$.proof.actions[${index}]`);
            if (!Number.isFinite(action.angle) || !Number.isFinite(action.power) || action.power < 0 || action.power > MAX_LAUNCH_POWER + LAUNCH_POWER_EPSILON) {
                throw badRequest('INVALID_PROOF', `Action ${index} has an illegal launch.`);
            }
            launches++;
            actions.push({ ...action, power: Math.min(action.power, MAX_LAUNCH_POWER) });
        } else if (action.type === 'retry') {
            exactKeys(action, ['tick', 'type'], `$.proof.actions[${index}]`);
            actions.push({ ...action });
        } else {
            throw badRequest('INVALID_PROOF', `Action ${index} has an unsupported type.`);
        }
        if (!Number.isSafeInteger(action.tick) || action.tick < 0 || action.tick <= priorTick || action.tick > SERVER_LIMITS.maxRunTicks) {
            throw badRequest('INVALID_PROOF', 'Action ticks must be strictly increasing bounded integers.');
        }
        priorTick = action.tick;
    }
    if (launches === 0 || launches > SERVER_LIMITS.maxLaunches) {
        throw badRequest('INVALID_PROOF', `Proof must contain 1-${SERVER_LIMITS.maxLaunches} launches.`);
    }
    return { ...proof, actions };
}

export function validatePublicationPayload(payload) {
    if (!isRecord(payload)) throw badRequest('INVALID_PAYLOAD', 'Request body must be a JSON object.');
    exactKeys(payload, ['schemaVersion', 'simulationVersion', 'level', 'completionProof'], '$');
    requireVersion(payload.schemaVersion, API_VERSIONS.schemaVersion, 'schemaVersion');
    requireVersion(payload.simulationVersion, API_VERSIONS.simulationVersion, 'simulationVersion');
    if (!isRecord(payload.level)) throw badRequest('INVALID_LEVEL', 'Level must be an object.');
    return { ...payload, completionProof: validateProof(payload.completionProof) };
}

export function validateScorePayload(payload) {
    if (!isRecord(payload)) throw badRequest('INVALID_PAYLOAD', 'Request body must be a JSON object.');
    exactKeys(payload, ['initials', 'claimedScore', 'simulationVersion', 'scoreVersion', 'proof', 'idempotencyKey'], '$');
    requireVersion(payload.simulationVersion, API_VERSIONS.simulationVersion, 'simulationVersion');
    requireVersion(payload.scoreVersion, API_VERSIONS.scoreVersion, 'scoreVersion');
    const initials = typeof payload.initials === 'string' ? payload.initials.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(initials)) throw badRequest('INVALID_INITIALS', 'Initials must be exactly three ASCII letters.');
    if (!Number.isSafeInteger(payload.claimedScore) || payload.claimedScore < 0) {
        throw badRequest('INVALID_SCORE', 'Claimed score must be a non-negative safe integer.');
    }
    if (typeof payload.idempotencyKey !== 'string' || payload.idempotencyKey.length < 8 || payload.idempotencyKey.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(payload.idempotencyKey)) {
        throw badRequest('INVALID_IDEMPOTENCY_KEY', 'Idempotency key must be 8-100 URL-safe characters.');
    }
    return { ...payload, initials, proof: validateProof(payload.proof) };
}

export function jsonDepth(value) {
    if (!value || typeof value !== 'object') return 0;
    return 1 + Math.max(0, ...Object.values(value).map(jsonDepth));
}
