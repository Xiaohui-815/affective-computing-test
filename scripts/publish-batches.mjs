// Transport recovery for hosts with a per-request Git HTTP size limit.
// Uses the official Sites workflow for every source push and final archive.
// The original checkout/history remains untouched. Credentials exist only in stdin/memory.
import { readdir, mkdir, copyFile, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root=process.cwd();
if(process.platform==='win32'){
  process.env.TAR_OPTIONS='--force-local';
  process.env.PATH='D:/Visual Studio Code/Git/bin;D:/Visual Studio Code/Git/usr/bin;'+process.env.PATH;
}
const mirror=path.join(root,'.sites-runtime/publish-source');
const statePath=path.join(root,'.sites-runtime/publish-state.json');
const helper='C:/Users/Lenovo/.codex/plugins/cache/openai-curated-remote/sites/0.1.75/scripts/site-workflow.mjs';
const hosting=JSON.parse(await readFile('.openai/hosting.json','utf8'));
let raw='';
if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stderr.write('Ready for batch publish credential JSON on stdin (input is hidden).\n');}
const input=await new Promise((resolve,reject)=>{process.stdin.setEncoding('utf8');process.stdin.on('data',part=>{raw+=part;if(raw.includes('\u0003'))reject(new Error('Cancelled'));else if(/[\r\n]/.test(raw)){process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);resolve(JSON.parse(raw));}});});
const credential=input.credential;
const list=async(dir,relative='')=>{const result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const rel=path.join(relative,entry.name);if(entry.isDirectory())result.push(...await list(path.join(dir,entry.name),rel));else if(entry.isFile())result.push(rel);}return result;};
const copy=async relative=>{const target=path.join(mirror,relative);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,relative),target);};
let state;
try{state=JSON.parse(await readFile(statePath,'utf8'));}catch{
  await mkdir(mirror,{recursive:true});
  for(const name of ['.gitignore','package.json','README.md','VALIDATION.md'])await copy(name);
  for(const dir of ['scripts','tests'])for(const relative of await list(path.join(root,dir)))await copy(path.join(dir,relative));
  for(const relative of await list(path.join(root,'dist')))if(!relative.startsWith('media'+path.sep))await copy(path.join('dist',relative));
  await mkdir(path.join(mirror,'.openai'),{recursive:true});await mkdir(path.join(mirror,'build'),{recursive:true});
  await copyFile(path.join(root,'dist/index.html'),path.join(mirror,'build/index.html'));
  state={source:null,next:0,files:(await list(path.join(root,'dist/media'))).map(p=>path.join('dist/media',p)).sort()};
}
let batch=0;
await copy('scripts/publish-batches.mjs');
await copy('README.md');
while(state.next<state.files.length && batch<(input.maxBatches||6)){
  let bytes=0;const begin=state.next;
  while(state.next<state.files.length){const file=state.files[state.next];const size=(await stat(path.join(root,file))).size;if(bytes&&bytes+size>44*1024*1024)break;await copy(file);bytes+=size;state.next++;}
  const final=state.next===state.files.length;
  await writeFile(path.join(mirror,'.openai/hosting.json'),JSON.stringify({...hosting,static:{directory:final?'dist':'build'}},null,2));
  if(final){const build=path.resolve(mirror,'build');if(!build.startsWith(path.resolve(root,'.sites-runtime')+path.sep))throw new Error('Unsafe staging path');await rm(build,{recursive:true,force:true});}
  console.log(`Uploading files ${begin+1}-${state.next}/${state.files.length} (${Math.round(bytes/1024/1024)} MiB)`);
  const archivePath=path.join(root,'.sites-runtime',final?'site.tar.gz':'batch.tar.gz');
  const data={credential,...(state.source?{source:state.source}:{}),commands:[],archivePath};
  const execute=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[helper,'--project-id',hosting.project_id],{cwd:mirror,env:process.env,stdio:['pipe','pipe','pipe'],windowsHide:true});let stdout='',stderr='';
    child.stdout.on('data',d=>{stdout+=d;});child.stderr.on('data',d=>{stderr+=d;});child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));child.stdin.end(JSON.stringify(data)+'\n');
  });
  let outcome=await execute();
  for(let attempt=1;outcome.code!==0&&attempt<=2&&/service_unavailable|Connection was reset|HTTP 50[234]|Operation too slow|timed out/.test(outcome.stderr);attempt++){
    console.log(`Transient upload failure; retrying batch (${attempt}/2).`);
    await new Promise(resolve=>setTimeout(resolve,attempt*5000));outcome=await execute();
  }
  if(outcome.code!==0){state.next=begin;await writeFile(statePath,JSON.stringify(state,null,2));throw new Error(outcome.stderr.split(credential.token).join('[redacted]')+outcome.stdout.split(credential.token).join('[redacted]'));}
  const json=outcome.stdout.trim().split('\n').findLast(line=>line.startsWith('{"project_id"'));if(!json)throw new Error('Missing workflow result');
  state.source=JSON.parse(json);await writeFile(statePath,JSON.stringify(state,null,2));batch++;
  console.log(`Batch succeeded (${state.next}/${state.files.length}).`);
}
console.log(JSON.stringify({complete:state.next===state.files.length,...state.source,next:state.next,total:state.files.length}));
