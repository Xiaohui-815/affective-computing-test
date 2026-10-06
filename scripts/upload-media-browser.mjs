import { chromium } from 'file:///C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
let raw='';if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stderr.write('Ready for browser material upload JSON on stdin (input is hidden).\n');}
const input=await new Promise((resolve,reject)=>{process.stdin.setEncoding('utf8');process.stdin.on('data',part=>{raw+=part;if(raw.includes('\u0003'))reject(new Error('Cancelled'));else if(/[\r\n]/.test(raw)){process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);resolve(JSON.parse(raw));}});});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto(new URL('/__upload',input.url).href);await page.locator('#key').waitFor();
 let files=(await readdir('dist/media',{recursive:true,withFileTypes:true})).filter(x=>x.isFile()).map(x=>path.resolve(x.parentPath,x.name));
 const paths=files.map(x=>path.relative(path.resolve('dist'),x).replaceAll('\\','/'));
 const missing=await page.evaluate(async paths=>{let cursor=0;const missing=[];await Promise.all(Array.from({length:4},async()=>{while(cursor<paths.length){const i=cursor++;const r=await fetch('/'+paths[i],{method:'HEAD'});if(!r.ok)missing.push(i);}}));return missing;},paths);
 files=missing.map(i=>files[i]);console.log('Remaining objects: '+files.length);
 if(!files.length){console.log('All material already uploaded.');await browser.close();process.exit(0);}
 await page.locator('#key').fill(input.key);
 await page.locator('#files').evaluate(el=>el.removeAttribute('webkitdirectory'));
 await page.locator('#files').setInputFiles(files);
 await page.locator('#files').evaluate((el,paths)=>Array.from(el.files).forEach((file,i)=>Object.defineProperty(file,'webkitRelativePath',{value:paths[i]})),files.map(x=>path.relative(path.resolve('dist'),x).replaceAll('\\','/')));
 await page.locator('#upload').click();
 let previous='';const deadline=Date.now()+60*60*1000;
 while(Date.now()<deadline){const status=await page.locator('#status').textContent();if(status!==previous){console.log(status);previous=status;}if(status.startsWith('{')){const result=JSON.parse(status);await writeFile('artifacts/media-upload.json',JSON.stringify(result,null,2));if(result.failures.length)throw new Error('Some material uploads failed');break;}await page.waitForTimeout(3000);}
 if(!previous.startsWith('{'))throw new Error('Material upload timeout');
}finally{await browser.close();}
