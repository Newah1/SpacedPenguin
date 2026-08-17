import { createLevelServer } from './app.js';
import { loadServerConfig } from './config.js';
import { startStaticServer, stopStaticServer } from '../testing/staticServer.js';

const clientHost = process.env.HOST || '127.0.0.1';
const clientPort = Number.parseInt(process.env.PORT || '4173', 10);
const levelConfig = loadServerConfig();
const clientOrigin = `http://${clientHost}:${clientPort}`;
const localClientOrigins = new Set([clientOrigin]);
if (clientHost === '127.0.0.1' || clientHost === 'localhost') {
    localClientOrigins.add(`http://127.0.0.1:${clientPort}`);
    localClientOrigins.add(`http://localhost:${clientPort}`);
}
const publicLevelHost = ['0.0.0.0', '::'].includes(levelConfig.host) ? '127.0.0.1' : levelConfig.host;
const levelServerBaseUrl = process.env.LEVEL_SERVER_PUBLIC_URL || `http://${publicLevelHost}:${levelConfig.port}`;

const levelServer = createLevelServer({
    ...levelConfig,
    corsOrigins: levelConfig.corsOrigin || [...localClientOrigins]
});

async function listen(server, port, host) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });
}

let clientServer;
try {
    await listen(levelServer, levelConfig.port, levelConfig.host);
    clientServer = await startStaticServer({
        host: clientHost,
        port: clientPort,
        levelServerBaseUrl
    });
    console.log(`Community API available at ${levelServerBaseUrl}`);
    console.log(`Open ${clientOrigin}`);
} catch (error) {
    levelServer.closeAllConnections?.();
    if (levelServer.listening) await new Promise(resolve => levelServer.close(resolve));
    await levelServer.verifier.close?.();
    levelServer.database.close();
    if (error?.code === 'EADDRINUSE') {
        console.error(`Cannot start the local community environment: port ${error.port} is already in use.`);
        console.error('Stop the existing process or choose another port with LEVEL_SERVER_PORT or PORT.');
        process.exitCode = 1;
    } else {
        throw error;
    }
}

let stopping = false;
async function shutdown() {
    if (stopping) return;
    stopping = true;
    await stopStaticServer(clientServer);
    levelServer.closeAllConnections?.();
    if (levelServer.listening) await new Promise(resolve => levelServer.close(resolve));
    await levelServer.verifier.close?.();
    levelServer.database.close();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        await shutdown();
        process.exit(0);
    });
}
