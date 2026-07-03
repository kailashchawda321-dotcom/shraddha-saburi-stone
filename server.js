'use strict';
const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const helmet      = require('helmet');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const multer      = require('multer');
const watermark   = require('./watermark');

const app  = express();
const PORT = process.env.PORT || 3000;

const SITE_URL   = 'https://www.shraddhasaburistone.com';
const SITE_NAME  = 'Shraddha Saburi Stone';
const WA_NUMBER  = '919649299121';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'SSS@Admin2026';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);
const UPLOAD_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.dwg', '.dxf']);

/* ── Data loaders ───────────────────────────────────────────── */
function loadJSON(file) {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8')); }
    catch { return []; }
}
function saveJSON(file, data) {
    fs.writeFileSync(path.join(__dirname, 'data', file), JSON.stringify(data, null, 2));
}

/* ── Category helpers ───────────────────────────────────────── */
const CAT_LABELS = {
    'temple-projects':       'Temple Projects',
    'jali-designs':          'Stone Jali Designs',
    'decorative-pillars':    'Decorative Pillars',
    'heritage-architecture': 'Heritage Architecture',
    'stone-cladding':        'Stone Cladding',
    'custom-carvings':       'Custom Stone Carvings',
    'export-materials':      'Export Materials'
};
const EXCLUDED_FROM_CATEGORIES = new Set(['infra-hero', 'seo']);

function slugToTitle(slug) {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function discoverCategories() {
    try {
        return fs.readdirSync(path.join(__dirname, 'public', 'images'), { withFileTypes: true })
            .filter(d => d.isDirectory() && !EXCLUDED_FROM_CATEGORIES.has(d.name))
            .map(d => d.name).sort();
    } catch { return []; }
}
function listFiles(dir, extSet, urlBase) {
    try {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => extSet.has(path.extname(f)))
            .sort()
            .map(f => `${urlBase}/${encodeURIComponent(f)}`);
    } catch { return []; }
}
function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── SEO pages list ─────────────────────────────────────────── */
const SEO_PAGES = [
    'jaisalmer-stone','temple-construction','stone-jali','decorative-pillars',
    'stone-cladding','heritage-architecture','custom-stone-carving',
    'jaisalmer-yellow-sandstone','cnc-stone-carving','temple-pillars',
    'stone-gazebo-chhatri','sandstone-wall-panels','temple-mandir-design',
    'jaisalmer-stone-exporter','sandstone-architectural-elements',
    'jaisalmer-stone-manufacturer','jaisalmer-stone-supplier','landscape-garden-stone'
];

/* ══════════════════════════════════════════════════════════════
   MIDDLEWARE
   ══════════════════════════════════════════════════════════════ */
app.set('trust proxy', 1);

/* Security headers */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:    ["'self'"],
            scriptSrc:     ["'self'","'unsafe-inline'","https://cdnjs.cloudflare.com","https://cdn.jsdelivr.net","https://fonts.googleapis.com","https://www.googletagmanager.com","https://www.clarity.ms","https://cdn.clarity.ms"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc:      ["'self'","'unsafe-inline'","https://fonts.googleapis.com","https://cdnjs.cloudflare.com"],
            fontSrc:       ["'self'","https://fonts.gstatic.com","data:"],
            imgSrc:        ["'self'","data:","https:","blob:"],
            mediaSrc:      ["'self'","blob:"],
            connectSrc:    ["'self'","https://www.google-analytics.com","https://analytics.google.com","https://www.clarity.ms","https://*.googleapis.com"],
            frameSrc:      ["'self'","https://maps.google.com","https://www.google.com","https://maps.googleapis.com"],
            objectSrc:     ["'none'"],
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

/* Gzip compression */
app.use(compression());

/* Rate limiting */
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use(limiter);
const quoteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Too many quote requests. Try again later.' } });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ── File upload (quote system) ─────────────────────────────── */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'uploads');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${safe}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 5 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, UPLOAD_EXTS.has(ext));
    }
});

/* ══════════════════════════════════════════════════════════════
   PRODUCT PAGE RENDERER
   ══════════════════════════════════════════════════════════════ */
