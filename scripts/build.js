#!/usr/bin/env node
/*
 * NoVA Party Venues - static page generator.
 *
 * Reads public/data.js (the single source of truth) and writes:
 *   public/venues/<slug>/index.html   one page per venue
 *   public/venues/index.html          all venues, grouped by city
 *   public/cities/<slug>/index.html   one page per city with enough venues
 *   public/types/<slug>/index.html    one page per venue type with enough venues
 *   public/assets/style.css           shared styles for generated pages
 *   public/assets/slugs.js            name -> slug map used by the search page
 *   public/sitemap.xml, robots.txt, 404.html
 * and refreshes the "browse" block inside public/index.html.
 *
 * Run from the repo root:  node scripts/build.js
 * Generated folders are deleted and rebuilt each run, so never edit them by hand.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SITE = 'https://novapartyvenues.com';
const BRAND = 'NoVA Party Venues';
const MIN_PAGE = 3;            // minimum venues before a city or type gets its own page
const CONTACT = null;          // set to a real email address to show a "claim your listing" line
const TODAY = new Date().toISOString().slice(0, 10);
const REVIEWED = 'November 2026';

global.window = {};
require(path.join(PUB, 'data.js'));
const ALL = window.VENUES;

/* ---------- helpers ---------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const money = (n) => '$' + (n % 1 ? n.toFixed(2) : n.toLocaleString('en-US'));
const typeLabel = (t) => { const p = t.split(' / '); return p.length > 1 ? p.slice(0, -1).join(', ') + ' & ' + p[p.length - 1] : p[0]; };
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const groupBy = (arr, key) => arr.reduce((m, v) => ((m[v[key]] = m[v[key]] || []).push(v), m), {});
const rank = (a, b) => (b.m || 0) - (a.m || 0) || a.n.localeCompare(b.n);
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const joinList = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

const cityLine = (v) => (v.c === 'Mobile' ? 'Mobile service' : v.c === 'Unknown' ? 'Virginia' : v.c + ', VA');
const sizeText = (v) => (v.mn != null && v.mx != null ? v.mn + '-' + v.mx + ' guests' : v.mx != null ? 'Up to ' + v.mx + ' guests' : v.mn != null ? 'Minimum ' + v.mn + ' guests' : 'Ask the venue');
const ageText = (v) => (v.age ? (v.age === 'All ages' ? 'All ages' : 'Ages ' + v.age) : 'Ask the venue');
const foodText = (v) => ({ Yes: 'Food included in packages', 'Add-on': 'Food available as an add-on', No: 'Bring your own food' }[v.f] || 'Ask the venue');
const cateringText = (v) => ({ Yes: 'Outside food allowed', 'Cake only': 'Outside cake or cupcakes only' }[v.k] || 'Not stated');
const priceText = (v) => (v.pr != null ? 'From ' + money(v.pr) : 'Not published');

function parseAddr(a) {
  const m = a.match(/^(.*),\s*([^,]+),\s*(?:VA|Virginia)\s*(\d{5}(?:-\d{4})?)?$/);
  return m
    ? { '@type': 'PostalAddress', streetAddress: m[1], addressLocality: m[2], addressRegion: 'VA', postalCode: m[3], addressCountry: 'US' }
    : { '@type': 'PostalAddress', streetAddress: a, addressRegion: 'VA', addressCountry: 'US' };
}

/* ---------- enrich + group ---------- */
const used = new Set();
for (const v of ALL) {
  v.slug = slugify(v.n);
  if (used.has(v.slug)) throw new Error('Duplicate slug: ' + v.slug);
  used.add(v.slug);
  v.index = !v.fl;            // venues flagged "details to confirm" get noindex and no sitemap entry
}
const LIVE = ALL.filter((v) => v.index);
const placed = LIVE.filter((v) => v.c !== 'Unknown' && v.c !== 'Mobile');
const byCity = groupBy(placed, 'c');
const byType = groupBy(LIVE, 't');
const bigFirst = (g) => (a, b) => g[b].length - g[a].length || a.localeCompare(b);
const cities = Object.keys(byCity).filter((c) => byCity[c].length >= MIN_PAGE).sort(bigFirst(byCity));
const types = Object.keys(byType).filter((t) => byType[t].length >= MIN_PAGE).sort(bigFirst(byType));
const cityHas = new Set(cities);
const typeHas = new Set(types);
const cityUrl = (c) => '/cities/' + slugify(c) + '/';
const typeUrl = (t) => '/types/' + slugify(t) + '/';
const venueUrl = (v) => '/venues/' + v.slug + '/';

