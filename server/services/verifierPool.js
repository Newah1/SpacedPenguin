import { Worker } from 'node:worker_threads';
import { ApiError } from '../errors.js';

export class VerifierPool {
    constructor({ size = 4, maxQueue = 32, timeoutMs = 5000 } = {}) {
        this.size = size;
        this.maxQueue = maxQueue;
        this.timeoutMs = timeoutMs;
        this.workers = new Set();
        this.idle = [];
        this.queue = [];
        this.jobs = new Map();
        this.nextId = 1;
        this.closed = false;
    }

    verifyPublication({ level, proof }) {
        return this.#enqueue(level, proof, 'publication');
    }

    verifyScore({ level, proof }) {
        return this.#enqueue(level, proof, 'score');
    }

    #enqueue(level, proof, mode) {
        if (this.closed) return Promise.reject(new ApiError(503, 'VERIFIER_UNAVAILABLE', 'The verifier is shutting down.'));
        if (this.queue.length >= this.maxQueue) return Promise.reject(new ApiError(503, 'VERIFICATION_QUEUE_FULL', 'The verification queue is full.'));
        return new Promise((resolve, reject) => {
            this.queue.push({ id: this.nextId++, level, proof, mode, resolve, reject });
            this.#dispatch();
        });
    }

    #createWorker() {
        const worker = new Worker(new URL('../workers/verifierWorker.js', import.meta.url));
        worker.unref();
        worker.on('message', message => this.#finish(worker, message));
        worker.on('error', error => this.#workerFailed(worker, error));
        worker.on('exit', code => {
            if (code !== 0) this.#workerFailed(worker, new Error(`Verifier worker exited with code ${code}.`));
            else this.workers.delete(worker);
        });
        this.workers.add(worker);
        return worker;
    }

    #dispatch() {
        while (this.queue.length) {
            let worker = this.idle.pop();
            if (!worker && this.workers.size < this.size) worker = this.#createWorker();
            if (!worker) return;
            const job = this.queue.shift();
            const timeout = setTimeout(() => {
                this.jobs.delete(worker);
                job.reject(new ApiError(503, 'VERIFICATION_TIMEOUT', 'Replay verification exceeded its time limit.'));
                worker.terminate();
                this.workers.delete(worker);
                this.#dispatch();
            }, this.timeoutMs);
            timeout.unref();
            this.jobs.set(worker, { ...job, timeout });
            worker.postMessage({ id: job.id, level: job.level, proof: job.proof, mode: job.mode });
        }
    }

    #finish(worker, message) {
        const job = this.jobs.get(worker);
        if (!job || job.id !== message.id) return;
        clearTimeout(job.timeout);
        this.jobs.delete(worker);
        if (message.error) {
            const illegal = message.error.name === 'RunTranscriptError';
            job.reject(new ApiError(illegal ? 422 : 500,
                illegal ? (job.mode === 'score' ? 'SCORE_PROOF_FAILED' : 'COMPLETION_PROOF_FAILED') : 'VERIFICATION_FAILED',
                illegal ? 'The submitted proof contains an illegal action.' : 'Replay verification failed.',
                { reason: message.error.code || 'illegal_action' }));
        } else if (!message.result?.success) {
            job.reject(new ApiError(422, job.mode === 'score' ? 'SCORE_PROOF_FAILED' : 'COMPLETION_PROOF_FAILED',
                'The submitted run did not complete the level.', { reason: message.result?.reason || 'target_not_reached' }));
        } else {
            job.resolve({ ...message.result, completed: true, result: message.result.score });
        }
        this.idle.push(worker);
        this.#dispatch();
    }

    #workerFailed(worker, error) {
        const job = this.jobs.get(worker);
        if (job) {
            clearTimeout(job.timeout);
            this.jobs.delete(worker);
            job.reject(new ApiError(503, 'VERIFIER_UNAVAILABLE', 'A replay verifier worker failed.', { cause: error.message }));
        }
        this.workers.delete(worker);
        this.idle = this.idle.filter(candidate => candidate !== worker);
        this.#dispatch();
    }

    async close() {
        this.closed = true;
        const error = new ApiError(503, 'VERIFIER_UNAVAILABLE', 'The verifier is shutting down.');
        for (const job of this.queue.splice(0)) job.reject(error);
        for (const job of this.jobs.values()) {
            clearTimeout(job.timeout);
            job.reject(error);
        }
        this.jobs.clear();
        await Promise.all([...this.workers].map(worker => worker.terminate()));
        this.workers.clear();
        this.idle = [];
    }
}
