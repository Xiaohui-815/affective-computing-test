// One-time authenticated material upload. No credentials are written to disk or arguments.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
let raw='';if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stderr.write('Ready for media upload JSON on stdin (input is hidden).\n');}
const input=await new Promise((resolve,reject)=>{process.stdin.setEncoding('utf8');process.stdin.on('data',part=>{raw+=part;if(raw.includes('\u0003'))reject(new Error('Cancelled'));else if(/[\r\n]/.test(raw)){process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);resolve(JSON.parse(raw));}});});
const origin=new URL(input.url);if(origin.protocol!=='https:')throw new Error('HTTPS required');
const accessHeaders=input.sitesToken?{'OAI-Sites-Authorization':'Bearer '+input.sitesToken}:{};
const probe=await fetch(origin,{method:'HEAD',headers:accessHeaders,redirect:'error',signal:AbortSignal.timeout(20000)});
console.log('Hosting access check: HTTP '+probe.status);
if(!probe.ok)throw new Error('Hosting gateway rejected API access (HTTP '+probe.status+'). No material uploads attempted.');
const manifest=JSON.parse(await readFile('dist/media-manifest.json','utf8'));
const paths=manifest.flatMap(item=>item.type==='image'?[item.url]:item.chunks);let index=0,completed=0;const failures=[];
async function worker(){while(index<paths.length){const relative=paths[index++];const bytes=await readFile('dist/'+relative);const hash=createHash('sha256').update(bytes).digest('hex');let done=false;
 for(let attempt=0;attempt<4&&!done;attempt++)try{
  const existing=await fetch(new URL(relative,origin),{method:'HEAD',headers:accessHeaders,redirect:'error',signal:AbortSignal.timeout(45000)});
  if(existing.ok&&existing.headers.get('X-Content-SHA256')===hash){done=true;break;}
  const result=await fetch(new URL('__media_upload/'+relative,origin),{method:'PUT',headers:{...accessHeaders,Authorization:'Bearer '+input.key,'Content-Type':'application/octet-stream'},body:bytes,redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!result.ok||result.headers.get('X-Content-SHA256')!==hash)throw new Error('HTTP '+result.status);
  done=true;
 }catch(error){console.log('Upload retry: '+relative+' ('+error.message+')');if(/HTTP 40[13]/.test(error.message)){failures.push({relative,error:error.message});index=paths.length;break;}if(attempt===3)failures.push({relative,error:error.message});else await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
 if(done){completed++;if(completed%10===0||completed===paths.length)console.log('Media ready: '+completed+'/'+paths.length);}
}}
await Promise.all(Array.from({length:4},worker));
const result={total:paths.length,completed,failures};await writeFile('artifacts/media-upload.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failures.length)process.exitCode=1;
