#!/usr/bin/env node

// Dependency-free CLI for exact deterministic level trajectory testing.

import {
    DEFAULT_MAX_SIMULATION_TIME,
    HeadlessGameEngine
} from './headlessEngine.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { formatLevelDiagnostics, validateLevelDefinition } from '../js/levelValidation.js';

class LevelTester {
    constructor() {
        this.engine = new HeadlessGameEngine();
        this.verbose = false;
    }

    async loadLevelFile(levelPath) {
        try {
            const fullPath = resolve(levelPath);
            return JSON.parse(await readFile(fullPath, 'utf8'));
        } catch (error) {
            throw new Error(`Failed to load level file ${levelPath}: ${error.message}`);
        }
    }

    async testLevel(levelPath, options = {}) {
        const {
            samples = 100,
            angleRange = [0, 360],
            powerRange = [10, 100],
            maxTime = DEFAULT_MAX_SIMULATION_TIME,
            findAll = false,
            ascii = false,
            requireAllBonuses = false,
            workers = 'auto'
        } = options;

        const startTime = Date.now();
        const levelData = await this.loadLevelFile(levelPath);
        if (!this.engine.loadLevel(levelData, { requireAllBonuses })) {
            throw new Error('Failed to load level into engine');
        }

        const results = await this.engine.findWorkingTrajectoriesAsync(
            angleRange,
            powerRange,
            samples,
            maxTime,
            { workers }
        );
        results.sort(ascii ? compareAsciiTrajectoryResults : compareTrajectoryDistance);

        const duration = (Date.now() - startTime) / 1000;
        const displayedResults = findAll
            ? results
            : ascii
                ? selectDiverseAsciiResults(results, 5)
                : results.slice(0, 5);
        const summary = {
            success: results.length > 0,
            requireAllBonuses,
            totalBonuses: this.engine.initialState.bonuses.length,
            levelPath,
            totalSamples: Math.max(1, Math.floor(samples)),
            successfulTrajectories: results.length,
            bestResult: results[0] || null,
            allResults: displayedResults,
            asciiMaps: ascii
                ? displayedResults.map(result => renderAsciiTrajectory(levelData, result))
                : [],
            duration
        };

        if (this.verbose && summary.bestResult) {
            summary.bestTrajectory = summary.bestResult.trajectory;
        }

        return summary;
    }

    async validateLevelFile(levelPath) {
        const levelData = await this.loadLevelFile(levelPath);
        return validateLevelDefinition(levelData);
    }

    async testSingleTrajectory(levelPath, angle, power, options = {}) {
        const {
            maxTime = DEFAULT_MAX_SIMULATION_TIME,
            requireAllBonuses = false
        } = options;
        const levelData = await this.loadLevelFile(levelPath);
        if (!this.engine.loadLevel(levelData, { requireAllBonuses })) {
            throw new Error('Failed to load level into engine');
        }

        return this.engine.simulateTrajectory(angle, power, maxTime);
    }

    async batchTestLevels(levelPaths, options = {}) {
        const results = [];

        for (const levelPath of levelPaths) {
            try {
                results.push(await this.testLevel(levelPath, options));
            } catch (error) {
                results.push({
                    success: false,
                    levelPath,
                    error: error.message
                });
            }
        }

        return results;
    }
}

