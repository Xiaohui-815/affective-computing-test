import { readdir, mkdir, stat, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
const folder=path.resolve('.sites-runtime/pydeps/imageio_ffmpeg/binaries');
const binary=process.env.FFMPEG_PATH || path.join(folder,(await readdir(folder)).find(x=>/^ffmpeg.*\.exe$/.test(x)));
await mkdir('.sites-runtime/compatible-sdr',{recursive:true});
for(const filename of (await readdir('photos')).filter(n=>n.toLowerCase().endsWith('.mp4')).sort()){
  const destination=path.resolve('.sites-runtime/compatible-sdr',filename);
  if(await stat(destination).then(s=>s.size>1000,()=>false)){console.log('Already prepared: '+filename);continue;}
  console.log('Converting: '+filename);
  const temporary=destination+'.pending.mp4';
  const toneMap='zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';
  const args=['-hide_banner','-loglevel','warning','-stats','-nostdin','-i',path.resolve('photos',filename),'-map','0:v:0','-map','0:a?','-vf',toneMap,'-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-fps_mode','passthrough','-enc_time_base:v','demux','-video_track_timescale','90000','-c:a','copy','-movflags','+faststart','-y',temporary];
  const code=await new Promise((resolve,reject)=>{const child=spawn(binary,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let lastLog=0;child.stderr.on('data',data=>{const line=data.toString();if(!line.startsWith('frame=')||Date.now()-lastLog>15000){process.stdout.write(line);lastLog=Date.now();}});child.on('error',reject);child.on('exit',resolve);});
  if(code!==0)throw new Error('Transcode failed: '+filename);
  await rename(temporary,destination);
}
