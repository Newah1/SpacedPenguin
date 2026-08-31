import { solveGravitySculpt } from '../simulation/gravitySculptor.js';
import { initializeWasmSimulation } from '../simulation/wasmSimulationBridge.js';
import { createGravitySculptWasmPool } from '../simulation/gravitySculptWasmPool.js';

self.onmessage = async event => {
    if (event.data?.type !== 'solve') return;
    try {
        // A worker has its own Wasm instance; initialization failure is safe
        // because solveGravitySculpt retains its deterministic JS evaluator.
        try { await initializeWasmSimulation(); } catch { /* JavaScript fallback */ }
        const result = await solveGravitySculpt({
            ...event.data.request,
            evaluatorFactory: createGravitySculptWasmPool,
            onProgress: progress => self.postMessage({ type: 'progress', progress })
        });
        // Variable descriptors contain local apply functions. Candidate output
        // is fully materialized, so only serializable descriptor metadata needs
        // to cross back to the editor.
        result.variables = result.variables.map(({ apply: _apply, ...variable }) => variable);
        self.postMessage({ type: 'result', result });
    } catch (error) {
        self.postMessage({
            type: 'error',
            message: error?.message || 'Gravity Sculpt could not complete'
        });
    }
};