function renderAsciiTrajectory(levelData, result, width = 80, height = 24) {
    const columns = Math.max(20, Math.floor(width));
    const rows = Math.max(10, Math.floor(height));
    const objects = levelData.objects || [];
    const slingshot = objects.find(object => object.type === 'slingshot');
    const target = objects.find(object => object.type === 'target');
    const planets = objects.filter(object => object.type === 'planet');
    const path = [...(result.trajectory || []).map(point => ({ x: point.x, y: point.y }))];
    if (result.finalPosition) path.push(result.finalPosition);

    const points = [
        ...path,
        ...planets.map(planet => planet.position),
        slingshot?.position,
        target?.position
    ].filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));

    if (points.length === 0) return '(no plottable trajectory data)';

    let minX = Math.min(...points.map(point => point.x));
    let maxX = Math.max(...points.map(point => point.x));
    let minY = Math.min(...points.map(point => point.y));
    let maxY = Math.max(...points.map(point => point.y));
    const paddingX = Math.max((maxX - minX) * 0.05, 10);
    const paddingY = Math.max((maxY - minY) * 0.05, 10);
    minX -= paddingX;
    maxX += paddingX;
    minY -= paddingY;
    maxY += paddingY;

    const grid = Array.from({ length: rows }, () => Array(columns).fill(' '));
    const priorities = Array.from({ length: rows }, () => Array(columns).fill(0));
    const project = point => ({
        column: Math.round(((point.x - minX) / (maxX - minX)) * (columns - 1)),
        row: Math.round(((point.y - minY) / (maxY - minY)) * (rows - 1))
    });
    const plot = (column, row, character, priority) => {
        if (column < 0 || column >= columns || row < 0 || row >= rows) return;
        if (priority >= priorities[row][column]) {
            grid[row][column] = character;
            priorities[row][column] = priority;
        }
    };
    const drawLine = (from, to) => {
        let x = from.column;
        let y = from.row;
        const dx = Math.abs(to.column - x);
        const dy = Math.abs(to.row - y);
        const sx = x < to.column ? 1 : -1;
        const sy = y < to.row ? 1 : -1;
        let error = dx - dy;

        while (true) {
            plot(x, y, '.', 1);
            if (x === to.column && y === to.row) break;
            const doubledError = error * 2;
            if (doubledError > -dy) {
                error -= dy;
                x += sx;
            }
            if (doubledError < dx) {
                error += dx;
                y += sy;
            }
        }
    };

    const projectedPath = path.map(project);
    for (let index = 1; index < projectedPath.length; index++) {
        drawLine(projectedPath[index - 1], projectedPath[index]);
    }

    for (const planet of planets) {
        const orbit = planet.properties?.orbit;
        const isOrbiting = Boolean(
            (orbit?.orbitTargetId || orbit?.targetId || orbit?.orbitCenter || orbit?.center) &&
            (orbit?.orbitRadius ?? orbit?.radius ?? 0) > 0 &&
            (orbit?.orbitSpeed ?? orbit?.speed ?? 0) !== 0
        );
        const position = project(planet.position);
        plot(position.column, position.row, isOrbiting ? 'o' : 'O', isOrbiting ? 2 : 3);
    }

    if (slingshot?.position) {
        const position = project(slingshot.position);
        plot(position.column, position.row, 'S', 4);
    }
    if (target?.position) {
        const position = project(target.position);
        plot(position.column, position.row, 'T', 5);
    }

    const border = `+${'-'.repeat(columns)}+`;
    const map = grid.map(row => `|${row.join('')}|`).join('\n');
    return [
        `/launch ${result.angle} ${result.power}`,
        `angle=${result.angle.toFixed(2)} power=${result.power.toFixed(2)} ` +
            `score=${trajectoryScore(result)} bonuses=${bonusCount(result)} ` +
            `distance=${trajectoryDistance(result).toFixed(2)}`,
        border,
        map,
        border,
        `S slingshot  T target  O root/static planet  o orbiting planet  . flight path`,
        `view x=${minX.toFixed(0)}..${maxX.toFixed(0)}, y=${minY.toFixed(0)}..${maxY.toFixed(0)}`
    ].join('\n');
}

function bonusCount(result) {
    return Array.isArray(result.collectedBonuses) ? result.collectedBonuses.length : 0;
}

function compareTrajectoryDistance(a, b) {
    return trajectoryDistance(b) - trajectoryDistance(a);
}

function compareAsciiTrajectoryResults(a, b) {
    return trajectoryScore(b) - trajectoryScore(a) || compareTrajectoryDistance(a, b);
}

function trajectoryScore(result) {
    if (Number.isFinite(result.score)) return result.score;
    if (Number.isFinite(result.bonusScore)) return result.bonusScore;
    return bonusCount(result);
}

function trajectoryDistance(result) {
    return Number.isFinite(result.distance) ? result.distance : 0;
}

function trajectoryFingerprint(result, sampleCount = 16) {
    const points = [...(result.trajectory || []), result.finalPosition]
        .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    if (points.length < 2) return null;

    const cumulativeDistances = [0];
    for (let index = 1; index < points.length; index++) {
        const dx = points[index].x - points[index - 1].x;
        const dy = points[index].y - points[index - 1].y;
        cumulativeDistances.push(cumulativeDistances[index - 1] + Math.hypot(dx, dy));
    }

    const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
    if (totalDistance === 0) return null;

    const samples = [];
    let segment = 1;
    for (let sample = 0; sample < sampleCount; sample++) {
        const targetDistance = totalDistance * sample / (sampleCount - 1);
        while (segment < cumulativeDistances.length - 1 && cumulativeDistances[segment] < targetDistance) {
            segment++;
        }

        const startDistance = cumulativeDistances[segment - 1];
        const endDistance = cumulativeDistances[segment];
        const span = endDistance - startDistance;
        const ratio = span > 0 ? (targetDistance - startDistance) / span : 0;
        const start = points[segment - 1];
        const end = points[segment];
        samples.push({
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio
        });
    }

    return { samples, totalDistance };
}

