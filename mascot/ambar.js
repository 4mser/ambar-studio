/* ÁMBAR, la mascota de AMBAR Studio: gel ámbar translúcido con un núcleo de miel oscura y dos ojos
   de cápsula con pestañitas. La forma fluctúa (armónicos lentos) y nunca es un círculo. Las
   expresiones se mezclan por pesos y el gel se tiñe hacia rojo (rojo) o azul (triste).
   Devuelve un string SVG; se dibuja por cuadro, así que se mueve con la escena. */
let _midB = 0;
const mezclaB = (a, b, k) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
/* curva cerradaB suave por puntos (Catmull-Rom → Bézier) */
function cerradaB(P){ let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`; const n = P.length;
  for (let i = 0; i < n; i++){ const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`; }
  return d + 'Z'; }
/* contornoB orgánico: tres lóbulos suaves (como la lámina) que respiran y giran lento */
function contornoB(cx, cy, R, t, f, amp = 1){ const P = [];
  for (let i = 0; i < 40; i++){ const a = i / 40 * Math.PI * 2;
    const r = R * (1 + amp * (.13 * Math.sin(3 * a + t * .55 + f) + .07 * Math.sin(2 * a - t * .8 + f * 2) + .045 * Math.sin(5 * a + t * 1.3 + f) + .03 * Math.sin(7 * a - t * 1.7)));
    P.push([cx + Math.cos(a) * r * 1.08, cy + Math.sin(a) * r * .94]); }
  return cerradaB(P); }

/* siluetas de la lámina: cuerpo compacto y lóbulos que se abren como gelatina */
const FORMAS_B = {
  gota:        { base: .78, lob: [[-90, .36, .28], [-55, .05, .5], [-125, .05, .5], [40, .1, .6], [140, .1, .6]] },
  normal:      { base: .72, lob: [[-48, .5, .3], [192, .36, .4], [36, .32, .45], [118, .2, .5], [-128, .14, .45]] },
  feliz:       { base: .72, lob: [[-58, .48, .19], [-122, .48, .19], [15, .24, .45], [165, .24, .45], [92, .12, .6]] },
  pensativa:   { base: .74, lob: [[-122, .5, .28], [14, .28, .45], [172, .24, .45], [80, .18, .5], [-38, .14, .4]] },
  sorprendida: { base: .7,  lob: [[-90, .36, .38], [-4, .34, .32], [184, .34, .32], [58, .14, .5], [122, .14, .5]] },
  enojada:     { base: .7,  lob: [[-62, .44, .19], [-118, .44, .19], [8, .32, .24], [172, .32, .24], [90, .16, .4]] },
  triste:      { base: .72, lob: [[112, .34, .34], [68, .34, .34], [180, .2, .42], [0, .2, .42], [-90, .08, .5]] },
  dormida:     { base: .66, lob: [[0, .42, .5], [180, .42, .5], [-90, .06, .5], [60, .1, .5], [120, .1, .5]] },
};
/* mezclaB de formas: pesos {expr: w}. El contorno es base + suma de lóbulos, así que mezclar dos
   expresiones es sumar los lóbulos de cada una escalados por su peso. Promediar los ÁNGULOS de los
   lóbulos (como se hacía antes) daba saltos de ~40 px cuando dos lóbulos casi opuestos pesaban igual.
   Más un estirón según la velocidad (cola hacia atrás). */
function formaMezclaB(pesos, t, vel = [0, 0]){
  const E = Object.entries(pesos).filter(([, w]) => w > 0); let W = 0; for (const [, w] of E) W += w;
  if (!W) return formaMezclaB({ normal: 1 }, t, vel);
  let base = 0; const L = [];
  E.forEach(([k, w]) => { base += FORMAS_B[k].base * w;
    FORMAS_B[k].lob.forEach(([ang, l, s], i) => L.push([ang * Math.PI / 180 + Math.sin(t * .6 + i * 1.9) * .08, l * w / W * (1 + .08 * Math.sin(t * .9 + i * 1.7)), s])); });
  const v = Math.hypot(vel[0], vel[1]); if (v > 1) L.push([Math.atan2(-vel[1], -vel[0]), Math.min(.3, v / 1500), .42]);
  return { base: base / W, L };
}
function siluetaB(cx, cy, R, F){ const P = [];
  for (let i = 0; i < 72; i++){ const a = i / 72 * Math.PI * 2; let r = F.base;
    for (const [la, ll, ls] of F.L){ let d = Math.atan2(Math.sin(a - la), Math.cos(a - la)); r += ll * Math.exp(-d * d / (2 * ls * ls)); }
    const yy = Math.sin(a) * r * R; P.push([cx + Math.cos(a) * r * R, cy + (yy > 0 ? yy * .86 : yy)]); }
  return cerradaB(P); }