/* ---------- output ---------- */
for (const d of ['venues', 'cities', 'types']) fs.rmSync(path.join(PUB, d), { recursive: true, force: true });
const written = [];
function write(rel, content) {
  const f = path.join(PUB, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
  written.push(rel);
}

/* ---------- shared pieces ---------- */
function footer() {
  const cl = cities.map((c) => '<a href="' + cityUrl(c) + '">' + esc(c) + '</a>').join(' &middot; ');
  const tl = types.map((t) => '<a href="' + typeUrl(t) + '">' + esc(typeLabel(t)) + '</a>').join(' &middot; ');
  return '<footer class="site-foot">\n' +
    '<p><strong>Cities:</strong> ' + cl + '</p>\n' +
    '<p><strong>Venue types:</strong> ' + tl + '</p>\n' +
    (CONTACT ? '<p><strong>Own a venue?</strong> <a href="mailto:' + esc(CONTACT) + '">Claim or correct your listing</a>.</p>\n' : '') +
    '<p>Prices and policies are gathered from venue websites, last reviewed ' + REVIEWED + ', and can change. "Starting price" is the lowest total package price we found, not a quote. Always confirm details and availability with the venue before booking.</p>\n' +
    '</footer>';
}

function layout(o) {
  const url = SITE + o.path;
  const ld = (o.jsonld || []).map((j) => '<script type="application/ld+json">' + JSON.stringify(j).replace(/</g, '\\u003c') + '</script>').join('\n');
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(o.title) + '</title>\n' +
    '<meta name="description" content="' + esc(o.desc) + '">\n' +
    '<link rel="canonical" href="' + url + '">\n' +
    (o.noindex ? '<meta name="robots" content="noindex, follow">\n' : '') +
    '<meta property="og:type" content="website">\n<meta property="og:site_name" content="' + BRAND + '">\n' +
    '<meta property="og:title" content="' + esc(o.title) + '">\n<meta property="og:description" content="' + esc(o.desc) + '">\n' +
    '<meta property="og:url" content="' + url + '">\n' +
    '<link rel="stylesheet" href="/assets/style.css">\n' + ld + '\n</head>\n<body>\n' +
    '<header class="site-bar"><a class="brand" href="/">' + BRAND + '</a><nav><a href="/">Search venues</a><a href="/venues/">All venues</a></nav></header>\n' +
    '<main class="page">\n' + o.body + '\n</main>\n' + footer() + '\n</body>\n</html>\n';
}

function crumbs(items) {
  const html = '<nav class="crumbs" aria-label="Breadcrumb">' +
    items.map((c, i) => (i < items.length - 1 ? '<a href="' + c.url + '">' + esc(c.name) + '</a>' : '<span>' + esc(c.name) + '</span>')).join(' &rsaquo; ') + '</nav>';
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + c.url })) };
  return { html, ld };
}

