import { chromium } from 'playwright';
import { startStaticServer, stopStaticServer } from './staticServer.js';

const port = 4174;
const server = await startStaticServer({ port });
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/index.html`);
    const result = await page.evaluate(async () => {
        const { createSimulationStateFromLevel } = await import('/js/simulation/simulationState.js');
        const {
            evaluateSculptCandidate,
            solveGravitySculpt
        } = await import('/js/simulation/gravitySculptor.js');
        const { solveGravitySculptOffThread } = await import('/js/simulation/gravitySculptWorkerClient.js');
        const state = () => createSimulationStateFromLevel({
            name: 'Gravity Sculpt browser benchmark',
            startPosition: { x: 70, y: 300 },
            targetPosition: { x: 760, y: 300 },
            objects: [
                { type: 'slingshot', position: { x: 70, y: 300 }, properties: {
                    velocityMultiplier: 1, maxPullback: 150, minPullback: 25
                } },
                { type: 'planet', position: { x: 270, y: 175 }, properties: {
                    id: 'upper', radius: 18, mass: 120, gravitationalReach: 900
                } },
                { type: 'planet', position: { x: 470, y: 430 }, properties: {
                    id: 'lower', radius: 18, mass: 120, gravitationalReach: 900
                } },
                { type: 'planet', position: { x: 650, y: 170 }, properties: {
                    id: 'exit', radius: 18, mass: 120, gravitationalReach: 900
                } },
                { type: 'target', position: { x: 760, y: 300 }, properties: { width: 20, height: 20 } }
            ],
            rules: { gravitationalConstant: 3 }
        });
        const baseRequest = budgetMultiplier => ({
            state: state(),
            desiredPath: [
                { x: 70, y: 300 }, { x: 280, y: 225 },
                { x: 500, y: 350 }, { x: 730, y: 245 }
            ],
            planetIndices: [0, 1, 2],
            options: {
                adjustPosition: false, adjustMass: true, adjustLaunch: true,
                budgetMultiplier, seed: 284117
            }
        });
        const javascriptFactory = async ({ state: base, launch, variables }) => ({
            backend: 'javascript',
            workerCount: 1,
            async evaluateMany(path, config, values) {
                return values.map(candidate =>
                    evaluateSculptCandidate(base, path, launch, variables, candidate, config)
                );
            },
            dispose() {}
        });
        const measure = async operation => {
            const started = performance.now();
            const solved = await operation();
            return {
                milliseconds: performance.now() - started,
                backend: solved.evaluationBackend,
                workers: solved.evaluationWorkers,
                evaluations: solved.evaluations,
                missedWaypoints: solved.missedWaypointCount
            };
        };
        const median = values => [...values]
            .sort((left, right) => left.milliseconds - right.milliseconds)[Math.floor(values.length / 2)];
        const results = [];
        for (const budgetMultiplier of [0.5, 1]) {
            await solveGravitySculpt({
                ...baseRequest(budgetMultiplier), evaluatorFactory: javascriptFactory
            });
            const javascriptRuns = [];
            for (let index = 0; index < 3; index++) {
                javascriptRuns.push(await measure(() => solveGravitySculpt({
                    ...baseRequest(budgetMultiplier), evaluatorFactory: javascriptFactory
                })));
            }
            await solveGravitySculptOffThread(baseRequest(budgetMultiplier));
            const wasmRuns = [];
            for (let index = 0; index < 3; index++) {
                wasmRuns.push(await measure(() =>
                    solveGravitySculptOffThread(baseRequest(budgetMultiplier))
                ));
            }
            results.push({
                budgetMultiplier,
                javascript: median(javascriptRuns),
                offThreadWasm: median(wasmRuns),
                javascriptRuns: javascriptRuns.map(value => value.milliseconds),
                wasmRuns: wasmRuns.map(value => value.milliseconds)
            });
        }
        return results;
    });
    console.log(JSON.stringify(result.map(entry => ({
        budgetMultiplier: entry.budgetMultiplier,
        javascript: {
            ...entry.javascript,
            milliseconds: Number(entry.javascript.milliseconds.toFixed(2))
        },
        offThreadWasm: {
            ...entry.offThreadWasm,
            milliseconds: Number(entry.offThreadWasm.milliseconds.toFixed(2))
        },
        speedup: Number((entry.javascript.milliseconds / entry.offThreadWasm.milliseconds).toFixed(2)),
        javascriptRunsMilliseconds: entry.javascriptRuns.map(value => Number(value.toFixed(2))),
        wasmRunsMilliseconds: entry.wasmRuns.map(value => Number(value.toFixed(2)))
    })), null, 2));
} finally {
    await browser.close();
    await stopStaticServer(server);
}
