import { solveGravitySculpt } from './gravitySculptor.js';

/** Run the expensive editor solve away from rendering/input when workers exist. */
export async function solveGravitySculptOffThread(request, onProgress) {
    if (typeof Worker !== 'function') {
        return solveGravitySculpt({ ...request, onProgress });
    }
    let worker;
    try {
        worker = new Worker(
            new URL('../workers/gravitySculptWorker.js', import.meta.url),
            { type: 'module', name: 'gravity-sculpt' }
        );
    } catch {
        return solveGravitySculpt({ ...request, onProgress });
    }
    try {
        return await new Promise((resolve, reject) => {
            worker.onmessage = event => {
                if (event.data?.type === 'progress') onProgress?.(event.data.progress);
                else if (event.data?.type === 'result') resolve(event.data.result);
                else if (event.data?.type === 'error') reject(new Error(event.data.message));
            };
            worker.onerror = event => reject(new Error(
                event.message || 'Gravity Sculpt worker failed'
            ));
            worker.postMessage({ type: 'solve', request });
        });
    } finally {
        worker.terminate();
    }
}
