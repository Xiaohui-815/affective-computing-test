import { readdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
const folder=path.resolve('.sites-runtime/pydeps/imageio_ffmpeg/binaries');
const binary=process.env.FFMPEG_PATH||path.join(folder,(await readdir(folder)).find(n=>/^ffmpeg.*\.exe$/.test(n)));
const run=args=>{const r=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024});if(r.error)throw r.error;return r;};
const inspect=file=>{const r=run(['-hide_banner','-i',file]);const video=r.stderr.split('\n').find(s=>s.includes('Video:'));const audio=r.stderr.split('\n').find(s=>s.includes('Audio:'));const duration=r.stderr.match(/Duration: ([\d:.]+)/)?.[1];const dimensions=video?.match(/\b\d{3,5}x\d{3,5}\b/)?.[0];assert.ok(video&&audio&&duration&&dimensions);return {video:video.trim(),audio:audio.trim(),duration,dimensions};};
const audioHash=file=>{const r=run(['-v','error','-i',file,'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-']);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const results=[];
for(const filename of (await readdir('photos')).filter(n=>n.endsWith('.mp4'))){
  const original=path.resolve('photos',filename),playback=path.resolve('.sites-runtime/compatible-sdr',filename);
  const source=inspect(original),converted=inspect(playback);
  assert.equal(converted.dimensions,source.dimensions);assert.match(converted.video,/h264/);assert.match(converted.video,/bt709/);
  assert.equal(audioHash(original),audioHash(playback),'Audio bitstream changed');
  results.push({filename,source,playback:converted,audioBitstreamIdentical:true});
}
await writeFile('artifacts/media-integrity.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
