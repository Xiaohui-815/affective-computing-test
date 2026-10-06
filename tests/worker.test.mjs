import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import worker from '../.sites-runtime/worker-dist/server/index.js';
const manifest=JSON.parse(await readFile('dist/media-manifest.json','utf8'));
const asset=manifest.find(x=>x.type==='image');const bytes=await readFile('dist/'+asset.url);const hash=createHash('sha256').update(bytes).digest('hex');
const objects=new Map();const env={MEDIA_UPLOAD_KEY:'test-only-key',BUCKET:{put:async(key,value)=>objects.set(key,value),head:async key=>objects.has(key)?{size:objects.get(key).byteLength,httpEtag:'"test"'}:null,get:async key=>objects.has(key)?{size:objects.get(key).byteLength,httpEtag:'"test"',body:objects.get(key)}:null}};
const call=(pathname,options={})=>worker.fetch(new Request('https://study.example'+pathname,options),env);
test('frontend served; no experiment-data write endpoint',async()=>{assert.match(await(await call('/')).text(),/<!doctype html>/);assert.equal((await call('/experiment-records',{method:'POST',body:'private'})).status,405);});
test('temporary upload requires secret, allowlisted key, exact bytes and checksum',async()=>{
 assert.equal((await call('/__media_upload/'+asset.url,{method:'PUT',body:bytes})).status,404);
 const headers={Authorization:'Bearer test-only-key','Content-Length':String(bytes.length)};
 assert.equal((await call('/__media_upload/unknown',{method:'PUT',headers,body:bytes})).status,404);
 const bad=Buffer.from(bytes);bad[0]^=1;assert.equal((await call('/__media_upload/'+asset.url,{method:'PUT',headers,body:bad})).status,400);
 assert.equal((await call('/__media_upload/'+asset.url,{method:'PUT',headers,body:bytes})).status,200);
 const head=await call('/'+asset.url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('X-Content-SHA256'),hash);
 assert.equal(createHash('sha256').update(Buffer.from(await(await call('/'+asset.url)).arrayBuffer())).digest('hex'),hash);
});