function renderProductPage(product) {
    const imgs = product.images && product.images.length
        ? product.images
        : listFiles(path.join(__dirname, 'public', 'images', product.category), IMAGE_EXTS, `/public/images/${product.category}`);

    const galleryHtml = imgs.length ? `
<section class="prod-gallery">
  <div class="gallery-label">Gallery</div>
  <div class="prod-gallery-grid">
    ${imgs.slice(0, 12).map((src, i) => `
    <div class="prod-gallery-item" onclick="openLightbox(${i})">
      <img src="${src}" alt="${esc(product.name)} — Shraddha Saburi Stone" loading="lazy" width="400" height="300">
    </div>`).join('')}
  </div>
</section>` : '';

    const specsHtml = Object.entries(product.specifications || {}).map(([k, v]) =>
        `<div class="spec-cell"><div class="spec-label">${esc(k)}</div><div class="spec-val">${esc(v)}</div></div>`
    ).join('');

    const appsHtml = (product.applications || []).map(a =>
        `<div class="use-item"><div class="use-dot"></div><div class="use-text">${esc(a)}</div></div>`
    ).join('');

    const faqHtml = (product.faqs || []).map(f => `
<div class="faq-mini-item" itemscope itemtype="https://schema.org/Question">
  <div class="faq-mini-q" itemprop="name">${esc(f.q)}</div>
  <div class="faq-mini-a" itemprop="acceptedAnswer" itemscope itemtype="https://schema.org/Answer">
    <span itemprop="text">${esc(f.a)}</span>
  </div>
</div>`).join('');

    const schema = JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
            { "@type": "BreadcrumbList", "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL + "/" },
                { "@type": "ListItem", "position": 2, "name": "Products", "item": SITE_URL + "/products" },
                { "@type": "ListItem", "position": 3, "name": product.name, "item": `${SITE_URL}/product/${product.slug}` }
            ]},
            { "@type": "Product", "name": product.name, "description": product.description,
              "brand": { "@type": "Brand", "name": SITE_NAME },
              "manufacturer": { "@type": "Organization", "name": SITE_NAME, "url": SITE_URL },
              "material": "Jaisalmer Sandstone", "countryOfOrigin": "India",
              "offers": { "@type": "AggregateOffer", "priceCurrency": "INR",
                "availability": "https://schema.org/InStock",
                "seller": { "@type": "Organization", "name": SITE_NAME }},
              "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "247", "bestRating": "5" },
              "image": imgs[0] ? SITE_URL + imgs[0] : `${SITE_URL}/public/og-image.jpg`
            },
            { "@type": "FAQPage", "mainEntity": (product.faqs || []).map(f => ({
                "@type": "Question", "name": f.q,
                "acceptedAnswer": { "@type": "Answer", "text": f.a }
            }))}
        ]
    });

    const lighboxJs = imgs.length ? `
<script>
const _imgs=${JSON.stringify(imgs)};let _idx=0;
function openLightbox(i){_idx=i;document.getElementById('lb').style.display='flex';document.getElementById('lb-img').src=_imgs[i];document.getElementById('lb-counter').textContent=(i+1)+' / '+_imgs.length;}
function closeLightbox(){document.getElementById('lb').style.display='none';}
function lbNext(){_idx=(_idx+1)%_imgs.length;document.getElementById('lb-img').src=_imgs[_idx];document.getElementById('lb-counter').textContent=(_idx+1)+' / '+_imgs.length;}
function lbPrev(){_idx=(_idx-1+_imgs.length)%_imgs.length;document.getElementById('lb-img').src=_imgs[_idx];document.getElementById('lb-counter').textContent=(_idx+1)+' / '+_imgs.length;}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')lbNext();if(e.key==='ArrowLeft')lbPrev();if(e.key==='Escape')closeLightbox();});
</script>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(product.seo?.title || product.name + ' | Shraddha Saburi Stone')}</title>
<meta name="description" content="${esc(product.seo?.description || product.description)}">
<meta name="keywords" content="${esc(product.seo?.keywords || '')}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${SITE_URL}/product/${product.slug}">
<meta property="og:type" content="product">
<meta property="og:url" content="${SITE_URL}/product/${product.slug}">
<meta property="og:site_name" content="Shraddha Saburi Stone">
<meta property="og:title" content="${esc(product.seo?.title || product.name)}">
<meta property="og:description" content="${esc(product.seo?.description || product.description)}">
<meta property="og:image" content="${imgs[0] ? SITE_URL + imgs[0] : SITE_URL + '/public/og-image.jpg'}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(product.name)}">
<meta name="twitter:description" content="${esc(product.seo?.description || product.description)}">
<meta name="twitter:image" content="${imgs[0] ? SITE_URL + imgs[0] : SITE_URL + '/public/og-image.jpg'}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<script type="application/ld+json">${schema}</script>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--gold:#D9B062;--ink:#030303}
html{background:var(--ink);scroll-behavior:smooth}
body{background:var(--ink);color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased;line-height:1.6}
a{color:inherit;text-decoration:none}
.seo-nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(3,3,3,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(217,176,98,0.1);padding:16px 60px;display:flex;align-items:center;justify-content:space-between}
.seo-nav-logo{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;letter-spacing:0.12em;color:rgba(255,255,255,0.8)}
.seo-nav-links{display:flex;gap:28px;align-items:center}
.seo-nav-link{font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.35);transition:color 0.3s}
.seo-nav-link:hover{color:var(--gold)}
.seo-cta-btn{font-size:9px;letter-spacing:0.2em;text-transform:uppercase;background:var(--gold);color:#030303;padding:10px 22px}
.breadcrumb{padding:100px 60px 0;max-width:1200px;margin:0 auto}
.breadcrumb-list{display:flex;align-items:center;gap:8px;list-style:none;flex-wrap:wrap}
.breadcrumb-item{font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.25)}
.breadcrumb-item a{color:rgba(217,176,98,0.55)}
.breadcrumb-sep{color:rgba(255,255,255,0.15);font-size:8px}
.hero-seo{padding:50px 60px 60px;max-width:1200px;margin:0 auto}
.hero-eyebrow{font-size:10px;letter-spacing:0.40em;text-transform:uppercase;color:var(--gold);opacity:0.7;margin-bottom:16px}
.hero-h1{font-family:'Cormorant Garamond',serif;font-size:clamp(38px,5vw,72px);font-weight:300;letter-spacing:0.05em;line-height:1.08;margin-bottom:16px}
.hero-h1 em{font-style:italic;color:var(--gold)}
.hero-tagline{font-size:13px;font-weight:300;color:rgba(255,255,255,0.4);letter-spacing:0.04em;line-height:1.8;max-width:640px;margin-bottom:24px}
.hero-lead{font-size:13px;font-weight:300;color:rgba(255,255,255,0.38);letter-spacing:0.03em;line-height:1.9;max-width:700px;margin-bottom:36px}
.hero-btns{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:40px}
.btn-primary{font-size:10px;letter-spacing:0.22em;text-transform:uppercase;background:var(--gold);color:#030303;padding:14px 32px;cursor:pointer;border:none}
.btn-secondary{font-size:10px;letter-spacing:0.22em;text-transform:uppercase;border:1px solid rgba(217,176,98,0.25);color:rgba(255,255,255,0.5);padding:14px 32px}
.content-section{padding:60px 60px;max-width:1200px;margin:0 auto}
.section-label{font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:var(--gold);opacity:0.6;margin-bottom:12px}
.section-h2{font-family:'Cormorant Garamond',serif;font-size:clamp(26px,3vw,42px);font-weight:300;letter-spacing:0.06em;line-height:1.15;margin-bottom:20px}
.section-h2 em{font-style:italic;color:var(--gold)}
.section-p{font-size:13px;font-weight:300;color:rgba(255,255,255,0.38);line-height:1.9;margin-bottom:16px}
.divider{width:60px;height:1px;background:rgba(217,176,98,0.3);margin:36px 0}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:start}
.spec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:rgba(217,176,98,0.06);border:1px solid rgba(217,176,98,0.08);margin:24px 0}
.spec-cell{background:var(--ink);padding:20px 22px}
.spec-label{font-size:8.5px;letter-spacing:0.28em;text-transform:uppercase;color:var(--gold);opacity:0.55;margin-bottom:6px}
.spec-val{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:300;color:rgba(255,255,255,0.7)}
.uses-list{display:flex;flex-direction:column;gap:8px;margin:16px 0}
.use-item{display:flex;align-items:flex-start;gap:14px;padding:12px 16px;border:1px solid rgba(217,176,98,0.07);background:rgba(217,176,98,0.02)}
.use-dot{width:4px;height:4px;background:var(--gold);border-radius:50%;flex-shrink:0;margin-top:5px}
.use-text{font-size:12px;font-weight:300;color:rgba(255,255,255,0.40);line-height:1.7}
.faq-mini{margin-top:32px}
.faq-mini-item{border-bottom:1px solid rgba(255,255,255,0.05);padding:18px 0}
.faq-mini-q{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:300;color:rgba(255,255,255,0.65);margin-bottom:8px}
.faq-mini-a{font-size:12px;font-weight:300;color:rgba(255,255,255,0.32);line-height:1.85}
/* Gallery */
.prod-gallery{padding:0 60px 60px;max-width:1200px;margin:0 auto}
.gallery-label{font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:var(--gold);opacity:0.6;margin-bottom:20px}
.prod-gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.prod-gallery-item{aspect-ratio:4/3;overflow:hidden;cursor:pointer;background:#111}
.prod-gallery-item img{width:100%;height:100%;object-fit:cover;transition:transform 0.5s ease}
.prod-gallery-item:hover img{transform:scale(1.05)}
/* Lightbox */
#lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.94);z-index:9999;align-items:center;justify-content:center;flex-direction:column}
#lb-img{max-width:90vw;max-height:80vh;object-fit:contain}
.lb-close{position:absolute;top:20px;right:28px;font-size:28px;color:rgba(255,255,255,0.5);cursor:pointer;background:none;border:none}
.lb-arrow{position:absolute;top:50%;transform:translateY(-50%);font-size:36px;color:rgba(255,255,255,0.4);cursor:pointer;background:none;border:none;padding:20px}
#lb-prev{left:10px}
#lb-next{right:10px}
#lb-counter{margin-top:16px;font-size:11px;color:rgba(255,255,255,0.3);letter-spacing:0.2em}
/* CTA */
.cta-band{background:#06050A;border-top:1px solid rgba(217,176,98,0.08);border-bottom:1px solid rgba(217,176,98,0.08);padding:70px 60px;text-align:center}
.cta-eyebrow{font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:var(--gold);opacity:0.65;margin-bottom:18px}
.cta-h2{font-family:'Cormorant Garamond',serif;font-size:clamp(26px,4vw,48px);font-weight:300;letter-spacing:0.06em;margin-bottom:14px}
.cta-h2 em{font-style:italic;color:var(--gold)}
.cta-sub{font-size:12px;font-weight:300;color:rgba(255,255,255,0.28);max-width:480px;margin:0 auto 32px}
.cta-btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
/* Related */
.related-pages{padding:50px 60px 70px;max-width:1200px;margin:0 auto}
.related-label{font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:var(--gold);opacity:0.55;margin-bottom:18px}
.related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1px;background:rgba(217,176,98,0.06)}
.related-card{background:var(--ink);padding:20px 22px;transition:background 0.3s}
.related-card:hover{background:rgba(217,176,98,0.03)}
.related-card-title{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;color:rgba(255,255,255,0.6);margin-bottom:5px}
.related-card-arrow{font-size:8.5px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(217,176,98,0.4)}
.seo-footer{background:var(--ink);border-top:1px solid rgba(217,176,98,0.07);padding:32px 60px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}
.seo-footer-nap{font-size:10px;color:rgba(255,255,255,0.18);line-height:1.8}
.seo-footer-nap strong{color:rgba(217,176,98,0.4)}
.seo-footer-copy{font-size:9px;color:rgba(255,255,255,0.12)}
@media(max-width:768px){.seo-nav{padding:14px 24px}.breadcrumb,.hero-seo,.content-section,.prod-gallery,.cta-band,.related-pages,.seo-footer{padding-left:24px;padding-right:24px}.two-col{grid-template-columns:1fr}.seo-nav-links{gap:14px}}
</style>
</head>
<body>
<nav class="seo-nav">
  <a href="/" class="seo-nav-logo">Shraddha Saburi Stone</a>
  <div class="seo-nav-links">
    <a href="/products" class="seo-nav-link">Products</a>
    <a href="/projects" class="seo-nav-link">Projects</a>
    <a href="/#faq" class="seo-nav-link">FAQ</a>
    <a href="/quote" class="seo-cta-btn">Get Quote</a>
  </div>
</nav>
<nav aria-label="Breadcrumb">
  <div class="breadcrumb">
    <ol class="breadcrumb-list">
      <li class="breadcrumb-item"><a href="/">Home</a></li>
      <li class="breadcrumb-sep">›</li>
      <li class="breadcrumb-item"><a href="/products">Products</a></li>
      <li class="breadcrumb-sep">›</li>
      <li class="breadcrumb-item">${esc(product.name)}</li>
    </ol>
  </div>
</nav>
<section class="hero-seo">
  <div class="hero-eyebrow">${esc(CAT_LABELS[product.category] || slugToTitle(product.category))}</div>
  <h1 class="hero-h1">${esc(product.name).replace(/\s(\S+)$/, ' <em>$1</em>')}</h1>
  <div class="hero-tagline">${esc(product.tagline || '')}</div>
  <div class="hero-lead">${esc(product.description)}</div>
  <div class="hero-btns">
    <a href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Hi, I am interested in ' + product.name + '. Please share pricing and availability.')}" class="btn-primary" target="_blank" rel="noopener">Request Quote on WhatsApp</a>
    <a href="/quote" class="btn-secondary">Upload Drawing / PDF</a>
  </div>
</section>
${galleryHtml}
<div class="content-section">
  <div class="two-col">
    <div>
      <div class="section-label">Applications</div>
      <h2 class="section-h2">Where to <em>Use It</em></h2>
      <div class="uses-list">${appsHtml}</div>
    </div>
    <div>
      <div class="section-label">Technical Specifications</div>
      <div class="spec-grid">${specsHtml}</div>
      <p class="section-p" style="margin-top:16px">MOQ: <strong>${esc(product.moq || 'Contact us')}</strong> &nbsp;·&nbsp; Lead Time: <strong>${esc(product.leadTime || 'Contact us')}</strong> &nbsp;·&nbsp; Export: <strong>${product.exportReady ? 'Yes' : 'Domestic only'}</strong></p>
    </div>
  </div>
  <div class="divider"></div>
  <div class="section-label">FAQ</div>
  <h2 class="section-h2">Common <em>Questions</em></h2>
  <div class="faq-mini">${faqHtml}</div>
</div>
<div class="cta-band">
  <div class="cta-eyebrow">Get Started Today</div>
  <h2 class="cta-h2">Request a <em>Free Quote</em></h2>
  <p class="cta-sub">Tell us your requirements and we'll respond within 24 hours.</p>
  <div class="cta-btns">
    <a href="https://wa.me/${WA_NUMBER}" class="btn-primary" target="_blank" rel="noopener">WhatsApp Us Now</a>
    <a href="tel:+917023912171" class="btn-secondary">Call +91 7023912171</a>
  </div>
</div>
<div class="related-pages">
  <div class="related-label">More Products</div>
  <div class="related-grid">
    <a href="/products" class="related-card"><div class="related-card-title">All Products</div><div class="related-card-arrow">View All →</div></a>
    <a href="/projects" class="related-card"><div class="related-card-title">Project Gallery</div><div class="related-card-arrow">View →</div></a>
    <a href="/seo/jaisalmer-stone" class="related-card"><div class="related-card-title">Jaisalmer Sandstone</div><div class="related-card-arrow">View →</div></a>
    <a href="/quote" class="related-card"><div class="related-card-title">Request Quote</div><div class="related-card-arrow">Start →</div></a>
  </div>
</div>
<footer class="seo-footer">
  <address class="seo-footer-nap" style="font-style:normal">
    <strong>Shraddha Saburi Stone</strong> &nbsp;·&nbsp; G-15 RIICO Industrial Area, Kishangarh RIICO, Jaisalmer, Rajasthan 345001, India &nbsp;·&nbsp;
    <a href="tel:+917023912171" style="color:inherit">+91 7023912171</a>
  </address>
  <span class="seo-footer-copy">© 2026 Shraddha Saburi Stone · Jaisalmer Sandstone Manufacturer</span>
</footer>
<div id="lb" onclick="if(event.target===this)closeLightbox()">
  <button class="lb-close" onclick="closeLightbox()">✕</button>
  <button class="lb-arrow" id="lb-prev" onclick="lbPrev()">‹</button>
  <img id="lb-img" src="" alt="Gallery image">
  <button class="lb-arrow" id="lb-next" onclick="lbNext()">›</button>
  <div id="lb-counter"></div>
</div>
${lighboxJs}
</body>
</html>`;
}

