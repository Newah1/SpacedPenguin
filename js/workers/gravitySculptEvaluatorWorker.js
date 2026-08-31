import { SIMULATION_CONFIG } from '../config/gameConfig.js';
import {
    createGravitySculptWasmEvaluator,
    initializeWasmSimulation
} from '../simulation/wasmSimulationBridge.js';

let evaluator = null;

self.onmessage = async event => {
    const { id, type } = event.data || {};
    try {
        if (type === 'initialize') {
            await initializeWasmSimulation();
            evaluator = createGravitySculptWasmEvaluator({
                ...event.data.context,
                simulation: SIMULATION_CONFIG
            });
            self.postMessage({ id, type: 'result', result: { available: Boolean(evaluator) } });
            return;
        }
        if (type === 'evaluate') {
            if (!evaluator) throw new Error('Gravity Sculpt evaluator is not initialized');
            const result = evaluator.evaluateBatch(
                event.data.desiredPath,
                event.data.config,
                event.data.candidates,
                event.data.options
            );
            self.postMessage({ id, type: 'result', result });
        }
    } catch (error) {
        self.postMessage({
            id,
            type: 'error',
            message: error?.message || 'Gravity Sculpt evaluator failed'
        });
    }
};