function trajectoriesAreClose(left, right, threshold = 24) {
    if (!left || !right) return false;

    const relativeLengthDifference = Math.abs(left.totalDistance - right.totalDistance) /
        Math.max(left.totalDistance, right.totalDistance);
    if (relativeLengthDifference > 0.08) return false;

    let squaredDistance = 0;
    for (let index = 0; index < left.samples.length; index++) {
        const dx = left.samples[index].x - right.samples[index].x;
        const dy = left.samples[index].y - right.samples[index].y;
        squaredDistance += dx * dx + dy * dy;
    }

    return Math.sqrt(squaredDistance / left.samples.length) <= threshold;
}

function selectDiverseAsciiResults(results, limit = 5, closenessThreshold = 24) {
    const ranked = [...results].sort(compareAsciiTrajectoryResults);
    const selected = [];
    const fingerprints = new Map(
        ranked.map(result => [result, trajectoryFingerprint(result)])
    );

    for (const candidate of ranked) {
        const candidateFingerprint = fingerprints.get(candidate);
        const duplicatesSelectedRoute = selected.some(result => trajectoriesAreClose(
            candidateFingerprint,
            fingerprints.get(result),
            closenessThreshold
        ));
        if (!duplicatesSelectedRoute) selected.push(candidate);
        if (selected.length === limit) return selected;
    }

    // If there are not enough distinct routes, retain the best remaining shots
    // so callers still receive the requested number of samples.
    for (const candidate of ranked) {
        if (!selected.includes(candidate)) selected.push(candidate);
        if (selected.length === limit) break;
    }

    return selected;
}

function optionValue(args, name, fallback = null) {
    const index = args.indexOf(name);
    return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

function parseNumber(args, name, fallback) {
    const raw = optionValue(args, name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`${name} requires a finite number`);
    }
    return value;
}

function parseRange(args, name, fallback) {
    const raw = optionValue(args, name);
    if (raw === null) return fallback;
    const values = raw.split(':').map(Number);
    if (values.length !== 2 || values.some(value => !Number.isFinite(value))) {
        throw new Error(`${name} requires MIN:MAX`);
    }
    return values;
}

function parseWorkers(args) {
    const raw = optionValue(args, '--workers', 'auto');
    if (raw === 'auto') return raw;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error('--workers requires "auto" or a positive integer');
    }
    return value;
}

function printLevelSummary(summary, showAll, showAscii = false) {
    console.log(`Level: ${summary.levelPath}`);
    if (summary.requireAllBonuses) {
        console.log(`Success requirement: target + all ${summary.totalBonuses} bonuses`);
    }
    console.log(`Successful trajectories: ${summary.successfulTrajectories}/${summary.totalSamples}`);
    console.log(`Duration: ${summary.duration.toFixed(2)}s`);

    const results = showAll ? summary.allResults : summary.allResults.slice(0, 5);
    for (const result of results) {
        console.log(
            `  angle=${result.angle.toFixed(2)} power=${result.power.toFixed(2)} ` +
            `score=${trajectoryScore(result)} bonuses=${bonusCount(result)} ` +
            `distance=${trajectoryDistance(result).toFixed(2)}`
        );
    }

    if (showAscii) {
        for (const asciiMap of summary.asciiMaps) {
            console.log(`\n${asciiMap}`);
        }
    }
}

function printValidation(levelPath, validation) {
    const status = validation.valid ? 'VALID' : 'INVALID';
    console.log(`${status}: ${levelPath} (${validation.errors.length} errors, ${validation.warnings.length} warnings)`);
    const details = formatLevelDiagnostics(validation);
    if (details) console.log(details);
}

