#!/usr/bin/env node

// Level Testing CLI for Spaced Penguin
// Fast CPU-bound trajectory simulation and validation

import { HeadlessGameEngine } from './headlessEngine.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

class LevelTester {
    constructor() {
        this.engine = new HeadlessGameEngine();
        this.verbose = false;
    }

    async loadLevelFile(levelPath) {
        try {
            const fullPath = resolve(levelPath);
            const levelData = JSON.parse(await readFile(fullPath, 'utf8'));
            return levelData;
        } catch (error) {
            throw new Error(`Failed to load level file ${levelPath}: ${error.message}`);
        }
    }

    async testLevel(levelPath, options = {}) {
        const {
            samples = 100,
            angleRange = [0, 360],
            powerRange = [10, 300],
            maxTime = 30,
            findAll = false
        } = options;

        console.log(`\n🧪 Testing Level: ${levelPath}`);
        console.log(`📊 Parameters: ${samples} samples, angles ${angleRange[0]}-${angleRange[1]}°, power ${powerRange[0]}-${powerRange[1]}`);
        
        const startTime = Date.now();
        
        // Load level
        const levelData = await this.loadLevelFile(levelPath);
        const loaded = this.engine.loadLevel(levelData);
        
        if (!loaded) {
            throw new Error('Failed to load level into engine');
        }
        
        // Debug level loading
        const planetsInLevel = levelData.objects?.filter(obj => obj.type === 'planet').length || 0;
        const target = levelData.objects?.find(obj => obj.type === 'target');
        const targetPos = target ? `${target.position.x}, ${target.position.y}` : 'unknown';
        
        console.log(`✅ Level loaded: ${planetsInLevel} planets, target at [${targetPos}]`);
        
        // Find working trajectories
        const results = this.engine.findWorkingTrajectories(angleRange, powerRange, samples);
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log(`\n⏱️  Simulation completed in ${duration.toFixed(2)} seconds`);
        console.log(`🎯 Results: ${results.length} successful trajectories found`);
        
        if (results.length > 0) {
            // Sort by distance (longer shots are more interesting)
            results.sort((a, b) => b.distance - a.distance);
            
            console.log(`\n🏆 Best trajectories:`);
            const showCount = findAll ? results.length : Math.min(5, results.length);
            
            for (let i = 0; i < showCount; i++) {
                const result = results[i];
                console.log(`   ${i + 1}. Angle: ${result.angle.toFixed(1)}°, Power: ${result.power.toFixed(1)}, Distance: ${result.distance.toFixed(0)}px, Steps: ${result.steps}`);
            }
            
            if (this.verbose && results.length > 0) {
                console.log(`\n📈 Detailed trajectory for best result:`);
                const best = results[0];
                console.log(`   Trajectory points: ${best.trajectory.length}`);
                console.log(`   Final position: [${best.finalPosition.x.toFixed(1)}, ${best.finalPosition.y.toFixed(1)}]`);
                console.log(`   Success reason: ${best.reason}`);
            }
            
            return {
                success: true,
                levelPath,
                totalSamples: samples,
                successfulTrajectories: results.length,
                bestResult: results[0],
                allResults: results,
                duration
            };
        } else {
            console.log(`❌ No successful trajectories found!`);
            console.log(`   Try increasing sample size or adjusting angle/power ranges.`);
            
            return {
                success: false,
                levelPath,
                totalSamples: samples,
                successfulTrajectories: 0,
                duration
            };
        }
    }

    async testSingleTrajectory(levelPath, angle, power, options = {}) {
        const { maxTime = 30, showTrajectory = false } = options;
        
        console.log(`\n🎯 Testing single trajectory: ${angle}° at power ${power}`);
        
        // Load level
        const levelData = await this.loadLevelFile(levelPath);
        this.engine.loadLevel(levelData);
        
        const startTime = Date.now();
        const result = this.engine.simulateTrajectory(angle, power, maxTime);
        const endTime = Date.now();
        
        console.log(`⏱️  Simulation completed in ${endTime - startTime}ms`);
        console.log(`📊 Result: ${result.success ? '✅ SUCCESS' : '❌ FAILED'} (${result.reason})`);
        console.log(`📍 Final position: [${result.finalPosition.x.toFixed(1)}, ${result.finalPosition.y.toFixed(1)}]`);
        console.log(`⚡ Steps simulated: ${result.steps} (${(result.steps / 60).toFixed(1)}s game time)`);
        
        if (result.success) {
            console.log(`🎯 Distance traveled: ${result.distance.toFixed(0)}px`);
        }
        
        if (showTrajectory && result.trajectory.length > 0) {
            console.log(`\n📈 Trajectory points (every 10th step):`);
            result.trajectory.slice(0, 10).forEach((point, i) => {
                console.log(`   ${(point.time).toFixed(2)}s: [${point.x.toFixed(1)}, ${point.y.toFixed(1)}] vel:[${point.velocity.x.toFixed(1)}, ${point.velocity.y.toFixed(1)}]`);
            });
            if (result.trajectory.length > 10) {
                console.log(`   ... and ${result.trajectory.length - 10} more points`);
            }
        }
        
        return result;
    }

