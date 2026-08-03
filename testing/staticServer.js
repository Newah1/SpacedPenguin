import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(modulePath), '..');
const defaultHost = process.env.HOST || '127.0.0.1';
const defaultPort = Number.parseInt(process.env.PORT || '4173', 10);

const contentTypes = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.wav', 'audio/wav']
]);

function resolveRequestPath(requestUrl, host, port) {
    const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
    const requestedPath = path.resolve(repositoryRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    const rootPrefix = repositoryRoot.endsWith(path.sep) ? repositoryRoot : repositoryRoot + path.sep;
    if (requestedPath !== repositoryRoot && !requestedPath.startsWith(rootPrefix)) return null;
    return requestedPath;
}

export function createStaticServer({ host = defaultHost, port = defaultPort } = {}) {
    return createServer((request, response) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { Allow: 'GET, HEAD' });
            response.end();
            return;
        }

        const requestedPath = resolveRequestPath(request.url || '/', host, port);
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
}

export async function startStaticServer(options = {}) {
    const host = options.host || defaultHost;
    const port = options.port || defaultPort;
    const server = createStaticServer({ host, port });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });
    console.log(`Serving ${repositoryRoot} at http://${host}:${port}`);
    return server;
}

export async function stopStaticServer(server) {
    if (!server?.listening) return;
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
    const server = await startStaticServer();
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.on(signal, async () => {
            await stopStaticServer(server);
            process.exit(0);
        });
    }
}
