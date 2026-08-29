import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIMULATION_CONFIG } from '../js/config/gameConfig.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(repositoryRoot, 'rust/simulator/Cargo.toml');
const executablePath = resolve(
    repositoryRoot,
    'rust/simulator/target/release',
    process.platform === 'win32' ? 'spaced-penguin-headless.exe' : 'spaced-penguin-headless'
);
const cargoPath = process.platform === 'win32'
    ? resolve(process.env.USERPROFILE, '.cargo/bin/cargo.exe')
    : 'cargo';
let buildPromise = null;
let verifiedInThisProcess = false;

function runProcess(command, args, options = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, {
            cwd: repositoryRoot,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        const stdout = [];
        const stderr = [];
        child.stdout.on('data', chunk => stdout.push(chunk));
        child.stderr.on('data', chunk => {
            stderr.push(chunk);
            if (options.inheritStderr) process.stderr.write(chunk);
        });
        child.on('error', reject);
        child.on('close', code => {
            const output = Buffer.concat(stdout);
            const errorOutput = Buffer.concat(stderr).toString('utf8').trim();
            if (code === 0) resolvePromise(output);
            else reject(new Error(errorOutput || `${command} exited with code ${code}`));
        });
        if (options.input === undefined) child.stdin.end();
        else child.stdin.end(options.input);
    });
}

export async function buildNativeHeadlessExecutable({ force = false, quiet = false } = {}) {
    if (!force && verifiedInThisProcess) return executablePath;
    buildPromise ??= runProcess(cargoPath, [
        'build',
        '--manifest-path', manifestPath,
        '--release',
        '--bin', 'spaced-penguin-headless'
    ], { inheritStderr: !quiet }).then(() => {
        verifiedInThisProcess = true;
        return executablePath;
    }).finally(() => {
        buildPromise = null;
    });
    return buildPromise;
}

export function nativeHeadlessExecutablePath() {
    return executablePath;
}

export async function runNativeHeadlessSweep({
    initialState,
    timeline,
    timeStep,
    candidates,
    maxSteps,
    captureStride,
    nearMissLimit = 0
}) {
    const executable = await buildNativeHeadlessExecutable({ quiet: true });
    const request = {
        input: {
            state: initialState,
            simulation: SIMULATION_CONFIG
        },
        timeline: Array.from(timeline.positions),
        maxSteps,
        entityCount: timeline.entityCount,
        timeStep,
        candidates: candidates.map((candidate, index) => ({
            candidateIndex: candidate.candidateIndex ?? index,
            angle: candidate.angle,
            power: candidate.power
        })),
        captureStride,
        nearMissLimit
    };
    const output = await runProcess(executable, [], { input: JSON.stringify(request) });
    try {
        const response = JSON.parse(output.toString('utf8'));
        if (response.evaluatedCandidates !== candidates.length) {
            throw new Error(
                `native executable evaluated ${response.evaluatedCandidates} of ${candidates.length} candidates`
            );
        }
        return response;
    } catch (error) {
        throw new Error(`invalid native headless response: ${error.message}`);
    }
}
