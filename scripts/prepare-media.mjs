import { readdir, mkdir, open, writeFile, copyFile, readFile, access, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const source = path.resolve('photos');
const output = path.resolve('dist/media');
await mkdir(output, { recursive: true });
const manifest = [];
for (const filename of (await readdir(source)).sort()) {
  const ext = path.extname(filename).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext)) continue;
  const originalPath = path.join(source, filename);
  const compatiblePath = path.resolve('.sites-runtime/compatible-sdr', filename);
  const compatible = ext === '.mp4' && await access(compatiblePath).then(()=>true,()=>false);
  const file = await open(compatible ? compatiblePath : originalPath, 'r');
  try {
    const { size } = await file.stat();
    const hash = createHash('sha256');
    const chunkSize = 4 * 1024 * 1024;
    const isVideo = ext === '.mp4';
    const id = (isVideo ? 'video-' : 'image-') + path.parse(filename).name;
    const chunks = [];
    const folder = id;
    if (isVideo) await mkdir(path.join(output, folder), { recursive: true });
    let offset = 0, index = 0;
    while (offset < size) {
      const buffer = Buffer.alloc(Math.min(chunkSize, size - offset));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
      if (bytesRead !== buffer.length) throw new Error('Unexpected end of file: ' + filename);
      hash.update(buffer);
      if (isVideo) { const rel = `media/${folder}/${String(index).padStart(3, '0')}.bin`; await writeFile(path.resolve('dist', rel), buffer); chunks.push(rel); }
      offset += bytesRead; index++;
    }
    if (!isVideo) await copyFile(path.join(source, filename), path.join(output, filename));
    if (isVideo) for (const stale of await readdir(path.join(output, folder))) {
      if (/^\d+\.bin$/.test(stale) && !chunks.includes(`media/${folder}/${stale}`)) await unlink(path.join(output, folder, stale));
    }
    const sha256 = hash.digest('hex');
    const sourceSha256 = compatible ? createHash('sha256').update(await readFile(originalPath)).digest('hex') : sha256;
    manifest.push({ id, type: isVideo ? 'video' : 'image', filename, url: isVideo ? `stream/${id}-${sha256.slice(0,12)}.mp4` : `media/${filename}`, size, sha256, sourceSha256, playbackVersion: compatible ? 'h264-crf18-sdr-bt709-v1' : 'original', ...(compatible ? { processing: 'HEVC Main10 HLG BT.2020 to H.264 CRF18 SDR BT.709; Mobius tone mapping; original dimensions and timestamps; AAC stream copy' } : {}), ...(isVideo ? { chunkSize, chunks } : {}) });
  } finally { await file.close(); }
}
await writeFile('dist/media-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
const worker = (await readFile('dist/sw.js','utf8')).replace(/\n\/\/ Manifest revision:.*\n?$/, '');
await writeFile('dist/sw.js',worker+'\n// Manifest revision: '+createHash('sha256').update(JSON.stringify(manifest)).digest('hex')+'\n');
console.log(`Prepared ${manifest.filter(m=>m.type==='image').length} images and ${manifest.filter(m=>m.type==='video').length} lossless chunked videos.`);
