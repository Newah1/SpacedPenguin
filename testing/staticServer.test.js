import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createStaticServer, stopStaticServer } from './staticServer.js';

test('local static server can inject community configuration without editing app-config.js', async () => {
    const server = createStaticServer({ levelServerBaseUrl: 'http://127.0.0.1:3000' });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/app-config.js`);
        const source = await response.text();
        assert.equal(response.status, 200);
        assert.match(source, /"baseUrl": "http:\/\/127\.0\.0\.1:3000"/);
        assert.match(source, /"requestTimeoutMs": 8000/);
    } finally {
        await stopStaticServer(server);
    }
});
