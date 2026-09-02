import { solveGravitySculpt } from './gravitySculptor.js';

function abortError() {
    if (typeof DOMException === 'function') return new DOMException('Gravity Sculpt was cancelled', 'AbortError');
    const error = new Error('Gravity Sculpt was cancelled');
    error.name = 'AbortError';
    return error;
}

/** Run the expensive editor solve away from rendering/input when workers exist. */
export async function solveGravitySculptOffThread(request, onProgress, { signal } = {}) {
    if (signal?.aborted) throw abortError();
    if (typeof Worker !== 'function') {
        return solveGravitySculpt({ ...request, onProgress, signal });
    }
    let worker;
    try {
        worker = new Worker(
            new URL('../workers/gravitySculptWorker.js', import.meta.url),
            { type: 'module', name: 'gravity-sculpt' }
        );
    } catch {
        return solveGravitySculpt({ ...request, onProgress, signal });
    }
    let abortListener = null;
    try {
        return await new Promise((resolve, reject) => {
            let settled = false;
            const finish = callback => value => {
                if (settled) return;
                settled = true;
                callback(value);
            };
            const resolveOnce = finish(resolve);
            const rejectOnce = finish(reject);
            worker.onmessage = event => {
                if (event.data?.type === 'progress') onProgress?.(event.data.progress);
                else if (event.data?.type === 'result') resolveOnce(event.data.result);
                else if (event.data?.type === 'error') rejectOnce(new Error(event.data.message));
            };
            worker.onerror = event => rejectOnce(new Error(
                event.message || 'Gravity Sculpt worker failed'
            ));
            abortListener = () => {
                worker.terminate();
                rejectOnce(abortError());
            };
            signal?.addEventListener('abort', abortListener, { once: true });
            worker.postMessage({ type: 'solve', request });
        });
    } finally {
        if (abortListener) signal?.removeEventListener('abort', abortListener);
        worker.terminate();
    }
}
