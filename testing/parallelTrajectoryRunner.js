import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { TRAJECTORY_CONFIG } from './trajectoryConfig.js';

export const MAX_TRAJECTORY_WORKERS = TRAJECTORY_CONFIG.workers.maximum;
export const AUTO_WORKER_SAMPLE_THRESHOLD = TRAJECTORY_CONFIG.workers.automaticSampleThreshold;

export function resolveTrajectoryWorkerCount(requested, sampleCount) {
    const available = Math.max(1, availableParallelism());
    const maximum = Math.max(1, Math.min(MAX_TRAJECTORY_WORKERS, available, sampleCount));
    if (requested === undefined || requested === null || requested === 'auto') {
        return sampleCount >= AUTO_WORKER_SAMPLE_THRESHOLD ? maximum : 1;
    }
    if (!Number.isInteger(requested) || requested < 1) {
        throw new RangeError('workers must be "auto" or a positive integer');
    }
    return Math.min(requested, maximum);
}

export async function runTrajectoryWorkers({
    level,
    candidates,
    maxTime,
    timeStep,
    workerCount,
    nearMissLimit = 0
}) {
    const groups = Array.from({ length: workerCount }, () => []);
    candidates.forEach((candidate, index) => groups[index % workerCount].push(candidate));

    const batches = await Promise.all(groups.map(group => runWorker({
        level,
        candidates: group,
        maxTime,
        timeStep,
        nearMissLimit
    })));
    const results = batches
        .flatMap(batch => batch.results)
        .sort((left, right) => left.candidateIndex - right.candidateIndex)
        .map(result => {
            const { candidateIndex, ...publicResult } = result;
            return publicResult;
        });
    const { compareNearMissResults } = await import('./headlessEngine.js');
    const nearMisses = batches
        .flatMap(batch => batch.nearMisses)
        .sort(compareNearMissResults)
        .slice(0, nearMissLimit)
        .map(result => {
            const { candidateIndex, ...publicResult } = result;
            return publicResult;
        });
    return { results, nearMisses };
}

function runWorker(workerData) {
    return new Promise((resolve, reject) => {
        const execArgv = process.execArgv.filter(argument => !argument.startsWith('--input-type'));
        const worker = new Worker(new URL('./trajectoryWorker.js', import.meta.url), { workerData, execArgv });
        let settled = false;
        worker.once('message', message => {
            settled = true;
            if (message.error) reject(new Error(message.error));
            else resolve(message);
        });
        worker.once('error', error => {
            settled = true;
            reject(error);
        });
        worker.once('exit', code => {
            if (!settled) reject(new Error(`trajectory worker exited before returning results (code ${code})`));
        });
    });
}
