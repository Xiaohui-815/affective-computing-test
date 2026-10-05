import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const baseUrl = process.env.STUDY_BASE_URL || 'http://localhost:4173';
const browser = await chromium.launch({channel:'msedge',headless:true});
const output = new URL('../artifacts/', import.meta.url);await mkdir(output,{recursive:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const getSession=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('perception-study-session-v1')));
const next=async()=>{await page.locator('#next').waitFor();await page.waitForFunction(()=>!document.querySelector('#next').disabled);await page.locator('#next').click();};
const results=[];
try {
  await page.goto(baseUrl);await page.locator('#start-form button:not([disabled])').waitFor();
  await page.screenshot({path:fileURLToPath(new URL('welcome.png',output)),fullPage:true});
  await page.locator('#participant').fill('测试 P001');await page.locator('#start-form button').click();
  await page.waitForFunction(()=>document.querySelector('#viewer img')?.complete);await page.waitForTimeout(800);
  const first=await getSession();assert.equal(first.trials.length,5);
  await page.reload();await page.locator('#resume').waitFor();await page.locator('#resume').click();
  await page.waitForFunction(()=>document.querySelector('#viewer img')?.complete);
  const restored=await getSession();assert.deepEqual(restored.trials.map(x=>x.id),first.trials.map(x=>x.id));assert.ok(restored.events.some(e=>e.type==='session_recovered'));results.push('reload restores same session and order');
  await next();await next();await next();
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2 && document.querySelector('video').videoWidth>0,{},{timeout:60000});
  await page.screenshot({path:fileURLToPath(new URL('video.png',output)),fullPage:true});
  await page.locator('video').evaluate(v=>v.play());await page.waitForTimeout(2200);
  await page.locator('video').evaluate(v=>{v.pause();v.currentTime=Math.min(5,v.duration/2);v.volume=.5;v.playbackRate=1.25;});await page.waitForTimeout(800);
  await page.reload();await page.locator('#resume').click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,{},{timeout:60000});
  assert.ok(await page.locator('video').evaluate(v=>v.paused&&v.currentTime>=4.5));results.push('video play/pause/seek/volume/rate and paused recovery');
  await next();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,{},{timeout:60000});await next();
  const finished=await getSession();assert.equal(finished.status,'completed');assert.ok(finished.trials[3].playingMs>=1500);assert.ok(finished.events.some(e=>e.type==='video_seeking'));assert.ok(finished.events.some(e=>e.type==='video_volumechange'));
  assert.deepEqual(finished.events.map(e=>e.sequence),finished.events.map((_,i)=>i+1));
  for(const kind of ['json','events','summary']) {const downloading=page.waitForEvent('download');await page.locator(`[data-export="${kind}"]`).click();const dl=await downloading;await dl.saveAs(fileURLToPath(new URL('export-'+kind+(kind==='json'?'.json':'.csv'),output)));}
  const exported=JSON.parse(await readFile(new URL('export-json.json',output)));assert.ok(exported.events.some(e=>e.type==='download_requested'));results.push('full session, sequential events and three downloadable exports');
  await page.screenshot({path:fileURLToPath(new URL('finish.png',output)),fullPage:true});
  // Verify exact byte range across a chunk boundary through the actual browser Service Worker.
  const range=await page.evaluate(async()=>{const assets=await(await fetch('/media-manifest.json')).json();const v=assets.find(x=>x.type==='video');const response=await fetch('/'+v.url,{headers:{Range:`bytes=${v.chunkSize-10}-${v.chunkSize+9}`}});return{status:response.status,length:(await response.arrayBuffer()).byteLength,range:response.headers.get('Content-Range')};});assert.equal(range.status,206);assert.equal(range.length,20);results.push('browser Service Worker byte range crosses chunk boundaries');
  // Decode and seek every original video using the same public code path.
  const videos=await page.evaluate(async()=>{const assets=await(await fetch('/media-manifest.json')).json();return assets.filter(x=>x.type==='video').map(x=>({id:x.id,url:x.url}));});
  for(const video of videos){const metadata=await page.evaluate(async asset=>{const v=document.createElement('video');v.preload='auto';document.body.append(v);return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{v.remove();reject(new Error('Video timeout '+asset.id));},45000);v.onerror=()=>{clearTimeout(timer);reject(new Error('Video error '+asset.id+' '+v.error?.message));};v.onloadeddata=()=>{v.onloadeddata=null;v.currentTime=v.duration*.5;v.onseeked=()=>{const info={id:asset.id,duration:v.duration,width:v.videoWidth,height:v.videoHeight,position:v.currentTime};clearTimeout(timer);v.removeAttribute('src');v.load();v.remove();resolve(info);};};v.src=asset.url;});},video);assert.ok(metadata.width>0 && metadata.height>0, 'Video must decode actual picture, not audio only');results.push(metadata);}
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});const mp=await mobile.newPage();await mp.goto(baseUrl);await mp.locator('#start-form button:not([disabled])').waitFor();assert.ok(await mp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mp.screenshot({path:fileURLToPath(new URL('mobile.png',output)),fullPage:true});await mobile.close();results.push('mobile viewport without horizontal overflow');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:results},null,2));await writeFile(new URL('browser-results.json',output),JSON.stringify({passed:results},null,2));
}finally{await browser.close();}



