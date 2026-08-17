import { brotliCompressSync, gzipSync } from 'node:zlib';
import { ApiError } from './errors.js';

export function sendJson(request, response, status, body, headers = {}) {
    let payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const responseHeaders = { ...headers };
    if (payload && payload.length >= 1024) {
        const accepted = String(request.headers['accept-encoding'] || '').toLowerCase();
        if (/\bbr\b/.test(accepted)) {
            payload = brotliCompressSync(payload);
            responseHeaders['content-encoding'] = 'br';
        } else if (/\bgzip\b/.test(accepted)) {
            payload = gzipSync(payload);
            responseHeaders['content-encoding'] = 'gzip';
        }
        if (responseHeaders['content-encoding']) {
            responseHeaders.vary = responseHeaders.vary ? `${responseHeaders.vary}, Accept-Encoding` : 'Accept-Encoding';
        }
    }
    response.writeHead(status, {
        ...(payload === null ? {} : { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) }),
        'x-content-type-options': 'nosniff',
        ...responseHeaders
    });
    response.end(payload);
}

export async function readJson(request, limit) {
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        throw new ApiError(415, 'JSON_REQUIRED', 'Content-Type must be application/json.');
    }
    const encoding = String(request.headers['content-encoding'] || 'identity').toLowerCase();
    if (encoding !== 'identity') throw new ApiError(415, 'COMPRESSED_REQUEST_UNSUPPORTED', 'Compressed request bodies are not accepted.');
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${limit} bytes.`);
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${limit} bytes.`);
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
    }
}
