import { chromium } from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const url=process.env.STUDY_BASE_URL;
if(!url)throw new Error('STUDY_BASE_URL required');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.goto(url);await page.locator('#start-form button:not([disabled])').waitFor();
 const result=await page.evaluate(async()=>{
  const manifest=await(await fetch('/media-manifest.json')).json();
  const paths=manifest.flatMap(x=>x.type==='image'?[x.url]:x.chunks);let cursor=0;const failures=[];
  await Promise.all(Array.from({length:4},async()=>{while(cursor<paths.length){const path=paths[cursor++];const r=await fetch('/'+path,{method:'HEAD'});if(!r.ok||!r.headers.get('X-Content-SHA256'))failures.push({path,status:r.status});}}));
  const chunk=manifest.find(x=>x.type==='video').chunks[0];const range=await fetch('/'+chunk,{headers:{Range:'bytes=10-29'}});
  return {objects:paths.length,failures,range:{status:range.status,length:(await range.arrayBuffer()).byteLength,contentRange:range.headers.get('Content-Range')},uploadPage:(await fetch('/__upload')).status,uploadWrite:(await fetch('/__media_upload/'+chunk,{method:'PUT',body:'test'})).status};
 });
 assert.equal(result.objects,174);assert.deepEqual(result.failures,[]);assert.equal(result.range.status,206);assert.equal(result.range.length,20);assert.equal(result.uploadPage,404);assert.equal(result.uploadWrite,404);
 console.log(JSON.stringify(result,null,2));await writeFile('artifacts/online-results.json',JSON.stringify(result,null,2));
}finally{await browser.close();}