function itemList(list) {
  return { '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: list.map((v, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + venueUrl(v), name: v.n })) };
}

function card(v) {
  return '<article class="card">' +
    (v.m >= 3 ? '<span class="badge rec">Recommended by neighbors</span>' : '') +
    '<h3><a href="' + venueUrl(v) + '">' + esc(v.n) + '</a></h3>' +
    '<div class="meta">' + esc(typeLabel(v.t)) + ' &middot; ' + esc(cityLine(v)) + '</div>' +
    '<div class="price">' + (v.pr != null ? 'From ' + money(v.pr) : '<span class="meta">Price not published</span>') + '</div>' +
    '<div class="meta">' + esc(sizeText(v)) + ' &middot; ' + esc(ageText(v)) + ' &middot; ' + esc(v.s) + '</div>' +
    (v.pn ? '<p class="meta">' + esc(v.pn) + '</p>' : '') + '</article>';
}
const grid = (list) => '<div class="grid">' + list.map(card).join('\n') + '</div>';

/* ---------- venue pages ---------- */
function venuePage(v) {
  const peers = LIVE.filter((o) => o !== v);
  const sameCity = peers.filter((o) => o.c === v.c && v.c !== 'Unknown' && v.c !== 'Mobile').sort(rank).slice(0, 4);
  const sameType = peers.filter((o) => o.t === v.t && !sameCity.includes(o)).sort((a, b) => (b.c === v.c) - (a.c === v.c) || rank(a, b)).slice(0, 4);

  const trail = [{ name: 'Home', url: '/' }];
  if (cityHas.has(v.c)) trail.push({ name: v.c, url: cityUrl(v.c) }); else trail.push({ name: 'All venues', url: '/venues/' });
  trail.push({ name: v.n, url: venueUrl(v) });
  const bc = crumbs(trail);

  const rows = [['Starting price', priceText(v)], ['Party size', sizeText(v)], ['Ages', ageText(v)], ['Setting', v.s], ['Food', foodText(v)], ['Outside food', cateringText(v)]];
  let facts = rows.map((r) => '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>').join('');
  if (v.a) facts += '<dt>Address</dt><dd><a href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(v.a) + '" target="_blank" rel="noopener">' + esc(v.a) + '</a></dd>';
  if (v.p) facts += '<dt>Phone</dt><dd><a href="tel:' + esc(v.p.replace(/[^0-9+]/g, '')) + '">' + esc(v.p) + '</a></dd>';
  if (v.w) facts += '<dt>Website</dt><dd><a href="' + esc(v.w) + '" target="_blank" rel="noopener nofollow">Official party information</a></dd>';

  const flag = v.fl ? '<p class="notice">Some details for this listing are unconfirmed. Please contact the venue directly before planning around it.</p>' : '';
  const body = bc.html + '\n<h1>' + esc(v.n) + '</h1>\n' +
    '<p class="lead">' + esc(typeLabel(v.t)) + ' &middot; ' + esc(cityLine(v)) + '</p>\n' +
    (v.m >= 3 ? '<p><span class="badge rec">Recommended by neighbors</span> Suggested by several local parents.</p>\n' : '') + flag +
    '<dl class="facts">' + facts + '</dl>\n' +
    (v.pn ? '<h2>Pricing and details</h2>\n<p>' + esc(v.pn) + '.</p>\n' : '') +
    '<div class="actions">' + (v.w ? '<a class="btn primary" href="' + esc(v.w) + '" target="_blank" rel="noopener nofollow">Visit venue website</a>' : '') +
    (v.p ? '<a class="btn" href="tel:' + esc(v.p.replace(/[^0-9+]/g, '')) + '">Call</a>' : '') + '</div>\n' +
    '<p class="small">Last reviewed ' + REVIEWED + '. Prices and policies change, so confirm with the venue before booking.</p>\n' +
    (sameCity.length ? '<h2>More venues in ' + esc(v.c) + '</h2>\n' + grid(sameCity) + '\n' : '') +
    (sameType.length ? '<h2>Similar venues: ' + esc(typeLabel(v.t)) + '</h2>\n' + grid(sameType) + '\n' : '') +
    '<p><a href="/">Search and filter all venues</a></p>';

  const ld = [bc.ld];
  if (v.a) {
    const biz = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: v.n, address: parseAddr(v.a) };
    if (v.p) biz.telephone = v.p;
    if (v.w) biz.url = v.w;
    ld.push(biz);
  }
  const bits = [v.n + ' (' + typeLabel(v.t) + ') in ' + cityLine(v) + '.'];
  if (v.pr != null) bits.push('Packages from ' + money(v.pr) + '.');
  if (v.mx != null) bits.push('Up to ' + v.mx + ' guests.');
  bits.push('Compare prices, ages and food policies.');
  return layout({ title: clip(v.n + ' | Kids’ Birthday Parties, ' + cityLine(v), 70), desc: clip(bits.join(' '), 155), path: venueUrl(v), body, noindex: !!v.fl, jsonld: ld });
}
for (const v of ALL) write('venues/' + v.slug + '/index.html', venuePage(v));

