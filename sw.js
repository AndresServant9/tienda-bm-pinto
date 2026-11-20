/* Solo se guarda una pantalla pública sin datos. Nunca se cachean cuentas, API, pedidos o justificantes. */
'use strict';
const CACHE = 'bm-pinto-offline-v114';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/sin-conexion.html')));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('bm-pinto-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET'||request.mode!=='navigate'||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(request).catch(()=>caches.match('/sin-conexion.html')));
});
