import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createSimulationStateFromLevel } from '../js/simulation/simulationState.js';
import { solveGravitySculpt } from '../js/simulation/gravitySculptor.js';
import { initializeWasmSimulation } from '../js/simulation/wasmSimulationBridge.js';

function state() {
    return createSimulationStateFromLevel({
        name: 'Gravity Sculpt benchmark',
        startPosition: { x: 70, y: 300 },
        targetPosition: { x: 760, y: 300 },
        objects: [
            { type: 'slingshot', position: { x: 70, y: 300 }, properties: {
                velocityMultiplier: 1, maxPullback: 150, minPullback: 25
            } },
            { type: 'planet', position: { x: 270, y: 175 }, properties: {
                id: 'upper', radius: 18, mass: 120, gravitationalReach: 900
            } },
            { type: 'planet', position: { x: 470, y: 430 }, properties: {
                id: 'lower', radius: 18, mass: 120, gravitationalReach: 900
            } },
            { type: 'planet', position: { x: 650, y: 170 }, properties: {
                id: 'exit', radius: 18, mass: 120, gravitationalReach: 900
            } },
            { type: 'target', position: { x: 760, y: 300 }, properties: { width: 20, height: 20 } }
        ],
        rules: { gravitationalConstant: 3 }
    });
}

const desiredPath = [
    { x: 70, y: 300 }, { x: 280, y: 225 },
    { x: 500, y: 350 }, { x: 730, y: 245 }
];
const request = () => ({
    state: state(),
    desiredPath,
    planetIndices: [0, 1, 2],
    options: {
        adjustPosition: false, adjustMass: true, adjustLaunch: true,
        budgetMultiplier: 0.5, seed: 284117
    }
});

async function measure() {
    const started = performance.now();
    const result = await solveGravitySculpt(request());
    return {
        backend: result.evaluationBackend,
        milliseconds: performance.now() - started,
        evaluations: result.evaluations,
        missedWaypoints: result.missedWaypointCount
    };
}

function median(values) {
    const sorted = [...values].sort((left, right) => left.milliseconds - right.milliseconds);
    return sorted[Math.floor(sorted.length / 2)];
}

await measure(); // Warm JavaScript optimizer/JIT paths.
const javascriptRuns = [];
for (let index = 0; index < 3; index++) javascriptRuns.push(await measure());
const javascript = median(javascriptRuns);
const bytes = await readFile(new URL('../rust/simulator/pkg/spaced_penguin_simulator.wasm', import.meta.url));
await initializeWasmSimulation(bytes);
await measure(); // Warm the persistent module and optimizer paths.
const wasmRuns = [];
for (let index = 0; index < 3; index++) wasmRuns.push(await measure());
const wasm = median(wasmRuns);

console.log(JSON.stringify({
    javascript: { ...javascript, milliseconds: Number(javascript.milliseconds.toFixed(2)) },
    wasm: { ...wasm, milliseconds: Number(wasm.milliseconds.toFixed(2)) },
    speedup: Number((javascript.milliseconds / wasm.milliseconds).toFixed(2)),
    javascriptRunsMilliseconds: javascriptRuns.map(value => Number(value.milliseconds.toFixed(2))),
    wasmRunsMilliseconds: wasmRuns.map(value => Number(value.milliseconds.toFixed(2)))
}, null, 2));
