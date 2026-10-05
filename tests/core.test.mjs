import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sampleTrials, csv, safeName, parseRange } from '../dist/core.js';
const manifest = JSON.parse(await readFile(new URL('../dist/media-manifest.json', import.meta.url)));
test('1000 sessions preserve 3 images followed by 2 unique videos', () => {
  const orders=new Set();
  for(let i=0;i<1000;i++) { const trials=sampleTrials(manifest); assert.deepEqual(trials.map(t=>t.type),['image','image','image','video','video']); assert.equal(new Set(trials.map(t=>t.id)).size,5); orders.add(trials.map(t=>t.id).join(',')); }
  assert.ok(orders.size>100); assert.throws(()=>sampleTrials([]));
});
test('CSV handles Chinese, embedded quotes, newlines and spreadsheet injection',()=>{
  assert.equal(csv([['编号','a"b','x\ny','=1+2']]),'\uFEFF"编号","a""b","x\ny","\'=1+2"');
  assert.equal(safeName('P/01:*'), 'P_01__');
});
test('range parsing handles open ends, suffixes and invalid ranges',()=>{
  assert.deepEqual(parseRange('bytes=10-20',100),{start:10,end:20,partial:true});
  assert.deepEqual(parseRange('bytes=90-',100),{start:90,end:99,partial:true});
  assert.deepEqual(parseRange('bytes=-10',100),{start:90,end:99,partial:true});
  assert.deepEqual(parseRange('bytes=0-999',100),{start:0,end:99,partial:true});
  for(const value of ['bytes=100-','bytes=10-5','bytes=-0','bytes=-','bytes=1-2,4-5','bad'])assert.equal(parseRange(value,100),null);
});
test('every playback video reconstructs byte-for-byte; source hashes match untouched originals',async()=>{
  for(const asset of manifest.filter(m=>m.type==='video')){
    const hash=createHash('sha256');let size=0;
    for(const rel of asset.chunks){const chunk=await readFile(new URL('../dist/'+rel,import.meta.url));assert.ok(chunk.length<=4*1024*1024);hash.update(chunk);size+=chunk.length;}
    assert.equal(size,asset.size);assert.equal(hash.digest('hex'),asset.sha256);
    const original=await readFile(new URL('../photos/'+asset.filename,import.meta.url));assert.equal(createHash('sha256').update(original).digest('hex'),asset.sourceSha256);
  }
});