    async batchTestLevels(levelPaths, options = {}) {
        const results = [];
        
        console.log(`\n🧪 Batch testing ${levelPaths.length} levels...`);
        
        for (let i = 0; i < levelPaths.length; i++) {
            const levelPath = levelPaths[i];
            console.log(`\n--- Testing ${i + 1}/${levelPaths.length}: ${levelPath} ---`);
            
            try {
                const result = await this.testLevel(levelPath, options);
                results.push(result);
            } catch (error) {
                console.error(`❌ Failed to test ${levelPath}: ${error.message}`);
                results.push({
                    success: false,
                    levelPath,
                    error: error.message
                });
            }
        }
        
        // Summary
        console.log(`\n📊 Batch Test Summary:`);
        const successful = results.filter(r => r.success).length;
        console.log(`   ${successful}/${results.length} levels have viable solutions`);
        
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            console.log(`\n❌ Levels with no solutions:`);
            failed.forEach(result => {
                console.log(`   - ${result.levelPath}: ${result.error || 'No trajectories found'}`);
            });
        }
        
        return results;
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const tester = new LevelTester();
    
    if (args.includes('--verbose') || args.includes('-v')) {
        tester.verbose = true;
        console.log('🔊 Verbose mode enabled');
    }
    
    try {
        if (args.includes('--help') || args.includes('-h')) {
            showHelp();
            return;
        }
        
        if (args.includes('--single')) {
            // Test single trajectory
            const levelIndex = args.indexOf('--level');
            const angleIndex = args.indexOf('--angle');
            const powerIndex = args.indexOf('--power');
            
            if (levelIndex === -1 || angleIndex === -1 || powerIndex === -1) {
                console.error('❌ --single requires --level, --angle, and --power arguments');
                process.exit(1);
            }
            
            const levelPath = args[levelIndex + 1];
            const angle = parseFloat(args[angleIndex + 1]);
            const power = parseFloat(args[powerIndex + 1]);
            
            await tester.testSingleTrajectory(levelPath, angle, power, {
                showTrajectory: args.includes('--trajectory')
            });
            
        } else if (args.includes('--batch')) {
            // Batch test multiple levels
            const levelPaths = args.filter(arg => arg.endsWith('.json'));
            
            if (levelPaths.length === 0) {
                console.error('❌ No level files specified for batch testing');
                process.exit(1);
            }
            
            await tester.batchTestLevels(levelPaths, {
                samples: args.includes('--samples') ? parseInt(args[args.indexOf('--samples') + 1]) : 100
            });
            
        } else {
            // Test single level
            const levelIndex = args.indexOf('--level');
            if (levelIndex === -1) {
                console.error('❌ Missing --level argument');
                showHelp();
                process.exit(1);
            }
            
            const levelPath = args[levelIndex + 1];
            const samples = args.includes('--samples') ? parseInt(args[args.indexOf('--samples') + 1]) : 100;
            
            // Parse custom angle range
            let angleRange = [0, 360];
            if (args.includes('--angle-range')) {
                const rangeIndex = args.indexOf('--angle-range');
                const rangeStr = args[rangeIndex + 1];
                const [min, max] = rangeStr.split(':').map(parseFloat);
                angleRange = [min, max];
            }
            
            // Parse custom power range  
            let powerRange = [100, 300];
            if (args.includes('--power-range')) {
                const rangeIndex = args.indexOf('--power-range');
                const rangeStr = args[rangeIndex + 1];
                const [min, max] = rangeStr.split(':').map(parseFloat);
                powerRange = [min, max];
            }
            
            await tester.testLevel(levelPath, {
                samples,
                angleRange,
                powerRange,
                findAll: args.includes('--all')
            });
        }
        
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
🐧 Spaced Penguin Level Tester

Usage:
  node levelTester.js --level <path> [options]              Test a single level
  node levelTester.js --single --level <path> --angle <deg> --power <num>  Test specific trajectory
  node levelTester.js --batch <level1.json> <level2.json>   Test multiple levels

Options:
  --level <path>        Path to level JSON file
  --samples <num>       Number of trajectory samples to test (default: 100)
  --angle <degrees>     Launch angle for single trajectory test
  --power <number>      Launch power for single trajectory test
  --all                 Show all successful trajectories (not just top 5)
  --verbose, -v         Show detailed output
  --trajectory          Show trajectory points for single test
  --help, -h            Show this help

Examples:
  node levelTester.js --level ../levels/level4.json
  node levelTester.js --level ../levels/level4.json --samples 500 --all
  node levelTester.js --single --level ../levels/level4.json --angle 45 --power 80 --trajectory
  node levelTester.js --batch ../levels/level4.json ../levels/level5.json
`);
}

// Run CLI if this file is executed directly
const currentFile = new URL(import.meta.url).pathname;
const scriptFile = process.argv[1];
if (currentFile.endsWith(scriptFile) || currentFile.endsWith('levelTester.js')) {
    console.log('🚀 Starting LevelTester...');
    main().catch(console.error);
}

export { LevelTester };