/* ══════════════════════════════════════════════════════════════
   PAGE ROUTES
   ══════════════════════════════════════════════════════════════ */
const NO_CACHE = { headers: { 'Cache-Control': 'no-cache, must-revalidate' } };

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html'), NO_CACHE));
app.get('/category', (_req, res) => res.sendFile(path.join(__dirname, 'category.html'), NO_CACHE));
app.get('/seo/:page', (req, res) => {
    const page = req.params.page.replace(/[^a-z0-9-]/gi, '');
    const file = path.join(__dirname, 'public', 'seo', page + '.html');
    if (fs.existsSync(file)) res.sendFile(file, NO_CACHE);
    else res.redirect('/');
});

/* ── Products listing page ──────────────────────────────────── */
app.get('/products', (_req, res) => {
    const products = loadJSON('products.json');
    const cards = products.map(p => `
<a href="/product/${p.slug}" class="prod-card">
  <div class="prod-card-cat">${esc(CAT_LABELS[p.category] || slugToTitle(p.category))}</div>
  <div class="prod-card-name">${esc(p.name)}</div>
  <div class="prod-card-tag">${esc(p.tagline || '')}</div>
  <div class="prod-card-arrow">View Product →</div>
</a>`).join('');

    res.set('Cache-Control', 'no-cache, must-revalidate').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Products — Jaisalmer Sandstone | Shraddha Saburi Stone</title>
<meta name="description" content="Browse premium Jaisalmer sandstone products: slabs, jali screens, pillars, cladding, carvings and temple stone. Direct from factory. Call +91 7023912171.">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${SITE_URL}/products">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}/products">
<meta property="og:site_name" content="Shraddha Saburi Stone">
<meta property="og:title" content="Products — Jaisalmer Sandstone | Shraddha Saburi Stone">
<meta property="og:description" content="Browse premium Jaisalmer sandstone products: slabs, jali screens, pillars, cladding, carvings and temple stone. Direct from factory. Call +91 7023912171.">
<meta property="og:image" content="${SITE_URL}/public/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Products — Jaisalmer Sandstone | Shraddha Saburi Stone">
<meta name="twitter:description" content="Browse premium Jaisalmer sandstone products: slabs, jali screens, pillars, cladding, carvings and temple stone. Direct from factory.">
<meta name="twitter:image" content="${SITE_URL}/public/og-image.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}:root{--gold:#D9B062;--ink:#030303}html{background:var(--ink)}body{background:var(--ink);color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}
.seo-nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(3,3,3,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(217,176,98,0.1);padding:16px 60px;display:flex;align-items:center;justify-content:space-between}
.seo-nav-logo{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;letter-spacing:0.12em;color:rgba(255,255,255,0.8)}
.seo-nav-links{display:flex;gap:28px;align-items:center}.seo-nav-link{font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.35)}.seo-nav-link:hover{color:var(--gold)}.seo-cta-btn{font-size:9px;letter-spacing:0.2em;text-transform:uppercase;background:var(--gold);color:#030303;padding:10px 22px}
.hero{padding:130px 60px 60px;max-width:1200px;margin:0 auto}
.hero-eyebrow{font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:var(--gold);opacity:0.7;margin-bottom:16px}
.hero-h1{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,5vw,68px);font-weight:300;letter-spacing:0.05em;margin-bottom:16px}
.hero-h1 em{font-style:italic;color:var(--gold)}
.hero-lead{font-size:13px;font-weight:300;color:rgba(255,255,255,0.38);max-width:600px;line-height:1.9;margin-bottom:40px}
.prod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1px;background:rgba(217,176,98,0.06);padding:0 60px;max-width:1320px;margin:0 auto 80px}
.prod-card{background:var(--ink);padding:32px;transition:background 0.3s;border:1px solid transparent}
.prod-card:hover{background:rgba(217,176,98,0.03);border-color:rgba(217,176,98,0.08)}
.prod-card-cat{font-size:8.5px;letter-spacing:0.3em;text-transform:uppercase;color:var(--gold);opacity:0.55;margin-bottom:10px}
.prod-card-name{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:rgba(255,255,255,0.8);margin-bottom:8px}
.prod-card-tag{font-size:11px;font-weight:300;color:rgba(255,255,255,0.28);line-height:1.6;margin-bottom:18px}
.prod-card-arrow{font-size:8.5px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(217,176,98,0.45)}
.seo-footer{border-top:1px solid rgba(217,176,98,0.07);padding:32px 60px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}
.seo-footer-nap{font-size:10px;color:rgba(255,255,255,0.18);line-height:1.8}.seo-footer-nap strong{color:rgba(217,176,98,0.4)}.seo-footer-copy{font-size:9px;color:rgba(255,255,255,0.12)}
@media(max-width:768px){.seo-nav{padding:14px 24px}.hero,.prod-grid,.seo-footer{padding-left:24px;padding-right:24px}.seo-nav-links{gap:14px}}
</style></head><body>
<nav class="seo-nav"><a href="/" class="seo-nav-logo">Shraddha Saburi Stone</a><div class="seo-nav-links"><a href="/products" class="seo-nav-link">Products</a><a href="/projects" class="seo-nav-link">Projects</a><a href="/search" class="seo-nav-link">Search</a><a href="/quote" class="seo-cta-btn">Get Quote</a></div></nav>
<div class="hero"><div class="hero-eyebrow">Product Catalogue</div><h1 class="hero-h1">Premium Jaisalmer <em>Stone Products</em></h1><p class="hero-lead">Factory-direct Jaisalmer sandstone in every form — from raw slabs to intricately carved masterpieces. All manufactured at our Jaisalmer RIICO facility.</p></div>
<div class="prod-grid">${cards}</div>
<footer class="seo-footer"><address class="seo-footer-nap" style="font-style:normal"><strong>Shraddha Saburi Stone</strong> &nbsp;·&nbsp; G-15 RIICO Industrial Area, Jaisalmer, Rajasthan 345001 &nbsp;·&nbsp; <a href="tel:+917023912171" style="color:inherit">+91 7023912171</a></address><span class="seo-footer-copy">© 2026 Shraddha Saburi Stone</span></footer>
</body></html>`);
});

/* ── Individual product page ────────────────────────────────── */
app.get('/product/:slug', (req, res) => {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const products = loadJSON('products.json');
    const product = products.find(p => p.slug === slug);
    if (!product) return res.status(404).redirect('/products');
    res.set('Cache-Control', 'no-cache, must-revalidate').send(renderProductPage(product));
});

/* ── Projects page ──────────────────────────────────────────── */
app.get('/projects', (_req, res) => {
    const projects = loadJSON('projects.json');
    const cards = projects.map(p => {
        const imgs = listFiles(path.join(__dirname, 'public', 'images', p.imageFolder), IMAGE_EXTS, `/public/images/${p.imageFolder}`);
        const thumb = imgs[0] ? `<img src="${imgs[0]}" alt="${esc(p.title)}" loading="lazy" width="400" height="300">` : '<div class="proj-no-img"></div>';
        return `<a href="/project/${p.slug}" class="proj-card">
  <div class="proj-thumb">${thumb}</div>
  <div class="proj-info">
    <div class="proj-cat">${esc(p.category)}</div>
    <div class="proj-title">${esc(p.title)}</div>
    <div class="proj-tag">${esc(p.tagline)}</div>
    <div class="proj-meta">${esc(p.location)} · ${esc(String(p.completionYear))}</div>
  </div>