/* o: {x, y, R, t, expr: 'normal'|'feliz'|'pensativa'|'sorprendida'|'enojada'|'dormida', rojo: 0..1, mira: [dx, dy], parpadeo: 0..1, op}
   Un solo material: magenta que se oscurece hacia el centro (nada de núcleo negro con borde). El borde apenas respira. */
function mascotaAmbar(o){
  const { x, y, R, t, sinOjos = false, expr = 'normal', rojo = 0, triste = 0, mira = [0, 0], parpadeo = 0, op = 1, estira = 0, chispas = 0, pesos = { [expr]: 1 }, vel = [0, 0], habla = 0 } = o; if (R < 1) return '';
  const id = 'mb' + (_midB++);
  const tz = (a, r, b) => mezclaB(mezclaB(a, r, rojo), b, triste);
  const borde = tz('#FFD27A', '#FF4A3A', '#6FA8FF'), medio = tz('#F2A324', '#C8102A', '#3B6FE0'), hondo = tz('#8A4A0C', '#6A0712', '#1E2F7A'), centro = tz('#341805', '#2A0406', '#0C1230');
  const ojo = tz('#FFE0A0', '#FF6A5A', '#A8CCFF'), halo = tz('#F59E0B', '#E0142E', '#3B7BFF'), claro = tz('#FFE7B3', '#FFB0A0', '#BFD8FF'), lila = tz('#FFB347', '#FF6A3A', '#7FB0FF');
  const vv = Math.min(.3, Math.hypot(vel[0], vel[1]) / 1500);
  const dy = Math.sin(t * 1.6) * R * .03;
  let h = `<defs>
    <radialGradient id="${id}h"><stop offset="0" stop-color="${halo}" stop-opacity=".5"/><stop offset="1" stop-color="${halo}" stop-opacity="0"/></radialGradient>
    <filter id="${id}b" filterUnits="userSpaceOnUse" x="${x - R * 3}" y="${y - R * 3}" width="${R * 6}" height="${R * 6}"><feGaussianBlur stdDeviation="${R * .06}"/></filter>
    <filter id="${id}e" filterUnits="userSpaceOnUse" x="${x - R * 2}" y="${y - R * 2}" width="${R * 4}" height="${R * 4}"><feGaussianBlur stdDeviation="${R * .07}"/></filter>
  </defs><g opacity="${op}" transform="translate(${x} ${y + R}) scale(${1 + estira * .1} ${1 - estira * .1}) translate(${-x} ${-y - R})">`;
  h += `<ellipse data-glow cx="${x}" cy="${y + dy}" rx="${R * 2.2}" ry="${R * 2.05}" fill="url(#${id}h)"/>`;
  h += `<ellipse cx="${x}" cy="${y + R * .98}" rx="${R * .7}" ry="${R * .11}" fill="${halo}" opacity=".3" filter="url(#${id}b)"/>`;
  // el orbe: contornoB casi redondo que respira suave
  const nx = x + mira[0] * R * .06, ny = y + dy + R * .08 + mira[1] * R * .05;
  const PG = Object.assign({}, pesos); const sumP = Object.values(PG).reduce((a, b) => a + b, 0); 
  const FF = formaMezclaB(PG, t, vel);
  FF.L = FF.L.map(([a, l, sg], i) => [a + .06 * Math.sin(t * .43 + i * 2.3), l * (1 + .08 * Math.sin(t * .71 + i * 1.7)), sg]);
  if (habla > .01){ for (let j = 0; j < 3; j++) FF.L.push([t * (.9 + j * .35) + j * 2.1, habla * .05, .22]); FF.L.push([Math.PI / 2 + .15 * Math.sin(t * .8), habla * .1, .42]); }
  const G = siluetaB(x, y + dy, R, FF);
  h += `<radialGradient id="${id}v" cx="${nx}" cy="${ny}" r="${R * (1.12 + vv * 1.6)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${centro}"/><stop offset=".42" stop-color="${hondo}"/><stop offset=".72" stop-color="${medio}"/><stop offset=".95" stop-color="${borde}"/><stop offset="1" stop-color="${borde}"/></radialGradient>`;
  h += `<path d="${G}" fill="url(#${id}v)"/>`;
  h += `<clipPath id="${id}c"><path d="${G}"/></clipPath><g clip-path="url(#${id}c)">
    <ellipse cx="${x + R * .55}" cy="${y + dy + R * .55}" rx="${R * .55}" ry="${R * .42}" fill="${lila}" opacity=".22" filter="url(#${id}b)"/>
    <path d="${G}" fill="none" stroke="${claro}" stroke-width="${R * .16}" opacity=".35" filter="url(#${id}b)"/></g>`;
  // brillo que gira lento por el borde (como el orbe anterior) y reflejo arriba
  const a = t * .9, bx = x + Math.cos(a) * R * .62, by = y + dy + Math.sin(a) * R * .55;
  h += `<ellipse cx="${bx}" cy="${by}" rx="${R * .28}" ry="${R * .12}" transform="rotate(${a * 57.3 + 90} ${bx} ${by})" fill="#fff" opacity=".18" filter="url(#${id}b)"/>`;
  h += `<ellipse cx="${x - R * .34}" cy="${y + dy - R * .52}" rx="${R * .36}" ry="${R * .15}" transform="rotate(-28 ${x - R * .34} ${y + dy - R * .52})" fill="#fff" opacity=".32" filter="url(#${id}b)"/>`;
  h += `<ellipse cx="${x - R * .4}" cy="${y + dy - R * .56}" rx="${R * .14}" ry="${R * .045}" transform="rotate(-30 ${x - R * .4} ${y + dy - R * .56})" fill="#fff" opacity=".8"/>`;
  h += `<path d="${G}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="${R * .02}"/>`;
  // ojos
  const ex = x + mira[0] * R * .1, ey = y + dy - R * .08 + mira[1] * R * .07, sep = R * .17, w = R * .105, hgt = R * .3 * (1 - parpadeo * .9);
  const ojoPill = (cx, alto) => `<rect x="${cx - w / 2}" y="${ey - alto / 2}" width="${w}" height="${alto}" rx="${w / 2}"/>`;
  let ojos = '';
  if (expr === 'feliz') ojos = [-1, 1].map(s => `<path d="M${ex + s * sep - w * 1.1} ${ey + R * .03} Q${ex + s * sep} ${ey - R * .12} ${ex + s * sep + w * 1.1} ${ey + R * .03}" fill="none" stroke="currentColor" stroke-width="${w * .8}" stroke-linecap="round"/>`).join('');
  else if (expr === 'dormida') ojos = [-1, 1].map(s => `<path d="M${ex + s * sep - w} ${ey} Q${ex + s * sep} ${ey + R * .07} ${ex + s * sep + w} ${ey}" fill="none" stroke="currentColor" stroke-width="${w * .6}" stroke-linecap="round"/>`).join('');
  else if (expr === 'enojada'){ // píldoras con el borde de arriba inclinado hacia el centro
    ojos = [-1, 1].map(s => { const cx = ex + s * sep, top = ey - hgt / 2, bot = ey + hgt / 2, inc = hgt * .38;
      const yIn = top + inc * 1.4, yOut = top;   // más bajo hacia el centro
      const xi = cx - s * w / 2, xo = cx + s * w / 2;
      return `<path d="M${xo} ${yOut + w * .3} L${xo} ${bot - w / 2} Q${xo} ${bot} ${cx} ${bot} Q${xi} ${bot} ${xi} ${bot - w / 2} L${xi} ${yIn} Z" stroke-linejoin="round"/>`; }).join('');
  }
  else if (expr === 'triste'){
    ojos = [-1, 1].map(s => { const cx = ex + s * sep, top = ey - hgt / 2 + hgt * .1, bot = ey + hgt / 2, inc = hgt * .38;
      const yIn = top, yOut = top + inc * 1.3, xi = cx - s * w / 2, xo = cx + s * w / 2;
      return `<path d="M${xi} ${yIn + w * .3} L${xi} ${bot - w / 2} Q${xi} ${bot} ${cx} ${bot} Q${xo} ${bot} ${xo} ${bot - w / 2} L${xo} ${yOut} Z" stroke-linejoin="round"/>`; }).join('');
  }
  else if (expr === 'sorprendida') ojos = ojoPill(ex - sep, hgt * 1.15) + ojoPill(ex + sep, hgt * 1.15);
  else if (expr === 'pensativa') ojos = ojoPill(ex - sep, hgt * .85) + ojoPill(ex + sep, hgt);
  else ojos = ojoPill(ex - sep, hgt) + ojoPill(ex + sep, hgt);
  // pestañitas: dos trazos finos sobre el borde exterior de cada ojo
  const pest = (s0) => { const cx = ex + s0 * sep, top = expr === 'feliz' ? ey - R * .045 : expr === 'dormida' ? ey + R * .02 : ey - hgt / 2 + w * .45;
    return [0, 1].map(k => { const bx = cx + s0 * w * .5, by = top + k * R * .04, ang = (38 - k * 26) * Math.PI / 180, L = R * (.06 - k * .01);
      const ex2 = s0 * Math.cos(ang) * L, ey2 = -Math.sin(ang) * L;
      return `<path d="M${bx} ${by} q${ex2 * .55} ${ey2 * .1} ${ex2} ${ey2}" fill="none" stroke="currentColor" stroke-width="${R * .016}" stroke-linecap="round"/>`; }).join(''); };
  ojos += pest(-1) + pest(1);
  const linea = expr === 'feliz' || expr === 'dormida';
  if (!sinOjos) h += `<g color="${ojo}" fill="${ojo}" filter="url(#${id}e)" opacity=".9">${ojos}</g><g color="#fff" fill="#fff">${ojos}</g>`;
  if (expr === 'sorprendida') [-1, 0, 1].forEach(s => { const a = -Math.PI / 2 + s * .45, r0 = R * 1.25, r1 = R * 1.45;
    h += `<line x1="${x + Math.cos(a) * r0}" y1="${y + Math.sin(a) * r0}" x2="${x + Math.cos(a) * r1}" y2="${y + Math.sin(a) * r1}" stroke="${borde}" stroke-width="${R * .05}" stroke-linecap="round"/>`; });
  if (expr === 'triste'){ // una lágrima que cae lenta
    const u = (t * .7) % 1, lx = ex + sep + w * .9, ly = ey + R * .12 + u * R * .45;
    h += `<path d="M${lx} ${ly - R * .07} Q${lx + R * .045} ${ly} ${lx} ${ly + R * .035} Q${lx - R * .045} ${ly} ${lx} ${ly - R * .07}Z" fill="#CFE3FF" opacity="${.9 * Math.sin(u * Math.PI)}"/>`; }
  if (expr === 'enojada'){ // vapor de enojo
    for (let j = 0; j < 3; j++){ const u = ((t * .8) + j / 3) % 1; h += `<circle cx="${x + R * (.9 + j * .08)}" cy="${y - R * (.8 + u * .7)}" r="${R * (.06 + u * .05)}" fill="${medio}" opacity="${.6 * (1 - u)}"/>`; } }
  if (chispas > 0) for (let j = 0; j < 4; j++){ const a = j * 1.57 + t * .6, rr = R * (1.35 + .1 * Math.sin(t * 2 + j)), sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr * .85, z = R * .12 * chispas * (.7 + .3 * Math.sin(t * 5 + j * 2));
    h += `<path d="M${sx} ${sy - z} Q${sx} ${sy} ${sx + z} ${sy} Q${sx} ${sy} ${sx} ${sy + z} Q${sx} ${sy} ${sx - z} ${sy} Q${sx} ${sy} ${sx} ${sy - z}Z" fill="#FFE7B3" opacity="${chispas}"/>`; }
  return h + '</g>';
}
