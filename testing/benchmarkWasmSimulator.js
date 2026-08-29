#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { HeadlessGameEngine, buildTrajectoryCandidates } from './headlessEngine.js';

const levelPath = process.argv[2] || './levels/level10.json';
const samples = Math.max(1, Number(process.argv[3] || 10000));
const maxTime = Math.max(0, Number(process.argv[4] || 5));
const iterations = Math.max(1, Number(process.argv[5] || 5));
const level = JSON.parse(await readFile(levelPath, 'utf8'));
const candidates = buildTrajectoryCandidates([0, 360], [10, 100], samples);

function engine() {
    const instance = new HeadlessGameEngine();
    instance.logger = { info() {}, warn() {}, error() {} };
    instance.loadLevel(level);
    return instance;
}

const js = engine();
const wasm = engine();

const jsColdStart = performance.now();
const jsColdResults = js.simulateCandidates(candidates, maxTime);
const jsColdMs = performance.now() - jsColdStart;

const wasmColdStart = performance.now();
const wasmColdResults = await wasm.simulateCandidatesWasm(candidates, maxTime);
const wasmColdMs = performance.now() - wasmColdStart;

const jsWarmTimes = [];
const wasmWarmTimes = [];
let jsWarmResults = [];
let wasmWarmResults = [];
for (let iteration = 0; iteration < iterations; iteration++) {
    const runJavaScript = () => {
        const started = performance.now();
        jsWarmResults = js.simulateCandidates(candidates, maxTime);
        jsWarmTimes.push(performance.now() - started);
    };
    const runWasm = async () => {
        const started = performance.now();
        wasmWarmResults = await wasm.simulateCandidatesWasm(candidates, maxTime);
        wasmWarmTimes.push(performance.now() - started);
    };
    if (iteration % 2 === 0) {
        runJavaScript();
        await runWasm();
    } else {
        await runWasm();
        runJavaScript();
    }
}

function median(values) {
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const jsWarmMs = median(jsWarmTimes);
const wasmWarmMs = median(wasmWarmTimes);

if (jsColdResults.length !== wasmColdResults.length || jsWarmResults.length !== wasmWarmResults.length) {
    throw new Error(
        `parity failure: JS found ${jsWarmResults.length} successes; Wasm found ${wasmWarmResults.length}`
    );
}

console.log(JSON.stringify({
    levelPath,
    samples,
    maxTime,
    iterations,
    successfulTrajectories: jsWarmResults.length,
    cold: {
        javascriptMilliseconds: Number(jsColdMs.toFixed(2)),
        wasmMilliseconds: Number(wasmColdMs.toFixed(2)),
        speedup: Number((jsColdMs / wasmColdMs).toFixed(2))
    },
    warm: {
        javascriptMilliseconds: Number(jsWarmMs.toFixed(2)),
        wasmMilliseconds: Number(wasmWarmMs.toFixed(2)),
        speedup: Number((jsWarmMs / wasmWarmMs).toFixed(2)),
        javascriptCandidatesPerSecond: Math.round(samples / (jsWarmMs / 1000)),
        wasmCandidatesPerSecond: Math.round(samples / (wasmWarmMs / 1000)),
        javascriptRunsMilliseconds: jsWarmTimes.map(value => Number(value.toFixed(2))),
        wasmRunsMilliseconds: wasmWarmTimes.map(value => Number(value.toFixed(2)))
    }
}, null, 2));
