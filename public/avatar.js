// Simple, fun SVG avatars (colour + eyes + mouth + extra).
window.Avatar = (() => {
  const COLORS = ['#ff5252','#ff9800','#ffd600','#8bc34a','#26a69a','#29b6f6','#3f51b5','#9c27b0','#ec407a','#795548','#ffab91','#c6ff00','#00e5ff','#b388ff','#f06292','#90a4ae'];
  const N = { color: COLORS.length, eyes: 10, mouth: 10, extra: 10 };
  const eyes = [
    '<circle cx="36" cy="44" r="6" fill="#fff"/><circle cx="64" cy="44" r="6" fill="#fff"/><circle cx="37" cy="45" r="3" fill="#222"/><circle cx="65" cy="45" r="3" fill="#222"/>',
    '<circle cx="36" cy="44" r="4" fill="#222"/><circle cx="64" cy="44" r="4" fill="#222"/>',
    '<path d="M29 46 Q36 38 43 46" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M57 46 Q64 38 71 46" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    '<ellipse cx="36" cy="44" rx="7" ry="9" fill="#fff"/><ellipse cx="64" cy="44" rx="7" ry="9" fill="#fff"/><circle cx="38" cy="46" r="4" fill="#222"/><circle cx="66" cy="46" r="4" fill="#222"/><circle cx="39" cy="44" r="1.4" fill="#fff"/><circle cx="67" cy="44" r="1.4" fill="#fff"/>',
    '<path d="M30 44 L42 44" stroke="#222" stroke-width="3.5" stroke-linecap="round"/><path d="M58 44 L70 44" stroke="#222" stroke-width="3.5" stroke-linecap="round"/>',
    '<circle cx="36" cy="44" r="6" fill="#fff"/><circle cx="64" cy="44" r="6" fill="#fff"/><circle cx="34" cy="43" r="3" fill="#222"/><circle cx="62" cy="43" r="3" fill="#222"/><path d="M28 34 L42 37" stroke="#222" stroke-width="3" stroke-linecap="round"/><path d="M72 34 L58 37" stroke="#222" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M30 40 L42 48 M42 40 L30 48" stroke="#222" stroke-width="3" stroke-linecap="round"/><path d="M58 40 L70 48 M70 40 L58 48" stroke="#222" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M30 44 Q36 50 42 44" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="64" cy="44" r="6" fill="#fff"/><circle cx="65" cy="45" r="3" fill="#222"/>',
    '<path d="M36 36 l2 5 5 .5 -4 3 1.5 5 -4.5 -3 -4.5 3 1.5 -5 -4 -3 5 -.5z" fill="#ffeb3b" stroke="#222" stroke-width="1"/><path d="M64 36 l2 5 5 .5 -4 3 1.5 5 -4.5 -3 -4.5 3 1.5 -5 -4 -3 5 -.5z" fill="#ffeb3b" stroke="#222" stroke-width="1"/>',
    '<path d="M36 50 c-6-5-8-9-4-11 2-1 4 0 4 2 0-2 2-3 4-2 4 2 2 6-4 11z" fill="#e91e63"/><path d="M64 50 c-6-5-8-9-4-11 2-1 4 0 4 2 0-2 2-3 4-2 4 2 2 6-4 11z" fill="#e91e63"/>',
  ];
  const mouths = [
    '<path d="M36 64 Q50 78 64 64" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    '<path d="M34 62 Q50 84 66 62 Z" fill="#7b1f1f"/><path d="M42 72 Q50 78 58 72" fill="#ff7b8a"/>',
    '<path d="M40 68 L60 68" stroke="#222" stroke-width="3.5" stroke-linecap="round"/>',
    '<circle cx="50" cy="68" r="6" fill="#7b1f1f"/>',
    '<path d="M38 70 Q50 60 62 70" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
    '<path d="M36 64 Q50 78 64 64" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M52 69 q4 10 9 0" fill="#ff5c7a" stroke="#222" stroke-width="1.5"/>',
    '<path d="M36 66 l7-4 7 4 7-4 7 4" stroke="#222" stroke-width="3" fill="none" stroke-linejoin="round"/>',
    '<path d="M34 62 Q50 80 66 62 Z" fill="#fff" stroke="#222" stroke-width="2.5"/><path d="M50 62 V71" stroke="#222" stroke-width="1.5"/>',
    '<path d="M44 66 Q50 60 56 66 Q50 72 44 66" fill="#e53935"/>',
    '<path d="M40 64 Q50 70 60 64" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="30" cy="60" rx="6" ry="3.5" fill="#ff8a80" opacity=".7"/><ellipse cx="70" cy="60" rx="6" ry="3.5" fill="#ff8a80" opacity=".7"/>',
  ];
  const extras = [
    '',
    '<circle cx="50" cy="30" r="4" fill="#d50000"/>', // pottu
    '<path d="M34 60 Q42 54 50 59 Q58 54 66 60 Q58 63 50 61 Q42 63 34 60Z" fill="#222"/>', // moustache
    '<circle cx="36" cy="44" r="10" fill="none" stroke="#222" stroke-width="3"/><circle cx="64" cy="44" r="10" fill="none" stroke="#222" stroke-width="3"/><path d="M46 44 L54 44" stroke="#222" stroke-width="3"/>', // glasses
    '<path d="M28 20 L34 6 L42 16 L50 2 L58 16 L66 6 L72 20 Z" fill="#ffc107" stroke="#b8860b" stroke-width="2"/><circle cx="50" cy="12" r="3" fill="#e53935"/>', // crown
    '<path d="M18 26 Q50 -6 82 26 Z" fill="#1e88e5"/><path d="M50 22 Q80 20 92 28 L50 28Z" fill="#1565c0"/>', // cap
    '<g transform="translate(76 18)"><circle r="6" fill="#ff9800"/><circle cx="8" r="6" fill="#ff9800"/><circle cx="4" cy="-7" r="6" fill="#ff9800"/><circle cx="4" cy="4" r="4" fill="#ffeb3b"/></g>', // marigold
    '<path d="M50 14 L36 6 L36 22 Z M50 14 L64 6 L64 22Z" fill="#e91e63"/><circle cx="50" cy="14" r="4" fill="#ad1457"/>', // bow
    '<path d="M22 22 Q50 0 78 22" stroke="#fff" stroke-width="7" fill="none" stroke-dasharray="1 8" stroke-linecap="round"/>', // jasmine
    '<rect x="24" y="36" width="24" height="16" rx="6" fill="#111"/><rect x="52" y="36" width="24" height="16" rx="6" fill="#111"/><path d="M48 42 L52 42" stroke="#111" stroke-width="3"/>', // sunglasses
  ];
  function svg(a, size = 48) {
    a = a || {};
    const c = COLORS[(a.color || 0) % COLORS.length];
    return `<svg class="avatar-svg" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="52" r="40" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width="3"/>
      <ellipse cx="38" cy="30" rx="12" ry="7" fill="rgba(255,255,255,.3)"/>
      ${eyes[(a.eyes || 0) % eyes.length]}${mouths[(a.mouth || 0) % mouths.length]}${extras[(a.extra || 0) % extras.length]}
    </svg>`;
  }
  function random() { const r = n => Math.floor(Math.random() * n); return { color: r(N.color), eyes: r(N.eyes), mouth: r(N.mouth), extra: r(N.extra) }; }
  return { svg, random, N, COLORS };
})();
