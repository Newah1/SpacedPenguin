#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLevelDefinition } from '../js/levelValidation.js';
import { LevelTester } from './levelTester.js';

const candidateDirectory = fileURLToPath(new URL('../levels/', import.meta.url));
const files = (await readdir(candidateDirectory))
    .filter(name => /^level\d{2}\.json$/.test(name))
    .sort();
const tester = new LevelTester();
tester.engine.logger = { info() {}, warn() {}, error() {} };
const failures = [];
const expectedTutorialOverlays = new Map([
    [1, { textobject: 2, pointingarrow: 2 }],
    [2, { textobject: 2, pointingarrow: 2 }],
    [3, { textobject: 1, pointingarrow: 1 }],
    [4, { textobject: 1, pointingarrow: 0 }],
    [5, { textobject: 1, pointingarrow: 0 }]
]);

for (const file of files) {
    const path = join(candidateDirectory, file);
    const level = JSON.parse(await readFile(path, 'utf8'));
    const validation = validateLevelDefinition(level);
    if (!validation.valid) {
        failures.push(`${file}: invalid (${validation.errors.length} errors)`);
        continue;
    }
    const expected = expectedTutorialOverlays.get(level.level) ?? { textobject: 0, pointingarrow: 0 };
    for (const type of ['textobject', 'pointingarrow']) {
        const actual = level.objects.filter(object => object.type === type).length;
        if (actual !== expected[type]) {
            failures.push(`${file}: expected ${expected[type]} ${type} objects, found ${actual}`);
        }
    }
    const result = await tester.testLevel(path, {
        samples: 400,
        maxTime: 15,
        workers: 4
    });
    if (!result.success) {
        failures.push(`${file}: no successful trajectory in 400-sample sweep`);
        continue;
    }
    const best = result.bestResult;
    console.log(
        `${file}: angle=${best.angle.toFixed(2)} power=${best.power.toFixed(2)} ` +
        `successes=${result.successfulTrajectories}/400`
    );
}

if (files.length !== 25) failures.push(`expected 25 candidate levels, found ${files.length}`);
if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
} else {
    console.log('Verified all 25 default original-level ports with the shared headless runner.');
}
