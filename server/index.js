import { createLevelServer } from './app.js';
import { loadServerConfig } from './config.js';

const config = loadServerConfig();
const server = createLevelServer(config);
server.listen(config.port, config.host, () => {
    console.log(`Spaced Penguin level server listening at http://${config.host}:${config.port}`);
});

function shutdown() {
    server.close(async () => {
        await server.verifier.close?.();
        server.database.close();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