/* ---------- city + type pages ---------- */
function settingSentence(list) {
  const n = (s) => list.filter((v) => v.s === s).length;
  const parts = [];
  if (n('Indoor')) parts.push(n('Indoor') + ' indoor');
  if (n('Outdoor')) parts.push(n('Outdoor') + ' outdoor');
  if (n('Both')) parts.push(n('Both') + ' offering both');
  return parts.length ? 'By setting, ' + joinList(parts) + '.' : '';
}
function priceSentence(list) {
  const p = list.filter((v) => v.pr != null).map((v) => v.pr);
  return p.length >= 2 ? 'Published starting prices range from ' + money(Math.min(...p)) + ' to ' + money(Math.max(...p)) + ' (' + p.length + ' of ' + list.length + ' venues list one).' : '';
}
function topCounts(list, key, fmt, k) {
  const m = list.reduce((a, v) => ((a[v[key]] = (a[v[key]] || 0) + 1), a), {});
  return Object.keys(m).sort((a, b) => m[b] - m[a] || a.localeCompare(b)).slice(0, k).map((x) => fmt(x) + ' (' + m[x] + ')');
}

function cityPage(c) {
  const list = byCity[c].slice().sort(rank);
  const intro = 'We’ve researched ' + plural(list.length, 'place') + ' to host a child’s birthday party in ' + c + ', Virginia. ' +
    'The most common types are ' + joinList(topCounts(list, 't', typeLabel, 3)) + '. ' + priceSentence(list) + ' ' + settingSentence(list);
  const bc = crumbs([{ name: 'Home', url: '/' }, { name: c, url: cityUrl(c) }]);
  const others = cities.filter((x) => x !== c).map((x) => '<a href="' + cityUrl(x) + '">' + esc(x) + '</a>').join(' &middot; ');
  const body = bc.html + '\n<h1>Kids’ Birthday Party Venues in ' + esc(c) + ', VA</h1>\n<p class="lead">' + esc(intro.replace(/\s+/g, ' ').trim()) + '</p>\n' +
    '<p><a href="/">Use the search page to filter by price, guest count, age and food policy.</a></p>\n' +
    '<h2>' + plural(list.length, 'venue') + ' in ' + esc(c) + '</h2>\n' + grid(list) + '\n<h2>Other cities</h2>\n<p>' + others + '</p>';
  return layout({ title: clip('Kids’ Birthday Party Venues in ' + c + ', VA | ' + BRAND, 70),
    desc: clip(plural(list.length, 'birthday party venue') + ' in ' + c + ', VA. ' + priceSentence(list) + ' Compare ages, party size and food rules.', 155),
    path: cityUrl(c), body, jsonld: [bc.ld, itemList(list)] });
}
function typePage(t) {
  const list = byType[t].slice().sort(rank);
  const label = typeLabel(t);
  const intro = 'We’ve researched ' + plural(list.length, 'option') + ' in this category across Northern Virginia. ' +
    'Most are in ' + joinList(topCounts(list.filter((v) => v.c !== 'Unknown' && v.c !== 'Mobile'), 'c', (x) => x, 3)) + '. ' + priceSentence(list) + ' ' + settingSentence(list);
  const bc = crumbs([{ name: 'Home', url: '/' }, { name: label, url: typeUrl(t) }]);
  const others = types.filter((x) => x !== t).map((x) => '<a href="' + typeUrl(x) + '">' + esc(typeLabel(x)) + '</a>').join(' &middot; ');
  const body = bc.html + '\n<h1>' + esc(label) + ': Kids’ Birthday Party Venues in Northern Virginia</h1>\n<p class="lead">' + esc(intro.replace(/\s+/g, ' ').trim()) + '</p>\n' +
    '<p><a href="/">Use the search page to filter by city, price, guest count and age.</a></p>\n' +
    '<h2>' + plural(list.length, 'venue') + '</h2>\n' + grid(list) + '\n<h2>Other venue types</h2>\n<p>' + others + '</p>';
  return layout({ title: clip(label + ' Birthday Party Venues in Northern Virginia', 70),
    desc: clip(plural(list.length, 'venue') + ' for kids’ birthday parties: ' + label.toLowerCase() + '. ' + priceSentence(list) + ' Compare ages, party size and food rules.', 155),
    path: typeUrl(t), body, jsonld: [bc.ld, itemList(list)] });
}
for (const c of cities) write('cities/' + slugify(c) + '/index.html', cityPage(c));
for (const t of types) write('types/' + slugify(t) + '/index.html', typePage(t));

