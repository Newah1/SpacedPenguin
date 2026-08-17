import { parentPort } from 'node:worker_threads';
import { replayRun } from '../../js/runReplay.js';

parentPort.on('message', ({ id, level, proof, mode }) => {
    try {
        const replayed = replayRun(level, proof, { mode });
        parentPort.postMessage({ id, result: replayed });
    } catch (error) {
        parentPort.postMessage({
            id,
            error: { name: error.name, code: error.code, message: error.message, details: error.details }
        });
    }
});
