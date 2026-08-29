import { readFile } from 'node:fs/promises';
import { SIMULATION_CONFIG } from '../js/config/gameConfig.js';

const WASM_URL = new URL('../rust/simulator/pkg/spaced_penguin_simulator.wasm', import.meta.url);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let compiledModulePromise = null;

async function compiledModule() {
    compiledModulePromise ??= readFile(WASM_URL).then(bytes => WebAssembly.compile(bytes));
    return compiledModulePromise;
}

function copyBytes(exports, bytes) {
    const pointer = exports.alloc(bytes.byteLength);
    new Uint8Array(exports.memory.buffer, pointer, bytes.byteLength).set(bytes);
    return pointer;
}

function copyFloat64(exports, values) {
    const pointer = exports.alloc_f64(values.length);
    new Float64Array(exports.memory.buffer, pointer, values.length).set(values);
    return pointer;
}

function wasmError(exports, operation) {
    const pointer = exports.error_pointer();
    const length = exports.error_length();
    const detail = decoder.decode(new Uint8Array(exports.memory.buffer, pointer, length));
    return new Error(`${operation} failed in Rust/Wasm${detail ? `: ${detail}` : ''}`);
}

export async function createWasmHeadlessBackend(initialState, timeline, timeStep) {
    const instance = await WebAssembly.instantiate(await compiledModule(), {});
    const exports = instance.exports;
    const stateBytes = encoder.encode(JSON.stringify({
        state: initialState,
        simulation: SIMULATION_CONFIG
    }));
    const statePointer = copyBytes(exports, stateBytes);
    const timelinePointer = copyFloat64(exports, timeline.positions);
    const handle = exports.create_simulator(
        statePointer,
        stateBytes.byteLength,
        timelinePointer,
        timeline.positions.length,
        timeline.maxSteps,
        timeline.entityCount,
        timeStep
    );
    exports.dealloc(statePointer, stateBytes.byteLength);
    exports.dealloc_f64(timelinePointer, timeline.positions.length);
    if (handle < 0) throw wasmError(exports, 'create_simulator');

    let disposed = false;
    return {
        async simulateCandidates(candidates, maxSteps, captureStride) {
            if (disposed) throw new Error('Rust/Wasm headless backend has been disposed');
            const values = new Float64Array(candidates.length * 2);
            candidates.forEach((candidate, index) => {
                values[index * 2] = candidate.angle;
                values[index * 2 + 1] = candidate.power;
            });
            const pointer = copyFloat64(exports, values);
            const status = exports.simulate_batch(
                handle,
                pointer,
                candidates.length,
                maxSteps,
                captureStride
            );
            exports.dealloc_f64(pointer, values.length);
            if (status !== 0) throw wasmError(exports, 'simulate_batch');
            const outputPointer = exports.output_pointer();
            const outputLength = exports.output_length();
            const json = decoder.decode(new Uint8Array(exports.memory.buffer, outputPointer, outputLength));
            return JSON.parse(json);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            exports.destroy_simulator(handle);
        }
    };
}
