import { startStaticServer, stopStaticServer } from '../testing/staticServer.js';

export default async function globalSetup() {
    try {
        const server = await startStaticServer();
        return async () => stopStaticServer(server);
    } catch (error) {
        if (error?.code !== 'EADDRINUSE') throw error;
        const response = await fetch('http://127.0.0.1:4173/index.html');
        const html = response.ok ? await response.text() : '';
        if (!html.includes('<title>Spaced Penguin</title>')) throw error;
        console.log('Reusing the Spaced Penguin server already running at http://127.0.0.1:4173');
        return async () => {};
    }
}
