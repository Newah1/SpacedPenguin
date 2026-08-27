import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    LEVEL_CATALOG_CONFIG,
    builtInLevelPath,
    levelCollectionPath
} from '../js/config/gameConfig.js';
import { formatLevelDiagnostics, validateLevelDefinition } from '../js/levels/levelValidation.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failedLevels = 0;
let warningCount = 0;

async function validateCatalog(name, firstLevel, levelCount, pathForLevel) {
    for (let level = firstLevel; level < firstLevel + levelCount; level++) {
        const relativePath = pathForLevel(level);
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
    console.log(`Validated ${levelCount} ${name} levels.`);
}

await validateCatalog(
    'default', LEVEL_CATALOG_CONFIG.firstLevel, LEVEL_CATALOG_CONFIG.shippedLevelCount,
    builtInLevelPath
);
await validateCatalog('manual', 1, 20, level => levelCollectionPath('manual', level));

if (failedLevels > 0) {
    console.error(`${failedLevels} shipped level(s) failed validation.`);
    process.exit(1);
}

console.log(warningCount > 0 ? `${warningCount} validation warning(s).` : 'All catalogs validated without warnings.');