</a>`;
    }).join('');

    res.set('Cache-Control', 'no-cache, must-revalidate').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Project Portfolio — Jaisalmer Stone | Shraddha Saburi Stone</title>
<meta name="description" content="Portfolio of premium Jaisalmer sandstone projects: temples, heritage restoration, jali screens, cladding, pillars and custom carvings. India + worldwide.">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${SITE_URL}/projects">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}/projects">
<meta property="og:site_name" content="Shraddha Saburi Stone">
<meta property="og:title" content="Project Portfolio — Jaisalmer Stone | Shraddha Saburi Stone">
<meta property="og:description" content="Portfolio of premium Jaisalmer sandstone projects: temples, heritage restoration, jali screens, cladding, pillars and custom carvings. India + worldwide.">
<meta property="og:image" content="${SITE_URL}/public/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Project Portfolio — Jaisalmer Stone | Shraddha Saburi Stone">
<meta name="twitter:description" content="Portfolio of premium Jaisalmer sandstone projects: temples, heritage restoration, jali screens, cladding, pillars and custom carvings.">
<meta name="twitter:image" content="${SITE_URL}/public/og-image.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}:root{--gold:#D9B062;--ink:#030303}html{background:var(--ink)}body{background:var(--ink);color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}
.seo-nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(3,3,3,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(217,176,98,0.1);padding:16px 60px;display:flex;align-items:center;justify-content:space-between}
.seo-nav-logo{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;letter-spacing:0.12em;color:rgba(255,255,255,0.8)}
.seo-nav-links{display:flex;gap:28px;align-items:center}.seo-nav-link{font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.35)}.seo-nav-link:hover{color:var(--gold)}.seo-cta-btn{font-size:9px;letter-spacing:0.2em;text-transform:uppercase;background:var(--gold);color:#030303;padding:10px 22px}
.hero{padding:130px 60px 60px;max-width:1200px;margin:0 auto}
.hero-eyebrow{font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:var(--gold);opacity:0.7;margin-bottom:16px}
.hero-h1{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,5vw,68px);font-weight:300;letter-spacing:0.05em;margin-bottom:16px}
.hero-h1 em{font-style:italic;color:var(--gold)}
.hero-lead{font-size:13px;font-weight:300;color:rgba(255,255,255,0.38);max-width:600px;line-height:1.9;margin-bottom:40px}
.proj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:2px;padding:0 60px;max-width:1320px;margin:0 auto 80px}
.proj-card{background:var(--ink);display:block;transition:background 0.3s}
.proj-card:hover{background:rgba(217,176,98,0.02)}
.proj-thumb{aspect-ratio:4/3;overflow:hidden;background:#111}
.proj-thumb img{width:100%;height:100%;object-fit:cover;transition:transform 0.5s}
.proj-card:hover .proj-thumb img{transform:scale(1.05)}
.proj-no-img{width:100%;height:100%;background:linear-gradient(135deg,#111,#1a1500)}
.proj-info{padding:24px}
.proj-cat{font-size:8.5px;letter-spacing:0.3em;text-transform:uppercase;color:var(--gold);opacity:0.55;margin-bottom:8px}
.proj-title{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:rgba(255,255,255,0.8);margin-bottom:6px}
.proj-tag{font-size:11px;font-weight:300;color:rgba(255,255,255,0.28);line-height:1.6;margin-bottom:10px}
.proj-meta{font-size:9px;letter-spacing:0.15em;color:rgba(217,176,98,0.4)}
.seo-footer{border-top:1px solid rgba(217,176,98,0.07);padding:32px 60px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}
.seo-footer-nap{font-size:10px;color:rgba(255,255,255,0.18);line-height:1.8}.seo-footer-nap strong{color:rgba(217,176,98,0.4)}.seo-footer-copy{font-size:9px;color:rgba(255,255,255,0.12)}
@media(max-width:768px){.seo-nav{padding:14px 24px}.hero,.proj-grid,.seo-footer{padding-left:24px;padding-right:24px}.proj-grid{grid-template-columns:1fr}.seo-nav-links{gap:14px}}
</style></head><body>
<nav class="seo-nav"><a href="/" class="seo-nav-logo">Shraddha Saburi Stone</a><div class="seo-nav-links"><a href="/products" class="seo-nav-link">Products</a><a href="/projects" class="seo-nav-link">Projects</a><a href="/search" class="seo-nav-link">Search</a><a href="/quote" class="seo-cta-btn">Get Quote</a></div></nav>
<div class="hero"><div class="hero-eyebrow">Project Portfolio</div><h1 class="hero-h1">Our <em>Stone Projects</em></h1><p class="hero-lead">Decades of premium Jaisalmer sandstone work across temples, heritage buildings, luxury hotels, villas and export projects worldwide.</p></div>
<div class="proj-grid">${cards}</div>
<footer class="seo-footer"><address class="seo-footer-nap" style="font-style:normal"><strong>Shraddha Saburi Stone</strong> &nbsp;·&nbsp; G-15 RIICO Industrial Area, Jaisalmer, Rajasthan 345001 &nbsp;·&nbsp; <a href="tel:+917023912171" style="color:inherit">+91 7023912171</a></address><span class="seo-footer-copy">© 2026 Shraddha Saburi Stone</span></footer>
</body></html>`);
});

