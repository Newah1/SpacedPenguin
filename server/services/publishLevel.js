import { API_VERSIONS } from '../config.js';
import { ApiError } from '../errors.js';
import { canonicalJson, sha256 } from '../utils/canonicalJson.js';
import { validatePublicationPayload } from '../validation/apiValidation.js';
import { normalizeAndValidatePublishedLevel } from '../validation/publishingPolicy.js';

export async function publishLevel({ payload, repository, verifier }) {
    const validated = validatePublicationPayload(payload);
    const level = normalizeAndValidatePublishedLevel(validated.level);
    const definitionJson = canonicalJson(level);
    const definitionHash = sha256(definitionJson);
    const duplicate = repository.findLevelByHash(definitionHash);
    if (duplicate) throw new ApiError(409, 'DUPLICATE_LEVEL', 'This exact level has already been published.', { levelId: duplicate.id });
    await verifier.verifyPublication({ level, proof: validated.completionProof });
    try {
        return repository.insertLevel({
            name: level.name,
            description: level.description,
            definitionJson,
            definitionHash,
            completionProofJson: canonicalJson(validated.completionProof),
            schemaVersion: API_VERSIONS.schemaVersion,
            simulationVersion: API_VERSIONS.simulationVersion,
            objectCount: level.objects.length
        });
    } catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed: levels.definition_hash')) {
            const existing = repository.findLevelByHash(definitionHash);
            throw new ApiError(409, 'DUPLICATE_LEVEL', 'This exact level has already been published.', { levelId: existing?.id });
        }
        throw error;
    }
}
