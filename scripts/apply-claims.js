/*
 * Applies approved "claim your listing" submissions to public/data.js.
 *
 * Source: the "Publish" tab of the claims Google Sheet, published to the web as CSV.
 * That tab only holds approved rows and only the public fields, so no claimant
 * names or emails ever leave the sheet.
 *
 * Usage:  CLAIMS_CSV_URL=https://docs.google.com/.../pub?gid=...&output=csv node scripts/apply-claims.js
 *         node scripts/apply-claims.js path/to/local.csv      (for testing)
 *
 * Expected column order (set by the QUERY formula in the Publish tab):
 *   0 Timestamp, 1 Listing ID, 2 Website, 3 Venue phone, 4 Address, 5 Setting, 6 Ages,
 *   7 Min guests, 8 Max guests, 9 Starting price, 10 Pricing notes, 11 Food, 12 Outside food
 *
 * Rules: blank answer = keep what the site has. Latest approved row per venue wins.
 * Claimed venues get cl (date of the claim) and lose fl (the "details to confirm" flag).
 * Address changes are NOT applied automatically (map pins need re-geocoding); they are
 * listed in the log so they can be handled by hand.
 * Prints CHANGED=1 to $GITHUB_OUTPUT when data.js was rewritten.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATA = path.join(__dirname, '..', 'public', 'data.js');
const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Google Forms timestamps look like 11/14/2026 10:32:11
function isoDate(ts) {
  const m = String(ts).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  const d = new Date(ts);
  return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}
const sortKey = (ts) => { const d = new Date(ts); return isNaN(d) ? 0 : d.getTime(); };

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const int = (s) => { const n = parseInt(clean(s).replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) && n > 0 && n < 5000 ? n : undefined; };
const price = (s) => { const n = Math.round(parseFloat(clean(s).replace(/[$,]/g, ''))); return Number.isFinite(n) && n > 0 && n < 100000 ? n : undefined; };
const pick = (map) => (s) => { const k = clean(s).toLowerCase(); for (const [re, v] of map) if (re.test(k)) return v; return undefined; };
const setting = pick([[/both|indoor (and|&) outdoor/, 'Both'], [/^indoor/, 'Indoor'], [/^outdoor/, 'Outdoor']]);
const food = pick([[/add-?on/, 'Add-on'], [/included|^yes/, 'Yes'], [/not provided|bring|^no/, 'No']]);
const outside = pick([[/cake|cupcake/, 'Cake only'], [/not allowed|^no/, 'No'], [/allowed|^yes/, 'Yes']]);
const url = (s) => { const u = clean(s); return /^https?:\/\/[^\s"<>]+\.[^\s"<>]+$/i.test(u) ? u : undefined; };
const phone = (s) => { const p = clean(s); return /\d{3}.*\d{3}.*\d{4}/.test(p) && p.length <= 25 ? p : undefined; };
const text = (max) => (s) => { const t = clean(s).replace(/\.+$/, ''); return t ? t.slice(0, max) : undefined; };

// Serialize one venue in the same one-line style data.js already uses.
const KEY = /^[A-Za-z_$][\w$]*$/;
function line(v) {
  const parts = Object.keys(v).filter((k) => v[k] !== undefined).map((k) => {
    const val = v[k];
    const s = typeof val === 'string' ? JSON.stringify(val) : typeof val === 'number' || typeof val === 'boolean' ? String(val) : JSON.stringify(val);
    return (KEY.test(k) ? k : JSON.stringify(k)) + ': ' + s;
  });
  return '  { ' + parts.join(', ') + ' },';
}

async function main() {
  const src = process.argv[2];
  const csvUrl = process.env.CLAIMS_CSV_URL;
  let csv;
  if (src) csv = fs.readFileSync(src, 'utf8');
  else if (csvUrl) {
    const res = await fetch(csvUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error('Could not fetch claims CSV: HTTP ' + res.status);
    csv = await res.text();
    if (/^\s*<!doctype html|<html/i.test(csv)) throw new Error('Claims URL returned a web page, not CSV. Use File > Share > Publish to web > Publish tab > CSV.');
  } else {
    console.log('CLAIMS_CSV_URL is not set; nothing to do.');
    return;
  }

  const rows = parseCSV(csv);
  if (rows.length < 2) { console.log('No approved claims yet.'); return; }
  const header = rows[0].map((h) => h.toLowerCase());
  if (!/listing/.test(header[1] || '')) throw new Error('Column 2 should be "Listing ID" but is "' + rows[0][1] + '". Check the Publish tab formula.');

  const code = fs.readFileSync(DATA, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  const venues = sandbox.window.VENUES;
  const bySlug = new Map(venues.map((v) => [slugify(v.n), v]));

  // Latest approved row per listing wins.
  const latest = new Map();
  for (const r of rows.slice(1).sort((a, b) => sortKey(a[0]) - sortKey(b[0]))) {
    const slug = slugify(clean(r[1]).replace(/^.*\/venues\//, '').replace(/\/$/, ''));
    if (!slug) continue;
    if (!bySlug.has(slug)) { console.log('SKIP unknown listing ID: ' + r[1]); continue; }
    latest.set(slug, r);
  }

  let out = code;
  let changed = 0;
  for (const [slug, r] of latest) {
    const v = bySlug.get(slug);
    const before = line(v);
    const next = Object.assign({}, v);
    const set = (k, val) => { if (val !== undefined) next[k] = val; };
    set('w', url(r[2]));
    set('p', phone(r[3]));
    set('s', setting(r[5]));
    set('age', text(40)(r[6]));
    set('mn', int(r[7]));
    set('mx', int(r[8]));
    set('pr', price(r[9]));
    set('pn', text(300)(r[10]));
    set('f', food(r[11]));
    set('k', outside(r[12]));
    if (next.mn !== undefined && next.mx !== undefined && next.mn > next.mx) { delete next.mn; if (v.mn !== undefined) next.mn = v.mn; }
    next.cl = isoDate(r[0]);
    delete next.fl;
    const addr = clean(r[4]);
    if (addr && addr.toLowerCase() !== clean(v.a).toLowerCase()) console.log('MANUAL address change for ' + v.n + ': "' + (v.a || '') + '" -> "' + addr + '"');

    const after = line(next);
    if (after === before) continue;
    const marker = '  { n: ' + JSON.stringify(v.n) + ',';
    const lines = out.split('\n');
    const idx = lines.findIndex((l) => l.startsWith(marker));
    if (idx < 0 || lines.filter((l) => l.startsWith(marker)).length !== 1) { console.log('SKIP could not find a unique line for ' + v.n); continue; }
    lines[idx] = after;
    out = lines.join('\n');
    changed++;
    console.log('UPDATED ' + v.n);
  }

  if (!changed) { console.log('No changes.'); return; }
  vm.runInNewContext(out, { window: {} }); // make sure the rewritten file still parses
  fs.writeFileSync(DATA, out);
  console.log(changed + ' listing(s) updated.');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'CHANGED=1\n');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
