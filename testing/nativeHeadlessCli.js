#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');
const levelTesterPath = resolve(repositoryRoot, 'testing/levelTester.js');

/**
 * PowerShell's npm.ps1 wrapper can remove forwarded option names while leaving
 * their values. Support the documented level/samples/max-time order as a
 * positional fallback while preserving normal npm.cmd and direct Node flags.
 */
export function normalizeNativeHeadlessArguments(args) {
    if (args.some(argument => argument.startsWith('-'))) return [...args];
    if (args.length === 0) return [];
    if (args.length > 3) {
        throw new Error(
            'Positional native usage is LEVEL [SAMPLES] [MAX_TIME]; use npm.cmd for additional named options'
        );
    }
    const [level, samples, maxTime] = args;
    const normalized = ['--level', level];
    if (samples !== undefined) normalized.push('--samples', samples);
    if (maxTime !== undefined) normalized.push('--max-time', maxTime);
    return normalized;
}

export function runNativeHeadlessCli(args = process.argv.slice(2)) {
    const forwarded = normalizeNativeHeadlessArguments(args);
    const result = spawnSync(process.execPath, [
        levelTesterPath,
        '--backend', 'native',
        ...forwarded
    ], {
        cwd: repositoryRoot,
        stdio: 'inherit',
        windowsHide: true
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
    try {
        process.exitCode = runNativeHeadlessCli();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    }
}
