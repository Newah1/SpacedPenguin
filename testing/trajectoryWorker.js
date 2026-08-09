import { parentPort, workerData } from 'node:worker_threads';
import { HeadlessGameEngine } from './headlessEngine.js';

try {
    const engine = new HeadlessGameEngine();
    engine.logger = { info() {}, warn() {}, error() {} };
    engine.timeStep = workerData.timeStep;
    engine.loadLevel(workerData.level);
    const results = engine.simulateCandidates(
        workerData.candidates,
        workerData.maxTime,
        null,
        { nearMissLimit: workerData.nearMissLimit, preserveCandidateIndex: true }
    );
    parentPort.postMessage({ results, nearMisses: engine.lastNearMisses });
} catch (error) {
    parentPort.postMessage({ error: error.stack || error.message });
} finally {
    parentPort.close();
}
