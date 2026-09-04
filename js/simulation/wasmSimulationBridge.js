import { SIMULATION_CONFIG } from '../config/gameConfig.js';
import {
    decodeSimulationStepPatch,
    encodeSimulationStepInput
} from '../../generated/js/simulationWire.js';

const DEFAULT_WASM_URL = new URL('../../rust/simulator/pkg/spaced_penguin_simulator.wasm', import.meta.url);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let wasmExports = null;
let runtimeHandles = new WeakMap();

async function instantiateSource(source) {
    if (source instanceof WebAssembly.Module) return WebAssembly.instantiate(source, {});
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
        const bytes = source instanceof ArrayBuffer
            ? source
            : source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
        const result = await WebAssembly.instantiate(bytes, {});
        return result.instance;
    }
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Wasm simulator request failed with HTTP ${response.status}`);
    if (WebAssembly.instantiateStreaming) {
        try {
            const result = await WebAssembly.instantiateStreaming(response.clone(), {});
            return result.instance;
        } catch (error) {
            if (!/mime|content-type/i.test(error.message)) throw error;
        }
    }
    const result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
    return result.instance;
}

export async function initializeWasmSimulation(source = DEFAULT_WASM_URL) {
    const instance = await instantiateSource(source);
    wasmExports = instance.exports;
    runtimeHandles = new WeakMap();
    return true;
}

export function isWasmSimulationReady() {
    return wasmExports !== null;
}

export function activeSimulationBackend() {
    return isWasmSimulationReady() ? 'wasm' : 'javascript';
}

function hasMovingWorldObject(state) {
    return [
        ...(state.planets || []),
        ...(state.bonuses || []),
        ...(state.portals || []),
        ...(state.speedBoosters || []),
        ...(state.deflectorBumpers || []),
        ...(state.forceFields || []),
        ...(state.decorations || []),
        state.target,
        state.slingshot
    ].filter(Boolean).some(object => object.orbit || object.waypointPath);
}

function supportedSculptVariable(variable) {
    return variable.key === 'launch.angleDegrees' ||
        variable.key === 'launch.pullbackPower' ||
        /^planet\.\d+\.(?:x|y|mass)$/.test(variable.key);
}

export function supportsGravitySculptWasmInput(state, variables) {
    return !hasMovingWorldObject(state) && variables.every(supportedSculptVariable);
}

/**
 * Create one persistent, synchronous evaluator for a Gravity Sculpt solve.
 * The optimizer owns population policy; Rust owns batched deterministic physics
 * and scoring. Moving worlds and custom variable hooks retain the exact JS path.
 */
export function createGravitySculptWasmEvaluator({ state, launch, variables, simulation }) {
    if (!wasmExports?.create_sculpt_context || !wasmExports?.evaluate_sculpt_batch) return null;
    if (!supportsGravitySculptWasmInput(state, variables)) return null;
    const contextBytes = encoder.encode(JSON.stringify({
        state,
        simulation,
        launch,
        variables: variables.map(variable => ({
            key: variable.key,
            kind: variable.kind || 'custom',
            scale: variable.scale || 'linear',
            initial: variable.initial,
            min: variable.min,
            max: variable.max
        }))
    }));
    const pointer = wasmExports.alloc(contextBytes.byteLength);
    new Uint8Array(wasmExports.memory.buffer, pointer, contextBytes.byteLength).set(contextBytes);
    const handle = wasmExports.create_sculpt_context(pointer, contextBytes.byteLength);
    wasmExports.dealloc(pointer, contextBytes.byteLength);
    if (handle < 0) throw errorFromWasm('create_sculpt_context');
    let disposed = false;
    return {
        backend: 'wasm',
        evaluateBatch(desiredPath, config, candidates, { captureTrajectories = false } = {}) {
            if (disposed) throw new Error('Gravity Sculpt Wasm evaluator has been disposed');
            const bytes = encoder.encode(JSON.stringify({
                desiredPath,
                config: { ...config, timeStep: simulation.aimAssist.timeStep },
                candidates,
                captureTrajectories
            }));
            const inputPointer = wasmExports.alloc(bytes.byteLength);
            new Uint8Array(wasmExports.memory.buffer, inputPointer, bytes.byteLength).set(bytes);
            const status = wasmExports.evaluate_sculpt_batch(handle, inputPointer, bytes.byteLength);
            wasmExports.dealloc(inputPointer, bytes.byteLength);
            if (status !== 0) throw errorFromWasm('evaluate_sculpt_batch');
            const output = new Uint8Array(
                wasmExports.memory.buffer,
                wasmExports.output_pointer(),
                wasmExports.output_length()
            );
            return JSON.parse(decoder.decode(output));
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            wasmExports.destroy_sculpt_context(handle);
        }
    };
}

function errorFromWasm(operation) {
    const pointer = wasmExports.error_pointer();
    const length = wasmExports.error_length();
    const detail = decoder.decode(new Uint8Array(wasmExports.memory.buffer, pointer, length));
    return new Error(`${operation} failed in Rust/Wasm${detail ? `: ${detail}` : ''}`);
}

function decodeStepOutput(bytes) {
    return decodeSimulationStepPatch(bytes);
}

function worldPositions(state) {
    const objects = [
        ...(state.planets || []),
        ...(state.bonuses || []),
        ...(state.portals || []),
        ...(state.speedBoosters || []),
        ...(state.deflectorBumpers || []),
        ...(state.forceFields || []),
        state.target
    ];
    return objects;
}

function createRuntimeHandle(state) {
    const bytes = encodeSimulationStepInput(state, SIMULATION_CONFIG);
    const inputPointer = wasmExports.alloc(bytes.byteLength);
    new Uint8Array(wasmExports.memory.buffer, inputPointer, bytes.byteLength).set(bytes);
    const handle = wasmExports.create_runtime_state(inputPointer, bytes.byteLength);
    wasmExports.dealloc(inputPointer, bytes.byteLength);
    if (handle < 0) throw errorFromWasm('create_runtime_state');
    const positions = worldPositions(state);
    const positionValues = new Float64Array(positions.length * 2);
    const positionPointer = wasmExports.alloc_f64(positionValues.length);
    return { handle, positionValues, positionPointer };
}

function runtimeHandleFor(state) {
    let runtime = runtimeHandles.get(state);
    if (!runtime) {
        runtime = createRuntimeHandle(state);
        runtimeHandles.set(state, runtime);
    }
    return runtime;
}

function syncRuntimeWorld(state, runtime) {
    const objects = worldPositions(state);
    const values = runtime.positionValues;
    if (values.length !== objects.length * 2) {
        throw new Error('Wasm runtime world shape changed; recreate the simulation state');
    }
    objects.forEach((object, index) => {
        values[index * 2] = object.position.x;
        values[index * 2 + 1] = object.position.y;
    });
    new Float64Array(wasmExports.memory.buffer, runtime.positionPointer, values.length).set(values);
    const status = wasmExports.sync_runtime_world(runtime.handle, runtime.positionPointer, objects.length);
    if (status !== 0) throw errorFromWasm('sync_runtime_world');
}

function applyStepPatch(state, patch) {
    state.time = patch.time;
    state.runTick = patch.runTick;
    Object.assign(state.penguin.position, patch.penguin.position);
    Object.assign(state.penguin.velocity, patch.penguin.velocity);
    state.penguin.state = patch.penguin.state;
    state.penguin.crashFramesRemaining = patch.penguin.crashFramesRemaining;
    state.penguin.portalLockId = patch.penguin.portalLockId;
    state.penguin.speedBoosterLockId = patch.penguin.speedBoosterLockId;
    state.counters.planetCollisions = patch.counters.planetCollisions;
    state.counters.currentAttemptScore = patch.counters.currentAttemptScore;
    state.counters.distance = patch.counters.distance;
    patch.bonusCollected.forEach((collected, index) => {
        if (state.bonuses[index]) state.bonuses[index].collected = collected;
    });
    return { state, events: patch.events };
}

function decodeOutputPatch(state) {
    const outputPointer = wasmExports.output_pointer();
    const outputLength = wasmExports.output_length();
    const patch = decodeStepOutput(new Uint8Array(wasmExports.memory.buffer, outputPointer, outputLength));
    return applyStepPatch(state, patch);
}

export function disposeWasmSimulationHandle(state) {
    const runtime = runtimeHandles.get(state);
    if (!runtime) return;
    if (wasmExports?.destroy_runtime_state) wasmExports.destroy_runtime_state(runtime.handle);
    if (wasmExports?.dealloc_f64) wasmExports.dealloc_f64(runtime.positionPointer, runtime.positionValues.length);
    runtimeHandles.delete(state);
}

export function stepSimulationSliceWasmMutable(state, deltaTime, incrementTick = false) {
    if (!wasmExports) throw new Error('Rust/Wasm simulation has not been initialized');
    if (wasmExports.create_runtime_state && wasmExports.sync_runtime_world && wasmExports.step_runtime_state) {
        const runtime = runtimeHandleFor(state);
        syncRuntimeWorld(state, runtime);
        const status = wasmExports.step_runtime_state(runtime.handle, deltaTime, incrementTick ? 1 : 0);
        if (status !== 0) throw errorFromWasm('step_runtime_state');
        return decodeOutputPatch(state);
    }
    // Compatibility path for an older module; current browser modules use the persistent ABI above.
    const bytes = encodeSimulationStepInput(state, SIMULATION_CONFIG);
    const pointer = wasmExports.alloc(bytes.byteLength);
    new Uint8Array(wasmExports.memory.buffer, pointer, bytes.byteLength).set(bytes);
    const status = wasmExports.step_state_binary(pointer, bytes.byteLength, deltaTime, incrementTick ? 1 : 0);
    wasmExports.dealloc(pointer, bytes.byteLength);
    if (status !== 0) throw errorFromWasm('step_state');

    return decodeOutputPatch(state);
}
