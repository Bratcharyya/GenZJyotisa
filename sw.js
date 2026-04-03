const LEGACY_CACHE_PREFIX = 'genz-jy';

self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const cacheKeys = await caches.keys();
        await Promise.all(
            cacheKeys
                .filter(key => key.startsWith(LEGACY_CACHE_PREFIX))
                .map(key => caches.delete(key))
        );

        await self.clients.claim();

        const controlledClients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        });

        for (const client of controlledClients) {
            client.postMessage({ type: 'FORCE_RELOAD' });
        }

        await self.registration.unregister();
    })());
});
