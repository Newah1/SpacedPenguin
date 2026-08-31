import { expect, test } from '@playwright/test';

test('browser initializes and runs the Rust/WebAssembly simulation backend', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.gameManager?.bootstrapComplete === true);
    await expect.poll(() => page.evaluate(() => window.gameManager.getSimulationBackend())).toBe('wasm');
});

test('Gravity Sculpt evaluates stationary populations in the Wasm worker pool', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.gameManager?.bootstrapComplete === true);
    const result = await page.evaluate(async () => {
        const { createSimulationStateFromLevel } = await import('/js/simulation/simulationState.js');
        const { solveGravitySculptOffThread } = await import('/js/simulation/gravitySculptWorkerClient.js');
        const state = createSimulationStateFromLevel({
            name: 'Gravity Sculpt browser worker',
            startPosition: { x: 70, y: 300 },
            targetPosition: { x: 760, y: 300 },
            objects: [
                { type: 'slingshot', position: { x: 70, y: 300 }, properties: {
                    velocityMultiplier: 1, maxPullback: 150, minPullback: 25
                } },
                { type: 'planet', position: { x: 300, y: 200 }, properties: {
                    id: 'planet', radius: 18, mass: 120, gravitationalReach: 900
                } },
                { type: 'target', position: { x: 760, y: 300 }, properties: {
                    width: 20, height: 20
                } }
            ],
            rules: { gravitationalConstant: 3 }
        });
        const solved = await solveGravitySculptOffThread({
            state,
            desiredPath: [
                { x: 70, y: 300 }, { x: 300, y: 225 }, { x: 730, y: 270 }
            ],
            planetIndices: [0],
            launch: { velocity: { x: 235, y: 0 }, angleDegrees: 0, pullbackPower: 150 },
            options: {
                adjustPosition: false,
                adjustMass: true,
                seed: 284117,
                budgetMultiplier: 0.5,
                influenceGuidanceEnabled: false,
                waypointCurriculumEnabled: false,
                robustLaunchOffsets: [],
                previewSeconds: 1.5,
                stages: {
                    mass: { population: 6, generations: 1 },
                    joint: { population: 6, generations: 1 }
                }
            }
        });
        return {
            backend: solved.evaluationBackend,
            workers: solved.evaluationWorkers,
            candidates: solved.candidates.length
        };
    });
    expect(result.backend).toBe('wasm');
    expect(result.workers).toBeGreaterThanOrEqual(1);
    expect(result.candidates).toBeGreaterThan(0);
});