/* ---------- all-venues index ---------- */
(function allVenues() {
  const bc = crumbs([{ name: 'Home', url: '/' }, { name: 'All venues', url: '/venues/' }]);
  const groups = groupBy(LIVE.map((v) => Object.assign({}, v, { g: v.c === 'Unknown' ? 'Other' : v.c === 'Mobile' ? 'Mobile services' : v.c })), 'g');
  const names = Object.keys(groups).sort((a, b) => (a === 'Other') - (b === 'Other') || a.localeCompare(b));
  const sections = names.map((g) => '<h2>' + esc(g) + ' (' + groups[g].length + ')</h2>\n<ul class="plain">' +
    groups[g].sort((a, b) => a.n.localeCompare(b.n)).map((v) => '<li><a href="' + venueUrl(v) + '">' + esc(v.n) + '</a> <span class="meta">' + esc(typeLabel(v.t)) + (v.pr != null ? ' &middot; from ' + money(v.pr) : '') + '</span></li>').join('') + '</ul>').join('\n');
  const body = bc.html + '\n<h1>All Kids’ Birthday Party Venues in Northern Virginia</h1>\n<p class="lead">' + plural(LIVE.length, 'venue') + ', grouped by city. <a href="/">Search and filter instead.</a></p>\n' + sections;
  write('venues/index.html', layout({ title: 'All Kids’ Birthday Party Venues in Northern Virginia | ' + BRAND,
    desc: clip('Browse all ' + LIVE.length + ' researched kids’ birthday party venues in Northern Virginia, grouped by city.', 155), path: '/venues/', body, jsonld: [bc.ld] }));
})();

/* ---------- assets, sitemap, robots, 404 ---------- */
write('assets/style.css', [
  ':root{--bg:#fafaf7;--card:#fff;--ink:#1f2430;--muted:#667085;--line:#e4e4de;--brand:#c2410c;--brand-ink:#fff;--accent:#fff1e6;--warn:#fff4cc;--warn-ink:#7a5b00}',
  '@media (prefers-color-scheme:dark){:root{--bg:#14161b;--card:#1c1f26;--ink:#eceef2;--muted:#9aa3b2;--line:#2b2f38;--brand:#ff8a4c;--brand-ink:#14161b;--accent:#2a2018;--warn:#3a3010;--warn-ink:#f1d77a}}',
  '*{box-sizing:border-box}',
  'body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink)}',
  'a{color:var(--brand)}',
  '.site-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 16px;background:var(--accent);border-bottom:1px solid var(--line)}',
  '.brand{font-weight:800;text-decoration:none;color:var(--ink);font-size:1.1rem}',
  '.site-bar nav{display:flex;gap:16px}',
  '.site-bar nav a{color:var(--ink);text-decoration:none;font-weight:600;font-size:.95rem}',
  '.page{max-width:1000px;margin:0 auto;padding:20px 16px 40px}',
  'h1{font-size:clamp(1.5rem,4vw,2.1rem);line-height:1.2;margin:.4em 0}',
  'h2{font-size:1.25rem;margin:1.6em 0 .6em}',
  '.crumbs{font-size:.85rem;color:var(--muted)}.crumbs a{color:var(--muted)}',
  '.lead{color:var(--muted);max-width:760px}',
  '.small,.meta{color:var(--muted);font-size:.88rem}',
  '.facts{display:grid;grid-template-columns:max-content 1fr;gap:8px 18px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0}',
  '.facts dt{font-weight:600;color:var(--muted);font-size:.9rem}.facts dd{margin:0;overflow-wrap:anywhere}',
  '@media (max-width:520px){.facts{grid-template-columns:1fr}.facts dt{margin-top:6px}}',
  '.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}',
  '.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:6px}',
  '.card h3{margin:0;font-size:1.05rem}.card p{margin:0}',
  '.price{font-weight:700}',
  '.badge{display:inline-block;font-size:.7rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:2px 8px;border-radius:6px;align-self:flex-start}',
  '.badge.rec{background:var(--brand);color:var(--brand-ink)}',
  '.notice{background:var(--warn);color:var(--warn-ink);padding:10px 14px;border-radius:8px}',
  '.actions{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}',
  '.btn{display:inline-block;padding:9px 14px;border-radius:8px;text-decoration:none;font-weight:600;border:1px solid var(--brand);color:var(--brand)}',
  '.btn.primary{background:var(--brand);color:var(--brand-ink)}',
  'ul.plain{list-style:none;padding:0;margin:0}ul.plain li{padding:6px 0;border-bottom:1px solid var(--line)}',
  '.site-foot{max-width:1000px;margin:0 auto;padding:24px 16px 40px;color:var(--muted);font-size:.88rem;border-top:1px solid var(--line)}',
  'a:focus-visible,.btn:focus-visible{outline:2px solid #1c7ed6;outline-offset:2px}',
  ''
].join('\n'));

