import { API_VERSIONS } from '../config.js';
import { ApiError } from '../errors.js';
import { canonicalJson, sha256 } from '../utils/canonicalJson.js';
import { validateScorePayload } from '../validation/apiValidation.js';

function validResult(result) {
    const values = {
        score: result.score,
        tries: result.tries,
        distance: result.distance,
        bonusScore: result.bonusScore ?? 0,
        multiplier: result.multiplier ?? 1
    };
    if (!Number.isSafeInteger(values.score) || values.score < 0 || !Number.isSafeInteger(values.tries) || values.tries < 1
        || !Number.isFinite(values.distance) || values.distance < 0 || !Number.isSafeInteger(values.bonusScore)
        || !Number.isFinite(values.multiplier) || values.multiplier <= 0) {
        throw new ApiError(500, 'INVALID_VERIFIER_RESULT', 'The verifier returned an invalid score result.');
    }
    return values;
}

export async function submitScore({ levelId, payload, repository, verifier }) {
    const validated = validateScorePayload(payload);
    const level = repository.getLevel(levelId);
    if (!level) throw new ApiError(404, 'LEVEL_NOT_FOUND', 'The requested level was not found.');
    const requestHash = sha256({
        initials: validated.initials,
        claimedScore: validated.claimedScore,
        simulationVersion: validated.simulationVersion,
        scoreVersion: validated.scoreVersion,
        proof: validated.proof
    });
    const existing = repository.findScoreByIdempotency(levelId, validated.idempotencyKey);
    if (existing) {
        if (existing.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different submission.');
        return repository.insertScore({ levelId, idempotencyKey: validated.idempotencyKey, requestHash });
    }
    const replay = await verifier.verifyScore({ level: level.definition, proof: validated.proof });
    const result = validResult(replay.result || replay);
    if (result.score !== validated.claimedScore) {
        throw new ApiError(422, 'CLAIMED_SCORE_MISMATCH', 'The claimed score does not match the authoritative replay.', {
            claimedScore: validated.claimedScore,
            calculatedScore: result.score
        });
    }
    const proofJson = canonicalJson(validated.proof);
    return repository.insertScore({
        levelId,
        initials: validated.initials,
        ...result,
        proofJson,
        proofHash: sha256({ levelId, proof: validated.proof, simulationVersion: API_VERSIONS.simulationVersion }),
        requestHash,
        simulationVersion: API_VERSIONS.simulationVersion,
        scoreVersion: API_VERSIONS.scoreVersion,
        idempotencyKey: validated.idempotencyKey
    });
}