/* ── Individual project page ─────────────────────────────────  */
app.get('/project/:slug', (req, res) => {
    const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
    const projects = loadJSON('projects.json');
    const project = projects.find(p => p.slug === slug);
    if (!project) return res.status(404).redirect('/projects');
    const imgs = listFiles(path.join(__dirname, 'public', 'images', project.imageFolder), IMAGE_EXTS, `/public/images/${project.imageFolder}`);
    const galleryHtml = imgs.map((src, i) => `<div class="proj-gallery-item" onclick="openLightbox(${i})"><img src="${src}" alt="${esc(project.title)} — Shraddha Saburi Stone" loading="lazy" width="400" height="300"></div>`).join('');
    const specsHtml = Object.entries(project.specifications || {}).map(([k, v]) => `<div class="spec-cell"><div class="spec-label">${esc(k)}</div><div class="spec-val">${esc(v)}</div></div>`).join('');
    const matsHtml = (project.materials || []).map(m => `<div class="use-item"><div class="use-dot"></div><div class="use-text">${esc(m)}</div></div>`).join('');
    const lbJs = imgs.length ? `<script>const _imgs=${JSON.stringify(imgs)};let _idx=0;function openLightbox(i){_idx=i;document.getElementById('lb').style.display='flex';document.getElementById('lb-img').src=_imgs[i];document.getElementById('lb-c').textContent=(i+1)+'/'+_imgs.length;}function closeLightbox(){document.getElementById('lb').style.display='none';}function lbNext(){_idx=(_idx+1)%_imgs.length;document.getElementById('lb-img').src=_imgs[_idx];document.getElementById('lb-c').textContent=(_idx+1)+'/'+_imgs.length;}function lbPrev(){_idx=(_idx-1+_imgs.length)%_imgs.length;document.getElementById('lb-img').src=_imgs[_idx];document.getElementById('lb-c').textContent=(_idx+1)+'/'+_imgs.length;}document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')lbNext();if(e.key==='ArrowLeft')lbPrev();if(e.key==='Escape')closeLightbox();});</script>` : '';
    res.set('Cache-Control', 'no-cache, must-revalidate').send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.title)} — Project Gallery | Shraddha Saburi Stone</title><meta name="description" content="${esc(project.description.substring(0,155))}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${SITE_URL}/project/${project.slug}"><meta property="og:type" content="article"><meta property="og:url" content="${SITE_URL}/project/${project.slug}"><meta property="og:site_name" content="Shraddha Saburi Stone"><meta property="og:title" content="${esc(project.title)} — Project Gallery | Shraddha Saburi Stone"><meta property="og:description" content="${esc(project.description.substring(0,155))}"><meta property="og:image" content="${imgs[0] ? SITE_URL+imgs[0] : SITE_URL+'/public/og-image.jpg'}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(project.title)} | Shraddha Saburi Stone"><meta name="twitter:description" content="${esc(project.description.substring(0,155))}"><meta name="twitter:image" content="${imgs[0] ? SITE_URL+imgs[0] : SITE_URL+'/public/og-image.jpg'}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet"><style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}:root{--gold:#D9B062;--ink:#030303}html{background:var(--ink)}body{background:var(--ink);color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.seo-nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(3,3,3,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(217,176,98,0.1);padding:16px 60px;display:flex;align-items:center;justify-content:space-between}.seo-nav-logo{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;letter-spacing:0.12em;color:rgba(255,255,255,0.8)}.seo-nav-links{display:flex;gap:28px;align-items:center}.seo-nav-link{font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.35)}.seo-nav-link:hover{color:var(--gold)}.seo-cta-btn{font-size:9px;letter-spacing:0.2em;text-transform:uppercase;background:var(--gold);color:#030303;padding:10px 22px}.hero-seo{padding:120px 60px 50px;max-width:1200px;margin:0 auto}.hero-eyebrow{font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:var(--gold);opacity:0.7;margin-bottom:16px}.hero-h1{font-family:'Cormorant Garamond',serif;font-size:clamp(32px,4vw,60px);font-weight:300;letter-spacing:0.05em;margin-bottom:14px}.hero-h1 em{font-style:italic;color:var(--gold)}.hero-lead{font-size:13px;font-weight:300;color:rgba(255,255,255,0.38);max-width:680px;line-height:1.9;margin-bottom:30px}.hero-meta{display:flex;gap:30px;flex-wrap:wrap;margin-bottom:30px}.meta-item{font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.28)}.meta-item strong{color:rgba(217,176,98,0.6)}.hero-btns{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:40px}.btn-primary{font-size:10px;letter-spacing:0.22em;text-transform:uppercase;background:var(--gold);color:#030303;padding:14px 32px}.btn-secondary{font-size:10px;letter-spacing:0.22em;text-transform:uppercase;border:1px solid rgba(217,176,98,0.25);color:rgba(255,255,255,0.5);padding:14px 32px}.proj-gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;padding:0 60px 60px;max-width:1320px;margin:0 auto}.proj-gallery-item{aspect-ratio:4/3;overflow:hidden;cursor:pointer;background:#111}.proj-gallery-item img{width:100%;height:100%;object-fit:cover;transition:transform 0.5s}.proj-gallery-item:hover img{transform:scale(1.05)}.content-section{padding:50px 60px;max-width:1200px;margin:0 auto}.section-label{font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:var(--gold);opacity:0.6;margin-bottom:12px}.section-h2{font-family:'Cormorant Garamond',serif;font-size:clamp(24px,3vw,40px);font-weight:300;letter-spacing:0.06em;margin-bottom:20px}.section-h2 em{font-style:italic;color:var(--gold)}.spec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:rgba(217,176,98,0.06);border:1px solid rgba(217,176,98,0.08);margin:20px 0}.spec-cell{background:var(--ink);padding:20px 22px}.spec-label{font-size:8.5px;letter-spacing:0.28em;text-transform:uppercase;color:var(--gold);opacity:0.55;margin-bottom:6px}.spec-val{font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:300;color:rgba(255,255,255,0.7)}.uses-list{display:flex;flex-direction:column;gap:8px;margin:16px 0}.use-item{display:flex;align-items:flex-start;gap:14px;padding:12px 16px;border:1px solid rgba(217,176,98,0.07)}.use-dot{width:4px;height:4px;background:var(--gold);border-radius:50%;flex-shrink:0;margin-top:5px}.use-text{font-size:12px;font-weight:300;color:rgba(255,255,255,0.40);line-height:1.7}.cta-band{background:#06050A;border-top:1px solid rgba(217,176,98,0.08);padding:70px 60px;text-align:center}.cta-eyebrow{font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:var(--gold);opacity:0.65;margin-bottom:18px}.cta-h2{font-family:'Cormorant Garamond',serif;font-size:clamp(24px,4vw,46px);font-weight:300;letter-spacing:0.06em;margin-bottom:14px}.cta-h2 em{font-style:italic;color:var(--gold)}.cta-btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}.seo-footer{border-top:1px solid rgba(217,176,98,0.07);padding:32px 60px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}.seo-footer-nap{font-size:10px;color:rgba(255,255,255,0.18)}.seo-footer-nap strong{color:rgba(217,176,98,0.4)}.seo-footer-copy{font-size:9px;color:rgba(255,255,255,0.12)}#lb{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.94);z-index:9999;align-items:center;justify-content:center;flex-direction:column}#lb-img{max-width:90vw;max-height:80vh;object-fit:contain}.lb-close{position:absolute;top:20px;right:28px;font-size:28px;color:rgba(255,255,255,0.5);cursor:pointer;background:none;border:none}.lb-arrow{position:absolute;top:50%;transform:translateY(-50%);font-size:36px;color:rgba(255,255,255,0.4);cursor:pointer;background:none;border:none;padding:20px}#lb-prev{left:10px}#lb-next{right:10px}#lb-c{margin-top:16px;font-size:11px;color:rgba(255,255,255,0.3);letter-spacing:0.2em}@media(max-width:768px){.seo-nav{padding:14px 24px}.hero-seo,.content-section,.proj-gallery-grid,.cta-band,.seo-footer{padding-left:24px;padding-right:24px}.seo-nav-links{gap:14px}}</style></head><body>
<nav class="seo-nav"><a href="/" class="seo-nav-logo">Shraddha Saburi Stone</a><div class="seo-nav-links"><a href="/products" class="seo-nav-link">Products</a><a href="/projects" class="seo-nav-link">Projects</a><a href="/quote" class="seo-cta-btn">Get Quote</a></div></nav>
<div class="hero-seo"><div class="hero-eyebrow">${esc(project.category)}</div><h1 class="hero-h1">${esc(project.title).replace(/\s(\S+)$/, ' <em>$1</em>')}</h1><p class="hero-lead">${esc(project.description)}</p><div class="hero-meta"><div class="meta-item">Location <strong>${esc(project.location)}</strong></div><div class="meta-item">Year <strong>${esc(String(project.completionYear))}</strong></div><div class="meta-item">Images <strong>${imgs.length}</strong></div></div><div class="hero-btns"><a href="https://wa.me/${WA_NUMBER}" class="btn-primary" target="_blank" rel="noopener">Discuss Your Project</a><a href="/products" class="btn-secondary">View Products</a></div></div>
<div class="proj-gallery-grid">${galleryHtml}</div>
<div class="content-section"><div class="section-label">Materials Used</div><h2 class="section-h2">Stone & <em>Specifications</em></h2><div class="uses-list">${matsHtml}</div><div style="margin-top:28px"><div class="spec-grid">${specsHtml}</div></div></div>
<div class="cta-band"><div class="cta-eyebrow">Start Your Project</div><h2 class="cta-h2">Request a <em>Free Quote</em></h2><div class="cta-btns"><a href="https://wa.me/${WA_NUMBER}" class="btn-primary" target="_blank" rel="noopener">WhatsApp Us</a><a href="tel:+917023912171" class="btn-secondary">Call +91 7023912171</a></div></div>
<footer class="seo-footer"><address class="seo-footer-nap" style="font-style:normal"><strong>Shraddha Saburi Stone</strong> · G-15 RIICO Industrial Area, Jaisalmer, Rajasthan</address><span class="seo-footer-copy">© 2026 Shraddha Saburi Stone</span></footer>
<div id="lb" onclick="if(event.target===this)closeLightbox()"><button class="lb-close" onclick="closeLightbox()">✕</button><button class="lb-arrow" id="lb-prev" onclick="lbPrev()">‹</button><img id="lb-img" src="" alt="Project image"><button class="lb-arrow" id="lb-next" onclick="lbNext()">›</button><div id="lb-c"></div></div>
${lbJs}</body></html>`);
});

/* ── Quote request page + form ──────────────────────────────── */
app.get('/quote', (_req, res) => {
    res.set('Cache-Control', 'no-cache').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Request a Quote — Jaisalmer Stone | Shraddha Saburi Stone</title>
<meta name="description" content="Request a free quote for Jaisalmer sandstone. Upload drawings, PDFs, images. Specify size, quantity and finish. We respond within 24 hours.">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${SITE_URL}/quote">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}/quote">
<meta property="og:site_name" content="Shraddha Saburi Stone">
<meta property="og:title" content="Request a Free Quote — Jaisalmer Sandstone | Shraddha Saburi Stone">
<meta property="og:description" content="Request a free quote for Jaisalmer sandstone. Upload drawings, PDFs, images. We respond within 24 hours.">
<meta property="og:image" content="${SITE_URL}/public/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Request a Free Quote — Shraddha Saburi Stone">
<meta name="twitter:description" content="Request a free quote for Jaisalmer sandstone. Upload drawings or PDFs. We respond within 24 hours.">
<meta name="twitter:image" content="${SITE_URL}/public/og-image.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}:root{--gold:#D9B062;--ink:#030303}html{background:var(--ink)}
body{background:var(--ink);color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}
.seo-nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(3,3,3,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(217,176,98,0.1);padding:16px 60px;display:flex;align-items:center;justify-content:space-between}
.seo-nav-logo{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;letter-spacing:0.12em;color:rgba(255,255,255,0.8)}
.seo-nav-links{display:flex;gap:28px;align-items:center}.seo-nav-link{font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.35)}.seo-cta-btn{font-size:9px;letter-spacing:0.2em;text-transform:uppercase;background:var(--gold);color:#030303;padding:10px 22px}
.quote-wrap{padding:120px 60px 80px;max-width:820px;margin:0 auto}
.hero-eyebrow{font-size:10px;letter-spacing:0.4em;text-transform:uppercase;color:var(--gold);opacity:0.7;margin-bottom:16px}
.hero-h1{font-family:'Cormorant Garamond',serif;font-size:clamp(32px,4vw,60px);font-weight:300;letter-spacing:0.05em;margin-bottom:16px}
.hero-h1 em{font-style:italic;color:var(--gold)}
.hero-lead{font-size:13px;font-weight:300;color:rgba(255,255,255,0.38);line-height:1.9;margin-bottom:40px}
.form-group{margin-bottom:22px}
label{display:block;font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:8px}
input,select,textarea{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(217,176,98,0.15);color:#fff;padding:14px 16px;font-family:'Inter',sans-serif;font-size:13px;font-weight:300;outline:none;transition:border-color 0.3s}
input:focus,select:focus,textarea:focus{border-color:rgba(217,176,98,0.45)}
select option{background:#111;color:#fff}
textarea{resize:vertical;min-height:100px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.file-drop{border:1px dashed rgba(217,176,98,0.2);padding:32px;text-align:center;cursor:pointer;transition:border-color 0.3s;position:relative}
.file-drop:hover{border-color:rgba(217,176,98,0.4)}
.file-drop input[type="file"]{position:absolute;inset:0;opacity:0;cursor:pointer}
.file-drop-label{font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:6px}
.file-drop-sub{font-size:9px;letter-spacing:0.15em;color:rgba(217,176,98,0.4)}
.btn-submit{width:100%;background:var(--gold);color:#030303;border:none;padding:18px;font-family:'Inter',sans-serif;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;cursor:pointer;transition:background 0.3s;margin-top:12px}
.btn-submit:hover{background:#ECC870}
.wa-alt{text-align:center;margin-top:24px;font-size:11px;color:rgba(255,255,255,0.25)}
.wa-alt a{color:rgba(217,176,98,0.55);text-decoration:underline}
#form-msg{display:none;margin-top:16px;padding:16px;text-align:center;font-size:12px}
.success{background:rgba(0,200,100,0.08);border:1px solid rgba(0,200,100,0.2);color:rgba(200,255,200,0.7)}
.error{background:rgba(200,0,0,0.08);border:1px solid rgba(200,0,0,0.2);color:rgba(255,180,180,0.7)}
.seo-footer{border-top:1px solid rgba(217,176,98,0.07);padding:32px 60px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}
.seo-footer-nap{font-size:10px;color:rgba(255,255,255,0.18)}.seo-footer-nap strong{color:rgba(217,176,98,0.4)}.seo-footer-copy{font-size:9px;color:rgba(255,255,255,0.12)}
@media(max-width:768px){.seo-nav{padding:14px 24px}.quote-wrap,.seo-footer{padding-left:24px;padding-right:24px}.form-row{grid-template-columns:1fr}}
</style></head><body>
<nav class="seo-nav"><a href="/" class="seo-nav-logo">Shraddha Saburi Stone</a><div class="seo-nav-links"><a href="/products" class="seo-nav-link">Products</a><a href="/projects" class="seo-nav-link">Projects</a><a href="https://wa.me/${WA_NUMBER}" class="seo-cta-btn" target="_blank" rel="noopener">WhatsApp</a></div></nav>
<div class="quote-wrap">
  <div class="hero-eyebrow">Free Quote</div>
  <h1 class="hero-h1">Request a <em>Quote</em></h1>
  <p class="hero-lead">Share your project requirements and we'll respond within 24 hours with a detailed quotation. You can upload drawings, PDFs, images or specify dimensions below.</p>
  <form id="quoteForm" enctype="multipart/form-data">
    <div class="form-row">
      <div class="form-group"><label for="name">Your Name *</label><input type="text" id="name" name="name" required placeholder="Full name"></div>
      <div class="form-group"><label for="phone">Phone / WhatsApp *</label><input type="tel" id="phone" name="phone" required placeholder="+91 XXXXX XXXXX"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label for="email">Email Address</label><input type="email" id="email" name="email" placeholder="your@email.com"></div>
      <div class="form-group"><label for="product">Product / Material</label>
        <select id="product" name="product">
          <option value="">Select product...</option>
          <option>Jaisalmer Yellow Sandstone Slabs</option>
          <option>Stone Jali Screens</option>
          <option>Decorative Stone Pillars</option>
          <option>Stone Wall Cladding</option>
          <option>Custom Stone Carvings</option>
          <option>Temple Construction Stone</option>
          <option>Other / Not Sure</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label for="quantity">Quantity / Area</label><input type="text" id="quantity" name="quantity" placeholder="e.g. 200 sq ft, 10 panels"></div>
      <div class="form-group"><label for="size">Size / Dimensions</label><input type="text" id="size" name="size" placeholder="e.g. 60x30cm, 8ft height"></div>
    </div>
    <div class="form-group"><label for="finish">Finish Required</label>
      <select id="finish" name="finish">
        <option value="">Select finish...</option>
        <option>Natural (rough quarry)</option>
        <option>Honed (smooth matte)</option>
        <option>Bush-hammered (textured)</option>
        <option>Sawn (machine cut)</option>
        <option>Not Sure</option>
      </select>
    </div>
    <div class="form-group"><label for="message">Project Description</label><textarea id="message" name="message" placeholder="Describe your project, timeline, delivery location, and any special requirements..."></textarea></div>
    <div class="form-group">
      <label>Upload Drawing / PDF / Image (optional)</label>
      <div class="file-drop">
        <input type="file" name="files" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.dwg,.dxf">
        <div class="file-drop-label">Drop files here or click to browse</div>
        <div class="file-drop-sub">JPG · PNG · PDF · DWG · DXF · Max 10MB per file · Up to 5 files</div>
      </div>
    </div>
    <button type="submit" class="btn-submit">Send Quote Request</button>
    <div class="wa-alt">Or message us directly on <a href="https://wa.me/${WA_NUMBER}" target="_blank" rel="noopener">WhatsApp +91 9649299121</a></div>
    <div id="form-msg"></div>
  </form>
</div>
<footer class="seo-footer"><address class="seo-footer-nap" style="font-style:normal"><strong>Shraddha Saburi Stone</strong> · G-15 RIICO Industrial Area, Jaisalmer, Rajasthan 345001 · <a href="tel:+917023912171" style="color:inherit">+91 7023912171</a></address><span class="seo-footer-copy">© 2026 Shraddha Saburi Stone</span></footer>
<script>
document.getElementById('quoteForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = this.querySelector('.btn-submit');
  btn.textContent = 'Sending...'; btn.disabled = true;
  const fd = new FormData(this);
  try {
    const r = await fetch('/api/quote', { method: 'POST', body: fd });
    const d = await r.json();
    const msg = document.getElementById('form-msg');
    msg.style.display = 'block';
    if (r.ok) {
      msg.className = 'success';
      msg.textContent = 'Quote request sent! We will contact you within 24 hours. You can also WhatsApp us at +91 9649299121.';
      this.reset();
      // Also open WhatsApp
      const name = fd.get('name'), phone = fd.get('phone'), product = fd.get('product'), msg2 = fd.get('message');
      const wa = 'Hi, I am ' + name + ' (' + phone + '). I need a quote for: ' + (product||'Jaisalmer Stone') + '. ' + (msg2||'');
      setTimeout(() => window.open('https://wa.me/${WA_NUMBER}?text=' + encodeURIComponent(wa), '_blank'), 1000);
    } else {
      msg.className = 'error';
      msg.textContent = d.error || 'Something went wrong. Please WhatsApp us at +91 9649299121.';
    }
  } catch {
    const msg = document.getElementById('form-msg');
    msg.style.display = 'block'; msg.className = 'error';
    msg.textContent = 'Network error. Please WhatsApp us at +91 9649299121 directly.';
  }
  btn.textContent = 'Send Quote Request'; btn.disabled = false;
});
document.querySelector('.file-drop input').addEventListener('change', function() {
  const lbl = document.querySelector('.file-drop-label');
  if (this.files.length) lbl.textContent = this.files.length + ' file(s) selected';
});
</script>
</body></html>`);
});

