import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const types = { '.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.bin':'application/octet-stream' };
http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const info = await stat(filename);
    if (!info.isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'Content-Type':types[path.extname(filename)] || 'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache' });
    if(req.method === 'HEAD')res.end();else createReadStream(filename).pipe(res);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(4173,'127.0.0.1',()=>console.log('Local URL: http://localhost:4173'));
