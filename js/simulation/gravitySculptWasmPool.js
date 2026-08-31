import { supportsGravitySculptWasmInput } from './wasmSimulationBridge.js';

function serializableVariables(variables) {
    return variables.map(({ apply: _apply, ...variable }) => variable);
}

function createClient(worker, index) {
    let sequence = 0;
    const pending = new Map();
    worker.onmessage = event => {
        const request = pending.get(event.data?.id);
        if (!request) return;
        pending.delete(event.data.id);
        if (event.data.type === 'error') request.reject(new Error(event.data.message));
        else request.resolve(event.data.result);
    };
    worker.onerror = event => {
        const error = new Error(event.message || `Gravity Sculpt evaluator ${index + 1} failed`);
        for (const request of pending.values()) request.reject(error);
        pending.clear();
    };
    return {
        call(type, payload = {}) {
            const id = `${index}:${++sequence}`;
            return new Promise((resolve, reject) => {
                pending.set(id, { resolve, reject });
                worker.postMessage({ id, type, ...payload });
            });
        },
        terminate() {
            for (const request of pending.values()) {
                request.reject(new Error('Gravity Sculpt evaluator was disposed'));
            }
            pending.clear();
            worker.terminate();
        }
    };
}

/** Create isolated Wasm instances so one optimizer generation can use several cores. */
export async function createGravitySculptWasmPool({ state, launch, variables }) {
    if (typeof Worker !== 'function' || !supportsGravitySculptWasmInput(state, variables)) return null;
    const available = Math.max(1, Number(globalThis.navigator?.hardwareConcurrency) || 2);
    const workerCount = Math.min(4, available);
    const clients = Array.from({ length: workerCount }, (_unused, index) => {
        const worker = new Worker(
            new URL('../workers/gravitySculptEvaluatorWorker.js', import.meta.url),
            { type: 'module', name: `gravity-sculpt-evaluator-${index + 1}` }
        );
        return createClient(worker, index);
    });
    try {
        const initialized = await Promise.all(clients.map(client => client.call('initialize', {
            context: { state, launch, variables: serializableVariables(variables) }
        })));
        if (initialized.some(value => value?.available !== true)) throw new Error('Wasm evaluator unavailable');
    } catch {
        clients.forEach(client => client.terminate());
        return null;
    }
    let disposed = false;
    return {
        backend: 'wasm',
        workerCount,
        async evaluateMany(path, config, valueSets, options) {
            if (disposed) throw new Error('Gravity Sculpt Wasm pool has been disposed');
            if (valueSets.length === 0) return [];
            const active = clients.slice(0, Math.min(clients.length, valueSets.length));
            const chunkSize = Math.ceil(valueSets.length / active.length);
            const chunks = active.map((_client, index) => ({
                start: index * chunkSize,
                values: valueSets.slice(index * chunkSize, (index + 1) * chunkSize)
            })).filter(chunk => chunk.values.length > 0);
            const results = await Promise.all(chunks.map((chunk, index) =>
                active[index].call('evaluate', {
                    desiredPath: path,
                    config,
                    candidates: chunk.values,
                    options
                }).then(result => ({ start: chunk.start, result }))
            ));
            return results.sort((left, right) => left.start - right.start)
                .flatMap(entry => entry.result);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            clients.forEach(client => client.terminate());
        }
    };
}