const slugMap = {};
for (const v of LIVE) slugMap[v.n] = v.slug;
write('assets/slugs.js', '// Generated by scripts/build.js. Do not edit.\nwindow.SLUGS = ' + JSON.stringify(slugMap) + ';\n');

const urls = ['/', '/venues/'].concat(cities.map(cityUrl), types.map(typeUrl), LIVE.map(venueUrl));
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => '  <url><loc>' + SITE + u + '</loc><lastmod>' + TODAY + '</lastmod></url>').join('\n') + '\n</urlset>\n');
write('robots.txt', 'User-agent: *\nAllow: /\n\nSitemap: ' + SITE + '/sitemap.xml\n');
write('404.html', layout({ title: 'Page not found | ' + BRAND, desc: 'This page could not be found.', path: '/404.html', noindex: true,
  body: '<h1>Page not found</h1>\n<p class="lead">That page doesn’t exist. <a href="/">Search all venues</a> or <a href="/venues/">browse the full list</a>.</p>', jsonld: [] }));

/* ---------- refresh the browse block on the search page ---------- */
(function browse() {
  const f = path.join(PUB, 'index.html');
  const html = fs.readFileSync(f, 'utf8');
  const a = '<!-- BROWSE:START -->', b = '<!-- BROWSE:END -->';
  if (!html.includes(a) || !html.includes(b)) { console.warn('index.html has no BROWSE markers; skipped'); return; }
  const block = a + '\n<section class="browse"><h2>Browse by city</h2><p>' +
    cities.map((c) => '<a href="' + cityUrl(c) + '">' + esc(c) + ' (' + byCity[c].length + ')</a>').join(' &middot; ') +
    '</p><h2>Browse by venue type</h2><p>' + types.map((t) => '<a href="' + typeUrl(t) + '">' + esc(typeLabel(t)) + ' (' + byType[t].length + ')</a>').join(' &middot; ') +
    '</p><p><a href="/venues/">See every venue in one list</a></p></section>\n' + b;
  fs.writeFileSync(f, html.slice(0, html.indexOf(a)) + block + html.slice(html.indexOf(b) + b.length));
})();

console.log('Venues: ' + ALL.length + ' (' + LIVE.length + ' indexable, ' + (ALL.length - LIVE.length) + ' noindex)');
console.log('City pages: ' + cities.length + ' | Type pages: ' + types.length + ' | Sitemap URLs: ' + urls.length);
console.log('Files written: ' + written.length);
