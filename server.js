const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const watermark = require('./watermark');
const app       = express();
const PORT      = process.env.PORT || 3000;

const SITE_URL  = 'https://www.shraddhasaburistone.com';
const SITE_NAME = 'Shraddha Saburi Stone';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);

/* CAT_LABELS: optional human-readable overrides for folder names.
   Any folder NOT listed here gets a title auto-derived from its slug. */
const CAT_LABELS = {
    'temple-projects':       'Temple Projects',
    'jali-designs':          'Stone Jali Designs',
    'decorative-pillars':    'Decorative Pillars',
    'heritage-architecture': 'Heritage Architecture',
    'stone-cladding':        'Stone Cladding',
    'custom-carvings':       'Custom Stone Carvings',
    'export-materials':      'Export Materials'
};

function slugToTitle(slug) {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* Folders that exist in public/images/ but are NOT product categories */
const EXCLUDED_FROM_CATEGORIES = new Set(['infra-hero', 'seo']);

function discoverCategories() {
    const imgBase = path.join(__dirname, 'public', 'images');
    try {
        return fs.readdirSync(imgBase, { withFileTypes: true })
            .filter(d => d.isDirectory() && !EXCLUDED_FROM_CATEGORIES.has(d.name))
            .map(d => d.name)
            .sort();
    } catch { return []; }
}
const SEO_PAGES = [
    /* existing pages */
    'jaisalmer-stone', 'temple-construction', 'stone-jali',
    'decorative-pillars', 'stone-cladding', 'heritage-architecture', 'custom-stone-carving',
    /* new pages */
    'jaisalmer-yellow-sandstone', 'cnc-stone-carving', 'temple-pillars',
    'stone-gazebo-chhatri', 'sandstone-wall-panels', 'temple-mandir-design',
    'jaisalmer-stone-exporter', 'sandstone-architectural-elements'
];

function listFiles(dir, extSet, urlBase) {
    try {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => extSet.has(path.extname(f).toLowerCase()))
            .sort()
            .map(f => `${urlBase}/${encodeURIComponent(f)}`);
    } catch { return []; }
}

function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ── page routes ──────────────────────────────────────────── */
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/category', (_req, res) => res.sendFile(path.join(__dirname, 'category.html')));
app.get('/seo/:page', (req, res) => {
    const page = req.params.page.replace(/[^a-z0-9-]/gi, '');
    const file = path.join(__dirname, 'public', 'seo', page + '.html');
    if (fs.existsSync(file)) res.sendFile(file);
    else res.redirect('/');
});

/* ── categories API (auto-discovers image folders) ────────── */
app.get('/api/categories', (_req, res) => {
    const cats = discoverCategories();
    res.json(cats.map(key => ({ key, label: CAT_LABELS[key] || slugToTitle(key) })));
});

/* ── assets API ───────────────────────────────────────────── */
app.get('/api/assets/:category', (req, res) => {
    const cat = req.params.category.replace(/[^a-z0-9-]/gi, '');
    const catVideos = listFiles(path.join(__dirname, 'public', 'videos', cat), VIDEO_EXTS, `/public/videos/${cat}`);
    const videos = catVideos.length
        ? catVideos
        : listFiles(path.join(__dirname, 'public', 'videos', 'shared'), VIDEO_EXTS, '/public/videos/shared');
    res.json({
        images: listFiles(path.join(__dirname, 'public', 'images', cat), IMAGE_EXTS, `/public/images/${cat}`),
        videos,
    });
});

/* ── robots.txt ───────────────────────────────────────────── */
app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(
`User-agent: *
Allow: /
Allow: /seo/
Allow: /category
Disallow: /api/
Disallow: /public/videos/

# AI Crawlers — welcome
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: anthropic-ai
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: ${SITE_URL}/sitemap-images.xml
Sitemap: ${SITE_URL}/sitemap-videos.xml
`);
});

