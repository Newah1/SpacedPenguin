import { startStaticServer, stopStaticServer } from '../testing/staticServer.js';

export default async function globalSetup() {
    const server = await startStaticServer();
    return async () => stopStaticServer(server);
}
