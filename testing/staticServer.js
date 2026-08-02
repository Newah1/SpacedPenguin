import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '4173', 10);

const contentTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.wav', 'audio/wav']
]);

function resolveRequestPath(requestUrl) {
    const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
    const requestedPath = path.resolve(repositoryRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    const rootPrefix = repositoryRoot.endsWith(path.sep) ? repositoryRoot : repositoryRoot + path.sep;
    if (requestedPath !== repositoryRoot && !requestedPath.startsWith(rootPrefix)) return null;
    return requestedPath;
}

const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
    }

    const requestedPath = resolveRequestPath(request.url || '/');
    if (!requestedPath) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }

    try {
        const filePath = statSync(requestedPath).isDirectory()
            ? path.join(requestedPath, 'index.html')
            : requestedPath;
        const fileStat = statSync(filePath);
        response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Length': fileStat.size,
            'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
        });
        if (request.method === 'HEAD') response.end();
        else createReadStream(filePath).pipe(response);
    } catch {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
    }
});

server.listen(port, host, () => {
    console.log(`Serving ${repositoryRoot} at http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
