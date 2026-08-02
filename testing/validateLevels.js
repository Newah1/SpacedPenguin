import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVEL_CATALOG_CONFIG, builtInLevelPath } from '../js/config/gameConfig.js';
import { formatLevelDiagnostics, validateLevelDefinition } from '../js/levelValidation.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failedLevels = 0;
let warningCount = 0;

for (
    let level = LEVEL_CATALOG_CONFIG.firstLevel;
    level <= LEVEL_CATALOG_CONFIG.shippedLevelCount;
    level++
) {
    const relativePath = builtInLevelPath(level);
    const levelDefinition = JSON.parse(await readFile(path.join(repositoryRoot, relativePath), 'utf8'));
    const result = validateLevelDefinition(levelDefinition);
    warningCount += result.warnings.length;

    if (!result.valid) {
        failedLevels++;
        console.error(formatLevelDiagnostics(result, relativePath));
    } else if (result.warnings.length > 0) {
        console.warn(formatLevelDiagnostics({ diagnostics: result.warnings }, relativePath));
    }
}

if (failedLevels > 0) {
    console.error(`${failedLevels} shipped level(s) failed validation.`);
    process.exit(1);
}

console.log(
    `Validated ${LEVEL_CATALOG_CONFIG.shippedLevelCount} shipped levels` +
    (warningCount > 0 ? ` with ${warningCount} warning(s).` : ' without warnings.')
);