/* ── Quote API ───────────────────────────────────────────────── */
app.post('/api/quote', quoteLimiter, upload.array('files', 5), (req, res) => {
    const { name, phone, email, product, quantity, size, finish, message } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });
    const quote = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        name, phone, email, product, quantity, size, finish, message,
        files: (req.files || []).map(f => f.filename)
    };
    const quotesFile = path.join(__dirname, 'data', 'quotes.json');
    let quotes = [];
    try { quotes = JSON.parse(fs.readFileSync(quotesFile, 'utf8')); } catch {}
    quotes.unshift(quote);
    fs.writeFileSync(quotesFile, JSON.stringify(quotes, null, 2));
    res.json({ ok: true, message: 'Quote request received.' });
});

/* ── Search page + API ──────────────────────────────────────── */
app.get('/search', (_req, res) => {
    res.set('Cache-Control', 'no-cache').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Search — Shraddha Saburi Stone</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}:root{--gold:#D9B062;--ink:#030303}html{background:var(--ink)}body{background:var(--ink);color:#fff;font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}.seo-nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(3,3,3,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(217,176,98,0.1);padding:16px 60px;display:flex;align-items:center;justify-content:space-between}.seo-nav-logo{font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;letter-spacing:0.12em;color:rgba(255,255,255,0.8)}.seo-nav-links{display:flex;gap:28px;align-items:center}.seo-nav-link{font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.35)}.seo-cta-btn{font-size:9px;letter-spacing:0.2em;text-transform:uppercase;background:var(--gold);color:#030303;padding:10px 22px}.search-wrap{padding:120px 60px 80px;max-width:900px;margin:0 auto}.hero-h1{font-family:'Cormorant Garamond',serif;font-size:clamp(28px,4vw,52px);font-weight:300;letter-spacing:0.05em;margin-bottom:28px}.hero-h1 em{font-style:italic;color:var(--gold)}.search-bar{display:flex;gap:0;margin-bottom:40px}.search-input{flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(217,176,98,0.2);color:#fff;padding:16px 20px;font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:border-color 0.3s}.search-input:focus{border-color:rgba(217,176,98,0.5)}.search-btn{background:var(--gold);color:#030303;border:none;padding:0 28px;font-family:'Inter',sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;cursor:pointer}.results{display:flex;flex-direction:column;gap:2px}.result-item{background:rgba(255,255,255,0.02);border:1px solid rgba(217,176,98,0.07);padding:22px 24px;cursor:pointer;transition:background 0.3s}.result-item:hover{background:rgba(217,176,98,0.04)}.result-type{font-size:8.5px;letter-spacing:0.28em;text-transform:uppercase;color:rgba(217,176,98,0.45);margin-bottom:6px}.result-title{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;color:rgba(255,255,255,0.75);margin-bottom:5px}.result-desc{font-size:11px;font-weight:300;color:rgba(255,255,255,0.28);line-height:1.7}.no-results{text-align:center;padding:60px;font-size:13px;color:rgba(255,255,255,0.25)}.suggestions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:32px}.suggestion{font-size:9px;letter-spacing:0.18em;text-transform:uppercase;border:1px solid rgba(217,176,98,0.18);color:rgba(217,176,98,0.55);padding:8px 16px;cursor:pointer;transition:all 0.2s}.suggestion:hover{border-color:var(--gold);color:var(--gold)}@media(max-width:768px){.seo-nav{padding:14px 24px}.search-wrap{padding-left:24px;padding-right:24px}}</style></head><body>
<nav class="seo-nav"><a href="/" class="seo-nav-logo">Shraddha Saburi Stone</a><div class="seo-nav-links"><a href="/products" class="seo-nav-link">Products</a><a href="/projects" class="seo-nav-link">Projects</a><a href="/quote" class="seo-cta-btn">Get Quote</a></div></nav>
<div class="search-wrap">
  <h1 class="hero-h1">Search <em>Our Stone</em></h1>
  <div class="search-bar"><input class="search-input" id="q" type="search" placeholder="Search jali, sandstone, temple, cladding..." autofocus><button class="search-btn" onclick="doSearch()">Search</button></div>
  <div class="suggestions"><span class="suggestion" onclick="setQ('Jaisalmer stone')">Jaisalmer Stone</span><span class="suggestion" onclick="setQ('jali')">Jali</span><span class="suggestion" onclick="setQ('temple')">Temple</span><span class="suggestion" onclick="setQ('cladding')">Cladding</span><span class="suggestion" onclick="setQ('pillars')">Pillars</span><span class="suggestion" onclick="setQ('carvings')">Carvings</span><span class="suggestion" onclick="setQ('export')">Export</span></div>
  <div id="results"></div>
</div>
<script>
let _index = null;
async function loadIndex() {
  if (_index) return _index;
  const r = await fetch('/api/search-index');
  _index = await r.json();
  return _index;
}
function setQ(q) { document.getElementById('q').value = q; doSearch(); }
document.getElementById('q').addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });
// Support SearchAction URL parameter: /search?q=query
(function() {
  const q = new URLSearchParams(location.search).get('q');
  if (q) { document.getElementById('q').value = q; doSearch(); }
})();
async function doSearch() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const out = document.getElementById('results');
  if (!q) { out.innerHTML = ''; return; }
  const idx = await loadIndex();
  const hits = idx.filter(item => {
    const t = (item.title + ' ' + item.description + ' ' + (item.tags||'')).toLowerCase();
    return q.split(' ').every(w => t.includes(w));
  });
  if (!hits.length) { out.innerHTML = '<div class="no-results">No results found. Try: jali, sandstone, temple, pillars, cladding.</div>'; return; }
  out.innerHTML = '<div class="results">' + hits.map(h => \`<a href="\${h.url}" class="result-item"><div class="result-type">\${h.type}</div><div class="result-title">\${h.title}</div><div class="result-desc">\${h.description}</div></a>\`).join('') + '</div>';
}
</script>
</body></html>`);
});

