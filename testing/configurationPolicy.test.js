import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testingDirectory, '..');
const productionRoot = path.join(repositoryRoot, 'js');
const configurationRoot = path.join(productionRoot, 'config');

function javascriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const location = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return javascriptFiles(location);
        }
        return entry.isFile() && entry.name.endsWith('.js') ? [location] : [];
    });
}

test('critical product policy is not duplicated outside configuration modules', () => {
    const implementationSource = javascriptFiles(productionRoot)
        .filter(file => !file.startsWith(configurationRoot + path.sep))
        .map(file => fs.readFileSync(file, 'utf8'))
        .join('\n');

    const forbiddenPatterns = [
        /assets\/manifest\.json/,
        /assets\/animations/,
        /15_Arp/,
        /16_snd_bonus/,
        /17_snd_launch/,
        /20_snd_HitPlanet/,
        /21_snd_enterShip/,
        /innerWidth\s*(?:<|<=)\s*768/,
        /innerHeight\s*<=\s*1024/,
        /const\s+totalLevels\s*=\s*25/,
        /maxLevel\s*=\s*25/
    ];

    for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(implementationSource, pattern);
    }
});

test('runtime and deterministic level construction use shared schema normalization', () => {
    const loaderSource = fs.readFileSync(path.join(productionRoot, 'levelLoader.js'), 'utf8');
    const stateSource = fs.readFileSync(path.join(productionRoot, 'simulationState.js'), 'utf8');

    assert.match(loaderSource, /normalizeLevelObjectDefinition\(objectDefinition\)/);
    assert.match(stateSource, /normalizeLevelDefinition\(level\)/);
});
