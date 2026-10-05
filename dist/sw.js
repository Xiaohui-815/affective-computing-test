// Browser-only byte-range adapter. No experiment data is sent to a server.
import { parseRange } from './core.js';
let manifestPromise;
const recent = new Map();
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
async function chunk(url) {
  if (recent.has(url)) return recent.get(url);
  const promise = fetch(url).then(async response => {
    if (!response.ok) throw new Error('Media chunk HTTP ' + response.status);
    return new Uint8Array(await response.arrayBuffer());
  });
  recent.set(url, promise);
  if (recent.size > 3) recent.delete(recent.keys().next().value);
  try { return await promise; } catch (error) { recent.delete(url); throw error; }
}
async function serve(request) {
  manifestPromise ||= fetch(new URL('media-manifest.json', self.registration.scope), { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('Manifest unavailable'); return r.json(); }).catch(e => { manifestPromise = null; throw e; });
  const manifest = await manifestPromise;
  const asset = manifest.find(m => new URL(m.url, self.registration.scope).href === request.url);
  if (!asset) return new Response('Not found', { status: 404 });
  const range = parseRange(request.headers.get('Range'), asset.size);
  if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${asset.size}` } });
  const { start, end, partial } = range;
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Cache-Control': 'no-store' };
  if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${asset.size}`;
  if (request.method === 'HEAD') return new Response(null, { status: partial ? 206 : 200, headers });
  let position = start, cancelled = false;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (position > end) { controller.close(); return; }
        const index = Math.floor(position / asset.chunkSize);
        const buffer = await chunk(new URL(asset.chunks[index], self.registration.scope).href);
        if (cancelled) return;
        const localStart = position - index * asset.chunkSize;
        const length = Math.min(buffer.length - localStart, end - position + 1);
        if (length <= 0) throw new Error('Truncated chunk');
        controller.enqueue(buffer.subarray(localStart, localStart + length));
        position += length;
      } catch (error) { if (!cancelled) controller.error(error); }
    }, cancel() { cancelled = true; }
  }, { highWaterMark: 0 });
  return new Response(stream, { status: partial ? 206 : 200, headers });
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(new URL('stream/', self.registration.scope).pathname)) {
    event.respondWith(serve(event.request).catch(() => new Response('Media unavailable', { status: 503 })));
  }
});

// Manifest revision: 837e1ee34e0267f88ec33aa4b08b8b8f04aaad786173ccaebac31ae2622506fa