/* ── Search index API ────────────────────────────────────────── */
app.get('/api/search-index', (_req, res) => {
    const products = loadJSON('products.json');
    const projects = loadJSON('projects.json');
    const index = [
        ...products.map(p => ({
            type: 'Product', title: p.name, description: p.tagline + ' — ' + p.description.substring(0, 100),
            url: `/product/${p.slug}`,
            tags: (p.applications || []).join(' ') + ' ' + (p.seo?.keywords || '')
        })),
        ...projects.map(p => ({
            type: 'Project Gallery', title: p.title, description: p.tagline + ' — ' + p.description.substring(0, 100),
            url: `/project/${p.slug}`, tags: p.category + ' ' + p.location
        })),
        ...SEO_PAGES.map(slug => ({
            type: 'Guide', title: slugToTitle(slug),
            description: 'Detailed information about ' + slugToTitle(slug) + ' — Shraddha Saburi Stone',
            url: `/seo/${slug}`, tags: slug.replace(/-/g, ' ')
        })),
        { type: 'Page', title: 'Request a Quote', description: 'Upload drawings, PDFs and get a free quote within 24 hours', url: '/quote', tags: 'quote price order' },
        { type: 'Page', title: 'Category Gallery', description: 'Browse product galleries by category', url: '/category', tags: 'gallery images photos' }
    ];
    res.set('Cache-Control', 'public, max-age=300').json(index);
});

/* ── Products + Projects API ─────────────────────────────────── */
app.get('/api/products',  (_req, res) => res.json(loadJSON('products.json')));
app.get('/api/projects',  (_req, res) => res.json(loadJSON('projects.json')));

/* ── Quotes API (admin) ──────────────────────────────────────── */
app.get('/api/quotes', adminLimiter, (req, res) => {
    if (req.headers['x-admin-key'] !== ADMIN_PASS) return res.status(401).json({ error: 'Unauthorized' });
    res.json(loadJSON('quotes.json'));
});

/* ── Categories API ─────────────────────────────────────────── */
app.get('/api/categories', (_req, res) => {
    const cats = discoverCategories();
    res.json(cats.map(key => ({ key, label: CAT_LABELS[key] || slugToTitle(key) })));
});

/* ── Assets API ─────────────────────────────────────────────── */
app.get('/api/assets/:category', (req, res) => {
    const cat = req.params.category.replace(/[^a-z0-9-]/gi, '');
    const catVideos = listFiles(path.join(__dirname, 'public', 'videos', cat), VIDEO_EXTS, `/public/videos/${cat}`);
    const videos = catVideos.length
        ? catVideos
        : listFiles(path.join(__dirname, 'public', 'videos', 'shared'), VIDEO_EXTS, '/public/videos/shared');
    res.json({
        images: listFiles(path.join(__dirname, 'public', 'images', cat), IMAGE_EXTS, `/public/images/${cat}`),
        videos
    });
});

