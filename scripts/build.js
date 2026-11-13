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
const CONTACT = 'hello@novapartyvenues.com'; // shown in the "claim your listing" line (forwards via Cloudflare Email Routing)
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

const ALLTYPES = Array.from(new Set(ALL.map((v) => v.t))).sort();
const tIdx = (t) => ALLTYPES.indexOf(t) % 12;
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
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Figtree:wght@400..700&display=swap">\n';
const ICONS = '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="icon" href="/favicon.ico" sizes="48x48">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/></svg>';
const favBtn = (n) => '<button type="button" class="fav" data-n="' + esc(n) + '" aria-pressed="false" aria-label="Save ' + esc(n) + ' to favorites">' + STAR + '</button>';
const LOGO = '<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="10" cy="11" r="7.5" fill="#d6333b"/><circle cx="20" cy="11" r="7.5" fill="#ffc83d" fill-opacity=".92"/><circle cx="15" cy="18.5" r="7.5" fill="#22a58a" fill-opacity=".92"/></svg>';
const HEADER = '<header class="site-bar"><div class="bar-in"><a class="brand" href="/">' + LOGO + BRAND + '</a><nav aria-label="Main"><a href="/">Search venues</a><a href="/venues/">All venues</a></nav></div></header>';

function footer() {
  const cl = cities.map((c) => '<li><a href="' + cityUrl(c) + '">' + esc(c) + '</a></li>').join('');
  const tl = types.map((t) => '<li><a href="' + typeUrl(t) + '">' + esc(typeLabel(t)) + '</a></li>').join('');
  return '<footer class="site-foot"><div class="foot-in">\n' +
    '<div><h2>Browse by city</h2><ul>' + cl + '</ul></div>\n' +
    '<div><h2>Browse by venue type</h2><ul>' + tl + '</ul></div>\n' +
    (CONTACT ? '<p class="claim wide"><strong>Own a party venue?</strong> <a href="mailto:' + esc(CONTACT) + '">Claim or correct your listing</a> at ' + esc(CONTACT) + '.</p>\n' : '') +
    '<p class="wide">Prices and policies are gathered from venue websites, last reviewed ' + REVIEWED + ', and can change. "Starting price" is the lowest total package price we found, not a quote. Always confirm details, availability and current pricing with the venue before booking. "Recommended by neighbors" counts how often a venue was suggested in a local parents\' group.</p>\n' +
    '</div></footer>';
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
    ICONS + FONTS + '<link rel="stylesheet" href="/assets/style.css">\n' + ld + '\n</head>\n<body>\n' +
    HEADER + '\n' +
    '<main class="page">\n' + o.body + '\n</main>\n' + footer() + '\n<script src="/assets/fav.js" defer></script>\n</body>\n</html>\n';
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
  const guests = v.mn != null && v.mx != null ? v.mn + '-' + v.mx : v.mx != null ? 'Up to ' + v.mx : v.mn != null ? v.mn + '+' : 'Ask venue';
  const setting = v.s === 'Both' ? 'In & out' : v.s || 'Ask venue';
  return '<article class="card t' + tIdx(v.t) + '">' + favBtn(v.n) +
    '<div class="card-top"><div class="card-type"><span class="dot"></span>' + esc(typeLabel(v.t)) + '</div>' + (v.m >= 3 ? '<span class="badge rec">Recommended by neighbors</span>' : '') + '</div>' +
    '<h3><a href="' + venueUrl(v) + '">' + esc(v.n) + '</a></h3>' +
    '<div class="loc">' + esc(cityLine(v)) + '</div>' +
    (v.pr != null ? '<div class="price"><small>From</small> ' + money(v.pr) + '</div>' : '<div class="price none">Price not published</div>') +
    '<div class="specs"><div><b>' + esc(guests) + '</b><span>Guests</span></div><div><b>' + esc(v.age || 'Ask venue') + '</b><span>Ages</span></div><div><b>' + esc(setting) + '</b><span>Setting</span></div></div>' +
    (v.pn ? '<p class="note">' + esc(v.pn) + '</p>' : '') + '</article>';
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

  const guests = v.mn != null && v.mx != null ? v.mn + '-' + v.mx : v.mx != null ? 'Up to ' + v.mx : v.mn != null ? v.mn + '+' : 'Ask venue';
  const stats = [[v.pr != null ? money(v.pr) : 'Not listed', 'Starting price'], [guests, 'Guests'], [v.age || 'Ask venue', 'Ages'], [v.s === 'Both' ? 'Indoor & outdoor' : v.s || 'Ask venue', 'Setting']];
  const statHtml = '<div class="stats">' + stats.map((r) => '<div class="stat"><b>' + esc(r[0]) + '</b><span>' + r[1] + '</span></div>').join('') + '</div>';
  let facts = '<dt>Food</dt><dd>' + esc(foodText(v)) + '</dd><dt>Outside food</dt><dd>' + esc(cateringText(v)) + '</dd>';
  if (v.a) facts += '<dt>Address</dt><dd>' + esc(v.a) + '</dd>';
  if (v.p) facts += '<dt>Phone</dt><dd><a href="tel:' + esc(v.p.replace(/[^0-9+]/g, '')) + '">' + esc(v.p) + '</a></dd>';

  const flag = v.fl ? '<p class="notice">Some details for this listing are unconfirmed. Please contact the venue directly before planning around it.</p>' : '';
  const side = '<aside class="side"><div class="side-card"><h2>Plan your party</h2>' +
    (v.w ? '<a class="btn primary block" href="' + esc(v.w) + '" target="_blank" rel="noopener nofollow">Visit venue website</a>' : '') +
    (v.p ? '<a class="btn block" href="tel:' + esc(v.p.replace(/[^0-9+]/g, '')) + '">Call ' + esc(v.p) + '</a>' : '') +
    (v.a ? '<a class="btn block" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent(v.a) + '" target="_blank" rel="noopener">Get directions</a>' : '') +
    '<p class="small">Last reviewed ' + REVIEWED + '. Prices and policies change, so confirm with the venue before booking.</p></div></aside>';
  const body = bc.html + '\n<div class="vtype t' + tIdx(v.t) + '"><span class="dot"></span>' + esc(typeLabel(v.t)) + '</div>\n<div class="vhead"><h1>' + esc(v.n) + '</h1>' + favBtn(v.n) + '</div>\n' +
    '<p class="lead">' + esc(cityLine(v)) + (v.m >= 3 ? ' <span class="badge rec">Recommended by neighbors</span>' : '') + '</p>\n' + flag +
    '<div class="vlayout"><div>\n' + statHtml + '\n' +
    (v.pn ? '<div class="pricebox"><p><strong>Pricing and details.</strong> ' + esc(v.pn) + '.</p></div>\n' : '') +
    '<h2>Good to know</h2>\n<dl class="facts">' + facts + '</dl>\n</div>\n' + side + '</div>\n' +
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
  const others = cities.filter((x) => x !== c).map((x) => '<li><a href="' + cityUrl(x) + '">' + esc(x) + '</a></li>').join('');
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
  const others = types.filter((x) => x !== t).map((x) => '<li><a href="' + typeUrl(x) + '">' + esc(typeLabel(x)) + '</a></li>').join('');
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
write('assets/fav.js', fs.readFileSync(path.join(__dirname, 'fav.js'), 'utf8'));
write('assets/style.css', fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8'));

const slugMap = {};
for (const v of LIVE) slugMap[v.n] = v.slug;
write('assets/slugs.js', '// Generated by scripts/build.js. Do not edit.\nwindow.SLUGS = ' + JSON.stringify(slugMap) + ';\n');

const urls = ['/', '/venues/'].concat(cities.map(cityUrl), types.map(typeUrl), LIVE.map(venueUrl));
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => '  <url><loc>' + SITE + u + '</loc><lastmod>' + TODAY + '</lastmod></url>').join('\n') + '\n</urlset>\n');
write('robots.txt', 'User-agent: *\nAllow: /\nDisallow: /tools/\n\nSitemap: ' + SITE + '/sitemap.xml\n');
write('404.html', layout({ title: 'Page not found | ' + BRAND, desc: 'This page could not be found.', path: '/404.html', noindex: true,
  body: '<h1>Page not found</h1>\n<p class="lead">That page doesn’t exist. <a href="/">Search all venues</a> or <a href="/venues/">browse the full list</a>.</p>', jsonld: [] }));

/* ---------- refresh the browse block on the search page ---------- */
(function browse() {
  const f = path.join(PUB, 'index.html');
  const html = fs.readFileSync(f, 'utf8');
  const a = '<!-- BROWSE:START -->', b = '<!-- BROWSE:END -->';
  if (!html.includes(a) || !html.includes(b)) { console.warn('index.html has no BROWSE markers; skipped'); return; }
  const block = a + '\n' + footer() + '\n' + b;
  fs.writeFileSync(f, html.slice(0, html.indexOf(a)) + block + html.slice(html.indexOf(b) + b.length));
})();

console.log('Venues: ' + ALL.length + ' (' + LIVE.length + ' indexable, ' + (ALL.length - LIVE.length) + ' noindex)');
console.log('City pages: ' + cities.length + ' | Type pages: ' + types.length + ' | Sitemap URLs: ' + urls.length);
console.log('Files written: ' + written.length);
