#!/usr/bin/env node

import { copyFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = resolve(repositoryRoot, 'rust/simulator/Cargo.toml');
const source = resolve(repositoryRoot, 'rust/simulator/target/wasm32-unknown-unknown/release/spaced_penguin_simulator.wasm');
const output = resolve(repositoryRoot, 'rust/simulator/pkg/spaced_penguin_simulator.wasm');
const cargo = process.platform === 'win32'
    ? resolve(process.env.USERPROFILE, '.cargo/bin/cargo.exe')
    : 'cargo';

const build = spawnSync(cargo, [
    'build',
    '--manifest-path', manifest,
    '--lib',
    '--target', 'wasm32-unknown-unknown',
    '--release'
], { cwd: repositoryRoot, stdio: 'inherit' });

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

await mkdir(dirname(output), { recursive: true });
await copyFile(source, output);
console.log(`Wrote ${output}`);