/* ── Admin product CRUD ──────────────────────────────────────── */
function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'] || req.body?.adminKey;
    if (key !== ADMIN_PASS) return res.status(401).json({ error: 'Unauthorized' });
    next();
}
app.post('/api/admin/products',        adminLimiter, adminAuth, (req, res) => {
    const products = loadJSON('products.json');
    const p = req.body;
    if (!p.slug || !p.name) return res.status(400).json({ error: 'slug and name required' });
    if (products.find(x => x.slug === p.slug)) return res.status(409).json({ error: 'Slug already exists' });
    products.push(p); saveJSON('products.json', products);
    res.json({ ok: true, product: p });
});
app.put('/api/admin/products/:slug',   adminLimiter, adminAuth, (req, res) => {
    let products = loadJSON('products.json');
    const idx = products.findIndex(x => x.slug === req.params.slug);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    products[idx] = { ...products[idx], ...req.body };
    saveJSON('products.json', products);
    res.json({ ok: true });
});
app.delete('/api/admin/products/:slug', adminLimiter, adminAuth, (req, res) => {
    let products = loadJSON('products.json');
    products = products.filter(x => x.slug !== req.params.slug);
    saveJSON('products.json', products);
    res.json({ ok: true });
});
app.post('/api/admin/projects', adminLimiter, adminAuth, (req, res) => {
    const projects = loadJSON('projects.json');
    const p = req.body;
    if (!p.slug || !p.title) return res.status(400).json({ error: 'slug and title required' });
    projects.push(p); saveJSON('projects.json', projects);
    res.json({ ok: true });
});

/* ── Admin image upload ──────────────────────────────────────── */
const adminUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const cat = (req.params.category || 'uncategorized').replace(/[^a-z0-9-]/gi,'');
            const dir = path.join(__dirname, 'public', 'images', cat);
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const ext  = path.extname(file.originalname).toLowerCase();
            const name = `${Date.now()}-${Math.random().toString(36).slice(2,7)}${ext}`;
            cb(null, name);
        }
    }),
    limits: { fileSize: 20 * 1024 * 1024, files: 20 },
    fileFilter: (req, file, cb) => cb(null, IMAGE_EXTS.has(path.extname(file.originalname)))
});

app.post('/api/admin/upload/:category', adminLimiter, adminAuth, adminUpload.array('images', 20), (req, res) => {
    const uploaded = (req.files || []).map(f => `/public/images/${req.params.category}/${f.filename}`);
    res.json({ ok: true, files: uploaded });
});

/* ── robots.txt ─────────────────────────────────────────────── */
app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *
Allow: /
Allow: /seo/
Allow: /products
Allow: /product/
Allow: /projects
Allow: /project/
Allow: /category
Allow: /quote
Allow: /search
Disallow: /api/
Disallow: /admin
Disallow: /uploads/
Disallow: /public/videos/

User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: ClaudeBot
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
Sitemap: ${SITE_URL}/sitemap-images.xml
Sitemap: ${SITE_URL}/sitemap-products.xml
Sitemap: ${SITE_URL}/sitemap-videos.xml
`);
});

/* ── Main sitemap ────────────────────────────────────────────── */
app.get('/sitemap.xml', (_req, res) => {
    const now  = new Date().toISOString().split('T')[0];
    const cats = discoverCategories();
    const products = loadJSON('products.json');
    const projects = loadJSON('projects.json');
    const urls = [
        { loc: `${SITE_URL}/`,          priority: '1.0',  freq: 'weekly'  },
        { loc: `${SITE_URL}/products`,  priority: '0.95', freq: 'weekly'  },
        { loc: `${SITE_URL}/projects`,  priority: '0.90', freq: 'monthly' },
        { loc: `${SITE_URL}/quote`,     priority: '0.85', freq: 'monthly' },
        ...cats.map(c  => ({ loc: `${SITE_URL}/category?cat=${c}`,  priority: '0.85', freq: 'weekly'  })),
        ...products.map(p => ({ loc: `${SITE_URL}/product/${p.slug}`,  priority: '0.88', freq: 'monthly' })),
        ...projects.map(p => ({ loc: `${SITE_URL}/project/${p.slug}`,  priority: '0.80', freq: 'monthly' })),
        ...SEO_PAGES.map(p => ({ loc: `${SITE_URL}/seo/${p}`,           priority: '0.82', freq: 'monthly' })),
    ];
    const body = urls.map(u => `  <url>\n    <loc>${esc(u.loc)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`);
});

/* ── Product sitemap ─────────────────────────────────────────── */
app.get('/sitemap-products.xml', (_req, res) => {
    const now  = new Date().toISOString().split('T')[0];
    const products = loadJSON('products.json');
    const body = products.map(p => {
        const imgs = listFiles(path.join(__dirname, 'public', 'images', p.category), IMAGE_EXTS, `/public/images/${p.category}`);
        const imgTags = imgs.slice(0,5).map(f => `    <image:image><image:loc>${esc(SITE_URL+f)}</image:loc><image:title>${esc(p.name)}</image:title></image:image>`).join('\n');
        return `  <url>\n    <loc>${esc(SITE_URL+'/product/'+p.slug)}</loc>\n    <lastmod>${now}</lastmod>\n    <priority>0.88</priority>\n${imgTags}\n  </url>`;
    }).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>`);
});

/* ── Image sitemap ───────────────────────────────────────────── */
app.get('/sitemap-images.xml', (_req, res) => {
    const entries = discoverCategories().map(cat => {
        const imgs = listFiles(path.join(__dirname,'public','images',cat),IMAGE_EXTS,`/public/images/${cat}`);
        if (!imgs.length) return '';
        const imgTags = imgs.map(f => `    <image:image><image:loc>${esc(SITE_URL+f)}</image:loc><image:title>${esc(SITE_NAME+' - '+(CAT_LABELS[cat]||cat))}</image:title><image:geo_location>Jaisalmer, Rajasthan, India</image:geo_location></image:image>`).join('\n');
        return `  <url>\n    <loc>${esc(SITE_URL+'/category?cat='+cat)}</loc>\n${imgTags}\n  </url>`;
    }).filter(Boolean).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries}
</urlset>`);
});

/* ── Video sitemap ───────────────────────────────────────────── */
app.get('/sitemap-videos.xml', (_req, res) => {
    const entries = discoverCategories().map(cat => {
        const catVids = listFiles(path.join(__dirname,'public','videos',cat),VIDEO_EXTS,`/public/videos/${cat}`);
        const vids = catVids.length ? catVids : listFiles(path.join(__dirname,'public','videos','shared'),VIDEO_EXTS,'/public/videos/shared');
        if (!vids.length) return '';
        const vidTags = vids.map(f => `    <video:video><video:thumbnail_loc>${esc(SITE_URL+'/public/og-image.jpg')}</video:thumbnail_loc><video:title>${esc(SITE_NAME+' - '+(CAT_LABELS[cat]||cat))}</video:title><video:content_loc>${esc(SITE_URL+f)}</video:content_loc><video:duration>60</video:duration><video:family_friendly>yes</video:family_friendly></video:video>`).join('\n');
        return `  <url>\n    <loc>${esc(SITE_URL+'/category?cat='+cat)}</loc>\n${vidTags}\n  </url>`;
    }).filter(Boolean).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${entries}
</urlset>`);
});

/* ── Static files (MUST be before 404 handler) ───────────────── */
app.get('/favicon.ico',      (_req, res) => res.sendFile(path.join(__dirname,'public','favicon.ico')));
app.get('/site.webmanifest', (_req, res) => res.sendFile(path.join(__dirname,'public','site.webmanifest')));
app.use('/public', express.static(path.join(__dirname,'public'), {
    maxAge: '7d', acceptRanges: true,
    setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (IMAGE_EXTS.has(ext)) res.setHeader('Cache-Control','public,max-age=604800,immutable');
        else if (VIDEO_EXTS.has(ext)) res.setHeader('Cache-Control','public,max-age=3600,must-revalidate');
    }
}));
app.use('/uploads', express.static(path.join(__dirname,'uploads'), { maxAge: '0' }));

/* ── 404 page ────────────────────────────────────────────────── */
app.use((req, res) => {
    res.status(404).set('Cache-Control', 'no-cache').send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page Not Found | Shraddha Saburi Stone</title>
<meta name="robots" content="noindex">
<style>*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}body{background:#030303;color:#fff;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:40px}h1{font-size:80px;font-weight:300;color:rgba(217,176,98,0.2);line-height:1;margin-bottom:16px}p{font-size:13px;color:rgba(255,255,255,0.3);margin-bottom:30px}a{color:#D9B062;text-decoration:none;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;border:1px solid rgba(217,176,98,0.25);padding:12px 28px;margin:6px;display:inline-block}</style></head>
<body><div><h1>404</h1><p>This page doesn't exist.</p><a href="/">Home</a><a href="/products">Products</a><a href="/quote">Get Quote</a></div></body></html>`);
});

/* ── Start ───────────────────────────────────────────────────── */
app.listen(PORT, () => {
    console.log('\n  ◆  SHRADDHA SABURI STONE — Phase 3');
    console.log(`  ◆  http://localhost:${PORT}`);
    console.log(`  ◆  Products: http://localhost:${PORT}/products`);
    console.log(`  ◆  Projects: http://localhost:${PORT}/projects`);
    console.log(`  ◆  Quote:    http://localhost:${PORT}/quote`);
    console.log(`  ◆  Search:   http://localhost:${PORT}/search\n`);
    watermark.init();
});
