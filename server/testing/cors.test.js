import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createLevelServer } from '../app.js';

test('local server can allow both loopback browser origins', async () => {
    const server = createLevelServer({
        verifier: {},
        corsOrigins: ['http://127.0.0.1:4173', 'http://localhost:4173']
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        for (const origin of ['http://127.0.0.1:4173', 'http://localhost:4173']) {
            const response = await fetch(`${baseUrl}/api/v1/status`, { headers: { origin } });
            assert.equal(response.headers.get('access-control-allow-origin'), origin);
        }
        const disallowed = await fetch(`${baseUrl}/api/v1/status`, {
            headers: { origin: 'https://example.com' }
        });
        assert.equal(disallowed.headers.get('access-control-allow-origin'), null);
    } finally {
        server.close();
        await once(server, 'close');
        server.database.close();
    }
});
