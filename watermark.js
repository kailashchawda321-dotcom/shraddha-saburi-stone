'use strict';
/* ═══════════════════════════════════════════════════════════════
   AUTOMATIC WATERMARK SYSTEM — Shraddha Saburi Stone
   ───────────────────────────────────────────────────────────────
   • Watches public/images/** for new or changed image files
   • Composites a diagonal repeating gold watermark using sharp
   • Tracks processed files (in-memory + debounced disk write)
   • Startup scan runs sequentially to avoid registry race
═══════════════════════════════════════════════════════════════ */
const sharp    = require('sharp');
const chokidar = require('chokidar');
const path     = require('path');
const fs       = require('fs');

const WM_LINE1 = 'SHRADDHA SABURI STONE';
const WM_LINE2 = '7023912171  9414149121';
const IMG_BASE = path.join(__dirname, 'public', 'images');
const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const REGISTRY = path.join(__dirname, '.wm-registry.json');

/* ── Registry key: relative path, forward-slash (cross-platform) ── */
function regKey(filePath) {
    return path.relative(__dirname, filePath).replace(/\\/g, '/');
}

/* ── In-memory registry (single source of truth) ──────────────── */
let _reg = {};
try {
    const raw = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    let migrated = false;
    for (const [k, v] of Object.entries(raw)) {
        /* Migrate absolute-path keys to relative-path keys (cross-platform) */
        const isAbsolute = path.isAbsolute(k);
        const rel = isAbsolute
            ? path.relative(__dirname, k).replace(/\\/g, '/')
            : k.replace(/\\/g, '/');
        _reg[rel] = v;
        if (isAbsolute) migrated = true;
    }
    /* Persist migrated keys immediately */
    if (migrated) {
        try { fs.writeFileSync(REGISTRY, JSON.stringify(_reg, null, 2)); } catch { /* non-fatal */ }
    }
} catch { _reg = {}; }

let _saveTimer = null;
function scheduleRegistrySave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        try { fs.writeFileSync(REGISTRY, JSON.stringify(_reg, null, 2)); }
        catch { /* non-fatal */ }
    }, 800);
}

/* ── Fingerprint: size + mtime (fast, no full hash needed) ────── */
function fp(filePath) {
    try { const s = fs.statSync(filePath); return `${s.size}:${Math.round(s.mtimeMs)}`; }
    catch { return null; }
}

/* ── Watermark SVG ────────────────────────────────────────────── */
function buildWatermarkSvg(width, height) {
    const stepX = 300, stepY = 140;
    const items = [];
    for (let y = -stepY; y < height + stepY * 2; y += stepY) {
        for (let x = -stepX; x < width + stepX * 2; x += stepX) {
            const cx = x + stepX / 2, cy = y + stepY / 2;
            items.push(
                `<g transform="rotate(-35,${cx},${cy})">` +
                `<text x="${x}" y="${y + 58}" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" fill="#D9B062" opacity="0.10" letter-spacing="3">${WM_LINE1}</text>` +
                `<text x="${x + 18}" y="${y + 76}" font-family="Arial,Helvetica,sans-serif" font-size="10" font-weight="400" fill="#D9B062" opacity="0.08" letter-spacing="1">${WM_LINE2}</text>` +
                `</g>`
            );
        }
    }
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${items.join('')}</svg>`
    );
}

/* ── Core: watermark one file ─────────────────────────────────── */
async function processImage(filePath) {
    if (!IMG_EXTS.has(path.extname(filePath).toLowerCase())) return;
    if (filePath.endsWith('.wm.tmp')) return;

    const current = fp(filePath);
    if (!current) return;
    if (_reg[regKey(filePath)] === current) return;    /* already watermarked */

    const tmpPath = filePath + '.wm.tmp';

    try {
        const img  = sharp(filePath);
        const meta = await img.metadata();
        if (!meta.width || !meta.height) return;

        const svg = buildWatermarkSvg(meta.width, meta.height);

        await img
            .composite([{ input: svg, blend: 'over' }])
            .jpeg({ quality: 92, progressive: true })
            .toFile(tmpPath);

        fs.renameSync(tmpPath, filePath);

        /* Update in-memory registry with the NEW fingerprint */
        _reg[regKey(filePath)] = fp(filePath);
        scheduleRegistrySave();

        console.log(`[WM] ✓ ${path.relative(__dirname, filePath)}`);
    } catch (err) {
        console.error(`[WM] ✗ ${path.basename(filePath)}: ${err.message}`);
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
}

/* ── Concurrent startup scan (6 workers, in-memory registry is safe) ── */
async function scanExisting() {
    if (!fs.existsSync(IMG_BASE)) return;

    const toProcess = [];
    function walk(dir) {
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (IMG_EXTS.has(path.extname(e.name).toLowerCase())) toProcess.push(full);
        }
    }
    walk(IMG_BASE);

    const pending = toProcess.filter(f => _reg[regKey(f)] !== fp(f));
    if (!pending.length) { console.log('[WM] All images already watermarked.'); return; }

    console.log(`[WM] Processing ${pending.length} image(s) with 6 parallel workers…`);

    /* Pool of 6 concurrent workers — safe because _reg writes are key-specific */
    const CONCURRENCY = 6;
    let idx = 0;
    async function worker() {
        while (idx < pending.length) {
            const filePath = pending[idx++];
            await processImage(filePath);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    console.log('[WM] Startup scan complete.');
}

/* ── File watcher for new uploads ─────────────────────────────── */
function startWatcher() {
    if (!fs.existsSync(IMG_BASE)) return;

    const watcher = chokidar.watch(IMG_BASE, {
        ignored: /(^|[/\\])\.|\.json$|\.wm\.tmp$/,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    });

    watcher.on('add', filePath => {
        if (IMG_EXTS.has(path.extname(filePath).toLowerCase())) {
            console.log(`[WM] New image: ${path.basename(filePath)}`);
            processImage(filePath).catch(() => {});
        }
    });

    watcher.on('error', err => console.error('[WM] Watcher error:', err));
    console.log('[WM] Watching public/images/ for new uploads…');
}

/* ── Public API ───────────────────────────────────────────────── */
function init() {
    setImmediate(() => scanExisting().catch(console.error));
    startWatcher();
}

module.exports = { init, processImage };