/* ── main sitemap ─────────────────────────────────────────── */
app.get('/sitemap.xml', (_req, res) => {
    const now = new Date().toISOString().split('T')[0];
    const cats = discoverCategories();
    const urls = [
        { loc: `${SITE_URL}/`,           priority: '1.0', freq: 'weekly'  },
        ...cats.map(c => ({ loc: `${SITE_URL}/category?cat=${c}`, priority: '0.9', freq: 'weekly' })),
        ...SEO_PAGES.map(p => ({  loc: `${SITE_URL}/seo/${p}`,            priority: '0.85', freq: 'monthly' })),
    ];
    const body = urls.map(u => `  <url>
    <loc>${esc(u.loc)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');

    res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
          http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${body}
</urlset>`);
});

/* ── image sitemap ────────────────────────────────────────── */
app.get('/sitemap-images.xml', (_req, res) => {
    const entries = discoverCategories().map(cat => {
        const imgs = listFiles(
            path.join(__dirname, 'public', 'images', cat),
            IMAGE_EXTS, `/public/images/${cat}`
        );
        if (!imgs.length) return '';
        const imgTags = imgs.map(f =>
`    <image:image>
      <image:loc>${esc(SITE_URL + f)}</image:loc>
      <image:title>${esc(SITE_NAME + ' - ' + (CAT_LABELS[cat] || cat))}</image:title>
      <image:caption>${esc('Premium Jaisalmer sandstone ' + (CAT_LABELS[cat] || cat).toLowerCase() + ' by ' + SITE_NAME)}</image:caption>
      <image:geo_location>Jaisalmer, Rajasthan, India</image:geo_location>
      <image:license>${SITE_URL}/</image:license>
    </image:image>`).join('\n');
        return `  <url>\n    <loc>${esc(SITE_URL + '/category?cat=' + cat)}</loc>\n${imgTags}\n  </url>`;
    }).filter(Boolean).join('\n');

    res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries}
</urlset>`);
});

/* ── video sitemap ────────────────────────────────────────── */
app.get('/sitemap-videos.xml', (_req, res) => {
    const entries = discoverCategories().map(cat => {
        const catVids = listFiles(path.join(__dirname, 'public', 'videos', cat), VIDEO_EXTS, `/public/videos/${cat}`);
        const vids = catVids.length
            ? catVids
            : listFiles(path.join(__dirname, 'public', 'videos', 'shared'), VIDEO_EXTS, '/public/videos/shared');
        if (!vids.length) return '';
        const vidTags = vids.map(f =>
`    <video:video>
      <video:thumbnail_loc>${esc(SITE_URL + '/public/images/' + cat + '/thumb.jpg')}</video:thumbnail_loc>
      <video:title>${esc(SITE_NAME + ' - ' + (CAT_LABELS[cat] || cat))}</video:title>
      <video:description>${esc('Premium Jaisalmer sandstone ' + (CAT_LABELS[cat] || cat).toLowerCase() + ' showcase by ' + SITE_NAME + ', Jaisalmer, Rajasthan, India')}</video:description>
      <video:content_loc>${esc(SITE_URL + f)}</video:content_loc>
      <video:duration>60</video:duration>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>`).join('\n');
        return `  <url>\n    <loc>${esc(SITE_URL + '/category?cat=' + cat)}</loc>\n${vidTags}\n  </url>`;
    }).filter(Boolean).join('\n');

    res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${entries}
</urlset>`);
});

/* ── root-level static assets (favicon.ico, robots, manifest) */
app.get('/favicon.ico',      (_req, res) => res.sendFile(path.join(__dirname, 'public', 'favicon.ico')));
app.get('/site.webmanifest', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'site.webmanifest')));

/* ── static files ─────────────────────────────────────────── */
app.use('/public', express.static(path.join(__dirname, 'public'), {
    maxAge: '7d',
    acceptRanges: true,
    setHeaders(res, filePath) {
        if (IMAGE_EXTS.has(path.extname(filePath).toLowerCase())) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
    }
}));

app.listen(PORT, () => {
    console.log('\n  ◆  SHRADDHA SABURI STONE');
    console.log(`  ◆  http://localhost:${PORT}`);
    console.log(`  ◆  Sitemap: http://localhost:${PORT}/sitemap.xml\n`);

    /* Start automatic watermark system */
    watermark.init();
});