function showHelp() {
    console.log(`Spaced Penguin Level Tester

Usage:
  node levelTester.js --level <path> [options]
  node levelTester.js --single --level <path> --angle <deg> --power <num>
  node levelTester.js --batch <level1.json> <level2.json> [options]
  node levelTester.js --validate-only --level <path>

Options:
  --samples <num>       Exact number of trajectory combinations (default: 100)
  --angle-range <a:b>   Angle range for a sweep (default: 0:360)
  --power-range <a:b>   Pullback range in pixels (default: 10:100)
  --max-time <seconds>  Maximum simulation time per trajectory (default: ${DEFAULT_MAX_SIMULATION_TIME})
  --workers <auto|num>  Parallel workers; auto uses up to 4 for 5,000+ samples
  --trajectory          Include trajectory points for a single simulation
  --ascii               Draw distinct successful routes ranked by score and distance
  --all-bonuses         Count success only after collecting every bonus and hitting the target
  --validate-only       Validate definitions without simulating trajectories
  --all                 Print every successful trajectory
  --verbose, -v         Include the best trajectory points in API results
  --help, -h            Show this help
`);
}

async function main(args = process.argv.slice(2)) {
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
        return 0;
    }

    const tester = new LevelTester();
    tester.verbose = args.includes('--verbose') || args.includes('-v');

    const maxTime = parseNumber(args, '--max-time', DEFAULT_MAX_SIMULATION_TIME);

    if (args.includes('--validate-only')) {
        const levelPaths = args.includes('--batch')
            ? args.filter(arg => arg.toLowerCase().endsWith('.json'))
            : [optionValue(args, '--level')].filter(Boolean);
        if (levelPaths.length === 0) throw new Error('--validate-only requires --level or --batch JSON paths');

        let allValid = true;
        for (const levelPath of levelPaths) {
            const validation = await tester.validateLevelFile(levelPath);
            printValidation(levelPath, validation);
            allValid = allValid && validation.valid;
        }
        return allValid ? 0 : 1;
    }

    if (args.includes('--single')) {
        const levelPath = optionValue(args, '--level');
        if (!levelPath) throw new Error('--single requires --level');

        const angle = parseNumber(args, '--angle', NaN);
        const power = parseNumber(args, '--power', NaN);
        if (!Number.isFinite(angle) || !Number.isFinite(power)) {
            throw new Error('--single requires --angle and --power');
        }

        const result = await tester.testSingleTrajectory(levelPath, angle, power, {
            maxTime,
            requireAllBonuses: args.includes('--all-bonuses')
        });
        const output = args.includes('--trajectory')
            ? result
            : { ...result, trajectory: undefined };
        console.log(JSON.stringify(output, null, 2));
        return result.success ? 0 : 1;
    }

    const commonOptions = {
        samples: parseNumber(args, '--samples', 100),
        angleRange: parseRange(args, '--angle-range', [0, 360]),
        powerRange: parseRange(args, '--power-range', [10, 100]),
        maxTime,
        workers: parseWorkers(args),
        findAll: args.includes('--all'),
        ascii: args.includes('--ascii'),
        requireAllBonuses: args.includes('--all-bonuses')
    };

    if (args.includes('--batch')) {
        const levelPaths = args.filter(arg => arg.toLowerCase().endsWith('.json'));
        if (levelPaths.length === 0) throw new Error('--batch requires at least one JSON level path');

        const results = await tester.batchTestLevels(levelPaths, commonOptions);
        for (const result of results) {
            if (result.error) console.error(`${result.levelPath}: ${result.error}`);
            else printLevelSummary(result, commonOptions.findAll, commonOptions.ascii);
        }
        return results.every(result => result.success) ? 0 : 1;
    }

    const levelPath = optionValue(args, '--level');
    if (!levelPath) {
        showHelp();
        throw new Error('Missing --level argument');
    }

    const summary = await tester.testLevel(levelPath, commonOptions);
    printLevelSummary(summary, commonOptions.findAll, commonOptions.ascii);
    return summary.success ? 0 : 1;
}

const currentFile = fileURLToPath(import.meta.url);
const scriptFile = process.argv[1] ? resolve(process.argv[1]) : null;
if (scriptFile === currentFile) {
    main()
        .then(exitCode => {
            process.exitCode = exitCode;
        })
        .catch(error => {
            console.error(`Error: ${error.message}`);
            process.exitCode = 1;
        });
}

export {
    LevelTester,
    compareAsciiTrajectoryResults,
    main,
    renderAsciiTrajectory,
    selectDiverseAsciiResults
};
