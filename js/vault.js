import * as db from './db.js';
import { encryptBytes, decryptBytes, encryptJSON, decryptJSON, wrapForCode } from './crypto.js';
import { normalizeCode, isValidCode, pretty } from './calc.js';

const CHUNK = 4 * 1024 * 1024; // encrypt large files in 4 MB pieces
const $ = (id) => document.getElementById(id);

let masterKey = null;
let items = [];          // decrypted metadata, newest first
let filter = 'all';
let viewIndex = -1;
let viewUrl = null;
let busy = false;
let onLockCb = () => {};
export let suppressAutoLock = false;

const kindOf = (type) => (type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : 'other');
const visible = () => (filter === 'all' ? items : items.filter((it) => kindOf(it.type) === filter));

function iconFor(type, name) {
  if (type.startsWith('audio/')) return '🎵';
  if (type === 'application/pdf') return '📕';
  if (type.startsWith('text/')) return '📄';
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return '🗜';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('image/')) return '🖼';
  return '📁';
}

export function humanSize(n) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i && n < 10 ? 1 : 0)} ${u[i]}`;
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ---------------- open / lock ---------------- */

export async function open(key) {
  masterKey = key;
  $('calc').hidden = true;
  $('vault').hidden = false;
  await loadItems();
}

export function isOpen() {
  return masterKey !== null;
}

export function lock() {
  if (!masterKey) return;
  closeViewer();
  $('settings').hidden = true;
  for (const it of items) if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  items = [];
  masterKey = null;
  $('grid').innerHTML = '';
  $('vault').hidden = true;
  $('calc').hidden = false;
  onLockCb();
}

async function loadItems() {
  const records = await db.listFiles();
  records.sort((a, b) => b.created - a.created);
  const out = [];
  for (const r of records) {
    try {
      const meta = await decryptJSON(masterKey, r.meta);
      let thumbUrl = null;
      if (r.thumb) {
        const buf = await decryptBytes(masterKey, r.thumb);
        thumbUrl = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
      }
      out.push({ id: r.id, created: r.created, size: r.size, name: meta.name, type: meta.type, thumbUrl });
    } catch (e) {
      console.warn('Could not decrypt record', r.id, e);
    }
  }
  items = out;
  render();
}

/* ---------------- grid ---------------- */

function render() {
  const grid = $('grid');
  grid.innerHTML = '';
  const list = visible();
  $('empty').hidden = list.length > 0;
  list.forEach((it, idx) => {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.setAttribute('aria-label', it.name);
    if (it.thumbUrl) {
      const img = document.createElement('img');
      img.src = it.thumbUrl;
      img.alt = '';
      tile.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.innerHTML = `<div class="ic">${iconFor(it.type, it.name)}</div><div class="nm"></div>`;
      ph.querySelector('.nm').textContent = it.name;
      tile.appendChild(ph);
    }
    if (kindOf(it.type) === 'video') {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = '▶';
      tile.appendChild(b);
    }
    tile.addEventListener('click', () => openViewer(idx));
    grid.appendChild(tile);
  });
}

/* ---------------- import ---------------- */

async function makeThumb(file) {
  const draw = (src, w, h) => {
    const max = 320;
    const s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.75));
  };
  try {
    if (file.type.startsWith('image/')) {
      const bmp = await createImageBitmap(file);
      const blob = await draw(bmp, bmp.width, bmp.height);
      bmp.close?.();
      return blob;
    }
    if (file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      try {
        return await new Promise((resolve) => {
          const v = document.createElement('video');
          v.muted = true;
          v.playsInline = true;
          v.preload = 'auto';
          const timer = setTimeout(() => resolve(null), 6000);
          v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 0) / 3); };
          v.onseeked = async () => {
            clearTimeout(timer);
            resolve(v.videoWidth ? await draw(v, v.videoWidth, v.videoHeight) : null);
          };
          v.onerror = () => { clearTimeout(timer); resolve(null); };
          v.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch (e) {
    console.warn('thumbnail failed', e);
  }
  return null;
}

function setProgress(text, frac) {
  $('progress').hidden = frac === null;
  $('progress-text').textContent = text;
  $('progress-fill').style.width = `${Math.round((frac || 0) * 100)}%`;
}

async function importFiles(files) {
  if (!files.length || busy) return;
  busy = true;
  const total = files.reduce((s, f) => s + f.size, 0) || 1;
  let doneBytes = 0;
  let ok = 0;
  try {
    for (let n = 0; n < files.length; n++) {
      const file = files[n];
      const label = `Hiding ${n + 1} of ${files.length}: ${file.name}`;
      setProgress(label, doneBytes / total);
      const type = file.type || 'application/octet-stream';
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
      const chunks = [];
      for (let off = 0; off < file.size || (off === 0 && chunks.length === 0); off += CHUNK) {
        const buf = await file.slice(off, off + CHUNK).arrayBuffer();
        chunks.push(await encryptBytes(masterKey, buf));
        setProgress(label, (doneBytes + Math.min(off + CHUNK, file.size)) / total);
        if (file.size === 0) break;
      }
      const thumbBlob = await makeThumb(file);
      const thumb = thumbBlob ? await encryptBytes(masterKey, await thumbBlob.arrayBuffer()) : null;
      const meta = await encryptJSON(masterKey, { name: file.name, type, lastModified: file.lastModified });
      const created = Date.now();
      await db.addFile({ id, created, size: file.size, meta, thumb }, { id, chunks });
      items.unshift({ id, created, size: file.size, name: file.name, type,
        thumbUrl: thumbBlob ? URL.createObjectURL(thumbBlob) : null });
      doneBytes += file.size;
      ok++;
      render();
    }
    toast(`${ok} file${ok === 1 ? '' : 's'} hidden. Now delete the originals from your gallery.`, 4500);
  } catch (e) {
    console.error(e);
    toast(e && e.name === 'QuotaExceededError'
      ? 'Not enough storage space on this device.'
      : `Could not add file: ${e.message || e}`, 4500);
  } finally {
    setProgress('', null);
    busy = false;
  }
}

/* ---------------- viewer ---------------- */

async function loadFileBlob(it) {
  const rec = await db.getBlob(it.id);
  const parts = [];
  for (const c of rec.chunks) parts.push(await decryptBytes(masterKey, c));
  return new Blob(parts, { type: it.type });
}

async function openViewer(idx) {
  const list = visible();
  if (idx < 0 || idx >= list.length) return;
  viewIndex = idx;
  const it = list[idx];
  $('viewer').hidden = false;
  $('v-name').textContent = it.name;
  $('v-prev').hidden = idx === 0;
  $('v-next').hidden = idx === list.length - 1;
  const body = $('v-body');
  body.innerHTML = '<div class="nopreview">Decrypting…</div>';
  if (viewUrl) { URL.revokeObjectURL(viewUrl); viewUrl = null; }

  let blob;
  try {
    blob = await loadFileBlob(it);
  } catch (e) {
    body.innerHTML = '<div class="nopreview">Could not decrypt this file.</div>';
    return;
  }
  if (viewIndex !== idx || $('viewer').hidden) return; // user moved on
  viewUrl = URL.createObjectURL(blob);
  body.innerHTML = '';
  let el;
  if (it.type.startsWith('image/')) {
    el = document.createElement('img');
    el.alt = it.name;
  } else if (it.type.startsWith('video/')) {
    el = document.createElement('video');
    el.controls = true;
    el.playsInline = true;
    el.autoplay = true;
  } else if (it.type.startsWith('audio/')) {
    el = document.createElement('audio');
    el.controls = true;
  } else if (it.type === 'application/pdf' || it.type.startsWith('text/')) {
    el = document.createElement('iframe');
    el.title = it.name;
  }
  if (el) {
    el.src = viewUrl;
    body.appendChild(el);
  } else {
    const d = document.createElement('div');
    d.className = 'nopreview';
    d.innerHTML = `<div class="ic">${iconFor(it.type, it.name)}</div><p></p>
      <p class="muted">No preview for this file type.<br>Tap ⬇ to save a copy and open it in another app.</p>`;
    d.querySelector('p').textContent = `${it.name} · ${humanSize(it.size)}`;
    body.appendChild(d);
  }
}

function closeViewer() {
  $('viewer').hidden = true;
  $('v-body').innerHTML = '';
  if (viewUrl) { URL.revokeObjectURL(viewUrl); viewUrl = null; }
  viewIndex = -1;
}

async function exportCurrent() {
  const it = visible()[viewIndex];
  if (!it) return;
  const blob = await loadFileBlob(it);
  const file = new File([blob], it.name, { type: it.type });
  suppressAutoLock = true;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = it.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast('Export failed.');
  } finally {
    setTimeout(() => { suppressAutoLock = false; }, 1500);
  }
}

async function deleteCurrent() {
  const list = visible();
  const it = list[viewIndex];
  if (!it) return;
  if (!confirm(`Delete "${it.name}" from the vault permanently?`)) return;
  await db.deleteFile(it.id);
  if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  items = items.filter((x) => x.id !== it.id);
  const next = Math.min(viewIndex, visible().length - 1);
  render();
  if (next >= 0) openViewer(next); else closeViewer();
  toast('Deleted.');
}

/* ---------------- settings ---------------- */

function openSettings() {
  $('s-count').textContent = String(items.length);
  $('s-size').textContent = humanSize(items.reduce((s, it) => s + it.size, 0));
  $('s-new').value = '';
  $('s-new2').value = '';
  $('s-msg').textContent = '';
  $('settings').hidden = false;
}

async function changeCode() {
  const a = normalizeCode($('s-new').value);
  const b = normalizeCode($('s-new2').value);
  const msg = $('s-msg');
  msg.className = 'msg err';
  if (!isValidCode(a)) { msg.textContent = 'Use a calculation with a sign, like 123+123.'; return; }
  if (a !== b) { msg.textContent = 'The two codes do not match.'; return; }
  msg.className = 'msg';
  msg.textContent = 'Saving…';
  await db.putConfig(await wrapForCode(masterKey, a));
  msg.className = 'msg ok';
  msg.textContent = `Saved. Your new code is ${pretty(a)} =`;
}

/* ---------------- wiring ---------------- */

export function init({ onLock }) {
  onLockCb = onLock;
  const input = $('file-input');

  $('btn-add').addEventListener('click', () => {
    suppressAutoLock = true; // opening the system picker hides the page on phones
    input.value = '';
    input.click();
  });
  input.addEventListener('change', () => {
    suppressAutoLock = false;
    importFiles([...input.files]);
  });
  input.addEventListener('cancel', () => { suppressAutoLock = false; });
  window.addEventListener('focus', () => setTimeout(() => {
    if (!busy) suppressAutoLock = false;
  }, 1000));

  $('btn-lock').addEventListener('click', lock);
  $('btn-settings').addEventListener('click', openSettings);
  $('s-close').addEventListener('click', () => { $('settings').hidden = true; });
  $('s-save').addEventListener('click', changeCode);

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    filter = b.dataset.f;
    for (const x of $('tabs').children) x.classList.toggle('active', x === b);
    render();
  });

  $('v-close').addEventListener('click', closeViewer);
  $('v-prev').addEventListener('click', () => openViewer(viewIndex - 1));
  $('v-next').addEventListener('click', () => openViewer(viewIndex + 1));
  $('v-export').addEventListener('click', exportCurrent);
  $('v-delete').addEventListener('click', deleteCurrent);

  // swipe between items in the viewer
  let sx = null;
  $('v-body').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  $('v-body').addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) > 60) openViewer(viewIndex + (dx < 0 ? 1 : -1));
  });

  document.addEventListener('keydown', (e) => {
    if ($('viewer').hidden) return;
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowLeft') openViewer(viewIndex - 1);
    if (e.key === 'ArrowRight') openViewer(viewIndex + 1);
  });

  // Auto-lock whenever the app goes to the background (unless we're in the file picker).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !suppressAutoLock && !busy) lock();
  });
}
