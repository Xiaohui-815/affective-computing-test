import { chromium } from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
const watchdog=setTimeout(()=>{console.error('Control test exceeded 3 minutes');browser.close().finally(()=>process.exit(1));},180000);
try {
 const page=await browser.newPage();await page.goto(process.env.STUDY_BASE_URL||'http://localhost:4173');await page.locator('#start-form button:not([disabled])').waitFor();await page.locator('#participant').fill('controls');await page.locator('#start-form button').click();
 for(let i=0;i<3;i++){await page.waitForFunction(()=>!document.querySelector('#next').disabled);await page.locator('#next').click();}
 await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2,{},{timeout:90000});
 console.log('Video ready');
 await page.locator('video').evaluate(v=>{v.requestFullscreen();});await page.waitForFunction(()=>!!document.fullscreenElement);await page.evaluate(()=>{document.exitFullscreen();});
 await page.locator('video').evaluate(v=>{v.currentTime=v.duration-.3;return v.play();});await page.waitForFunction(()=>document.querySelector('video').ended,{},{timeout:90000});
 await page.keyboard.press('ArrowRight');
 const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('perception-study-session-v1')));
 assert.ok(session.events.some(x=>x.type==='fullscreen_change'&&x.details.enabled));assert.ok(session.events.some(x=>x.type==='fullscreen_change'&&!x.details.enabled));assert.ok(session.events.some(x=>x.type==='video_ended'));assert.ok(session.events.some(x=>x.type==='keydown'));
 console.log('PASS: actual fullscreen enter/exit, video ended, keyboard events');
}finally{clearTimeout(watchdog);await browser.close();}
