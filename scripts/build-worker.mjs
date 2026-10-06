import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const source=process.argv.includes('--local')?'dist':'frontend';
const output=process.argv.includes('--local')?'.sites-runtime/worker-dist':'dist';
const allowUpload=process.argv.includes('--allow-upload');
const uploadPage=allowUpload?await readFile('scripts/media-upload.html','utf8'):null;
const manifest=JSON.parse(await readFile(path.join(source,'media-manifest.json'),'utf8'));
const textFiles={};
for(const filename of ['index.html','app.js','core.js','styles.css','sw.js','media-manifest.json'])textFiles['/'+filename]=await readFile(path.join(source,filename),'utf8');
const assets={};
for(const item of manifest)for(const relative of item.type==='image'?[item.url]:item.chunks){const bytes=await readFile(path.join(source,relative));const hash=createHash('sha256').update(bytes).digest('hex');assets['/'+relative]={key:'sha256/'+hash,size:bytes.length,sha256:hash,type:relative.endsWith('.bin')?'application/octet-stream':'image/jpeg'};}
const code=`// Static website and immutable media delivery only. No experiment-data endpoints.
const pages=${JSON.stringify(textFiles)};
const assets=${JSON.stringify(assets)};
const uploadsEnabled=${allowUpload};
const uploadPage=${JSON.stringify(uploadPage)};
export default {
 async fetch(request,env) {
  const url=new URL(request.url);let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Invalid path',{status:400});}
  if(pathname==='/__upload'&&uploadsEnabled&&request.method==='GET')return new Response(uploadPage,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  if(pathname.startsWith('/__media_upload/')){
   if(!uploadsEnabled || !env.MEDIA_UPLOAD_KEY || request.headers.get('Authorization')!=='Bearer '+env.MEDIA_UPLOAD_KEY)return new Response('Not found',{status:404});
   const asset=assets['/'+pathname.slice('/__media_upload/'.length)];if(!asset)return new Response('Unknown asset',{status:404});
   if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
   if(Number(request.headers.get('Content-Length'))!==asset.size)return new Response('Invalid size',{status:400});
   const bytes=await request.arrayBuffer();if(bytes.byteLength!==asset.size)return new Response('Invalid size',{status:400});
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(hash!==asset.sha256)return new Response('Checksum mismatch',{status:400});
   await env.BUCKET.put(asset.key,bytes,{httpMetadata:{contentType:asset.type},customMetadata:{sha256:hash}});
   return new Response('Stored',{headers:{'X-Content-SHA256':hash}});
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const page=pages[pathname==='/'?'/index.html':pathname];
  if(page!==undefined){const type=pathname.endsWith('.js')?'text/javascript; charset=utf-8':pathname.endsWith('.css')?'text/css; charset=utf-8':pathname.endsWith('.json')?'application/json':'text/html; charset=utf-8';return new Response(request.method==='HEAD'?null:page,{headers:{'Content-Type':type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});}
  const asset=assets[pathname];if(!asset)return new Response('Not found',{status:404});
  try{
   const object=request.method==='HEAD'?await env.BUCKET.head(asset.key):await env.BUCKET.get(asset.key,{range:request.headers});
   if(!object)return new Response('Media not ready',{status:404,headers:{'Cache-Control':'no-store'}});
   const headers=new Headers({'Content-Type':asset.type,'Accept-Ranges':'bytes','X-Content-SHA256':asset.sha256,'ETag':object.httpEtag,'Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff'});
   let status=200;
   if(object.range){const start=object.range.offset??Math.max(0,object.size-object.range.suffix);const length=object.range.length??object.size-start;headers.set('Content-Range','bytes '+start+'-'+(start+length-1)+'/'+object.size);headers.set('Content-Length',String(length));status=206;}
   else headers.set('Content-Length',String(object.size));
   return new Response(request.method==='HEAD'?null:object.body,{status,headers});
  }catch{return new Response('Media temporarily unavailable',{status:503});}
 }
};
`;
await mkdir(path.join(output,'server'),{recursive:true});await writeFile(path.join(output,'server/index.js'),code);
console.log(`Built ${Buffer.byteLength(code)} byte static-delivery Worker; ${Object.keys(assets).length} R2 objects; uploads ${allowUpload?'enabled with secret':'disabled'}.`);
