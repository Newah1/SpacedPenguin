import { ApiError } from '../errors.js';

function assertCompleted(result, code) {
    if (!result || result.completed !== true) {
        throw new ApiError(422, code, 'The submitted run did not complete the level.', {
            reason: result?.reason || 'target_not_reached'
        });
    }
    return result;
}

export class SharedReplayVerifier {
    async #run(level, proof, mode) {
        let module;
        try {
            module = await import('../../js/runReplay.js');
        } catch (error) {
            throw new ApiError(503, 'VERIFIER_UNAVAILABLE', 'The deterministic replay verifier is unavailable.', { cause: error.code });
        }
        const replay = module.replayRun || module.runReplay || module.default;
        if (typeof replay !== 'function') throw new ApiError(503, 'VERIFIER_UNAVAILABLE', 'The deterministic replay verifier is unavailable.');
        try {
            const replayed = replay === module.replayRun
                ? replay(level, proof, { mode })
                : replay({ level, proof, mode });
            return {
                ...replayed,
                completed: replayed.completed ?? replayed.success,
                result: replayed.result ?? replayed.score
            };
        } catch (error) {
            if (error?.name === 'RunTranscriptError') {
                throw new ApiError(422, mode === 'score' ? 'SCORE_PROOF_FAILED' : 'COMPLETION_PROOF_FAILED',
                    'The submitted proof contains an illegal action.', { reason: error.code || 'illegal_action' });
            }
            throw error;
        }
    }

    async verifyPublication({ level, proof }) {
        return assertCompleted(await this.#run(level, proof, 'publication'), 'COMPLETION_PROOF_FAILED');
    }

    async verifyScore({ level, proof }) {
        return assertCompleted(await this.#run(level, proof, 'score'), 'SCORE_PROOF_FAILED');
    }
}
