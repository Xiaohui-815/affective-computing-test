export const SCHEMA_VERSION = '1.0.0';
export function sampleTrials(manifest, random = Math.random) {
  const draw = (type, count) => {
    const pool = manifest.filter(m => m.type === type);
    if (pool.length < count) throw new Error('素材不足：至少需要 3 张图片和 2 个视频。');
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, count).map(m => ({ ...m, totalMs: 0, visibleMs: 0, playingMs: 0, loadMs: 0, bufferingMs: 0, position: 0, ended: false, status: 'pending', firstShownAt: null }));
  };
  return [...draw('image', 3), ...draw('video', 2)];
}
export function csv(rows) {
  const cell = value => {
    let s = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Prevent spreadsheet formula execution from participant identifiers or filenames.
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
export function safeName(value) { return String(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 60) || 'participant'; }
export function parseRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) { const suffix = Number(match[2]); if (suffix <= 0) return null; start = Math.max(0, size - suffix); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start < 0 || end < start) return null;
  return { start, end, partial: true };
}
