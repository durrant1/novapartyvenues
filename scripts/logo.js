/* Brand mark: a map pin whose center is a (subtle) disco ball made of mirror tiles on a sphere.
   Exports inner() = the SVG shapes in a 32x40 box, used by build.js and the icon generator. */
'use strict';
module.exports.inner = function () {
  const cx = 16, cy = 14.8, R = 10, rad = Math.PI / 180;
  const latEdges = [-80, -60, -40, -20, 0, 20, 40, 60, 80];   // 8 bands
  const lonEdges = [-90, -67.5, -45, -22.5, 0, 22.5, 45, 67.5, 90];   // 8 columns
  const tones = ['#8fb5b4', '#a8c9c8', '#cfe2e0', '#faf8f3', '#ffffff'];   // dark -> light (light from top-left)
  const pt = (lat, lon) => [cx + R * Math.cos(lat * rad) * Math.sin(lon * rad), cy - R * Math.sin(lat * rad)];
  const seg = (a, b, fixedLat, from, to) => {
    const pts = [];
    for (let k = 0; k <= 3; k++) { const t = from + (to - from) * k / 3; pts.push(fixedLat ? pt(a, t) : pt(t, a)); }
    return pts;
  };
  let tiles = '';
  for (let r = 0; r < latEdges.length - 1; r++) {
    for (let c = 0; c < lonEdges.length - 1; c++) {
      const la0 = latEdges[r], la1 = latEdges[r + 1], lo0 = lonEdges[c], lo1 = lonEdges[c + 1];
      const poly = [].concat(seg(la0, 0, true, lo0, lo1), seg(lo1, 0, false, la0, la1).slice(1), seg(la1, 0, true, lo1, lo0).slice(1), seg(lo0, 0, false, la1, la0).slice(1));
      const mlat = (la0 + la1) / 2, mlon = (lo0 + lo1) / 2;
      const lit = (Math.cos(mlat * rad) * Math.sin(mlon * rad) * -0.55 + Math.sin(mlat * rad) * 0.6 + Math.cos(mlat * rad) * Math.cos(mlon * rad) * 0.45);  // -1..1
      let k = Math.round((lit + 0.4) * 2.2) + (((r + c) % 2) ? 1 : 0) - 1;
      const fill = tones[Math.max(0, Math.min(tones.length - 1, k))];
      tiles += `<polygon fill="${fill}" points="${poly.map((p) => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ')}"/>`;
    }
  }
  const sparkle = '<path fill="#faf8f3" d="M26 3.6l.85 2.3 2.3.85-2.3.85-.85 2.3-.85-2.3-2.3-.85 2.3-.85z"/>';
  return '<path fill="#f45b0b" d="M16 1C8.3 1 2 7.2 2 14.8c0 9.6 11.2 21.2 13 23 .6.6 1.4.6 2 0 1.8-1.8 13-13.4 13-23C30 7.2 23.7 1 16 1z"/>' +
    '<g stroke="#f45b0b" stroke-width=".35" stroke-linejoin="round">' + tiles + '</g>' + sparkle;
};
