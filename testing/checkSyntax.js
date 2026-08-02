import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['js', 'testing', 'e2e'];

function findJavaScriptFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const location = path.join(directory, entry.name);
        if (entry.isDirectory()) return findJavaScriptFiles(location);
        return entry.isFile() && entry.name.endsWith('.js') ? [location] : [];
    });
}

const files = [
    path.join(repositoryRoot, 'playwright.config.js'),
    ...roots.flatMap(root => findJavaScriptFiles(path.join(repositoryRoot, root)))
];

for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax checked ${files.length} JavaScript files.`);
