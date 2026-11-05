import type { VectorSheet, Seg, Pt, DrawItem, TextItem } from './vectorCanvas';

/* ───────────────────────── shared ───────────────────────── */
const PX_PER_MM = 5; // sheet pixels per paper-mm (A3 = 2100 × 1485 px)
type RGB = [number, number, number];
function rgb(c: string): RGB | null {
  const s = c.trim().toLowerCase();
  if (s === 'white') return [1, 1, 1];
  if (s === 'black') return [0, 0, 0];
  if (s === 'transparent' || s === 'none') return null;
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16) / 255) as RGB;
  m = /^#([0-9a-f]{6})/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16) / 255) as RGB;
  m = /^rgba?\(([^)]+)\)/.exec(s);
  if (m) { const v = m[1].split(',').map((x) => parseFloat(x)); return [v[0] / 255, v[1] / 255, v[2] / 255]; }
  return [0, 0, 0];
}
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const n2 = (v: number) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };

/** Path segments → polylines (curves flattened), with a closed flag per subpath. */
function flatten(segs: Seg[]): { pts: Pt[]; closed: boolean }[] {
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let cur: Pt[] = [];
  const end = (closed: boolean) => { if (cur.length > 1) out.push({ pts: cur, closed }); cur = []; };
  for (const s of segs) {
    if (s.t === 'M') { end(false); cur = [s.p]; }
    else if (s.t === 'L') cur.push(s.p);
    else if (s.t === 'C') {
      const p0 = cur[cur.length - 1] ?? s.c1;
      const len = Math.hypot(s.c1.x - p0.x, s.c1.y - p0.y) + Math.hypot(s.c2.x - s.c1.x, s.c2.y - s.c1.y) + Math.hypot(s.p.x - s.c2.x, s.p.y - s.c2.y);
      const n = Math.max(3, Math.min(48, Math.ceil(len / 6)));
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push({ x: u * u * u * p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.p.x, y: u * u * u * p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p.y });
      }
    } else if (s.t === 'Z') { const first = cur[0]; end(true); if (first) cur = [first]; }
  }
  end(false);
  return out;
}

/* ───────────────────────── PDF ───────────────────────── */
// WinAnsi (cp1252) for the standard Helvetica fonts; characters outside it get a plain-text stand-in
const WIN: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94 };
const SUB: Record<string, string> = { '₹': 'Rs.', '⊗': 'x', '⊕': '+', '′': "'", '″': '"', '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '↑': '^', '✓': 'OK', '✗': 'X', '∅': 'Ø', '⌀': 'Ø', '−': '-', '≈': '~' };
function pdfString(t: string): string {
  let out = '';
  for (const ch of t) {
    const sub = SUB[ch]; if (sub !== undefined) { out += pdfString(sub).slice(1, -1); continue; }
    let code = WIN[ch] ?? ch.charCodeAt(0);
    if (code > 255 || (code > 126 && code < 160 && !WIN[ch])) code = 63; // '?'
    const c = String.fromCharCode(code);
    out += c === '(' || c === ')' || c === '\\' ? '\\' + c : code < 32 || code > 126 ? '\\' + code.toString(8).padStart(3, '0') : c;
  }
  return `(${out})`;
}
function pathOps(segs: Seg[]): string {
  return segs.map((s) => s.t === 'M' ? `${n2(s.p.x)} ${n2(s.p.y)} m` : s.t === 'L' ? `${n2(s.p.x)} ${n2(s.p.y)} l`
    : s.t === 'C' ? `${n2(s.c1.x)} ${n2(s.c1.y)} ${n2(s.c2.x)} ${n2(s.c2.y)} ${n2(s.p.x)} ${n2(s.p.y)} c` : 'h').join('\n');
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as unknown as { CompressionStream?: new (f: string) => { readable: ReadableStream; writable: WritableStream } }).CompressionStream;
  if (!CS) return null;
  const cs = new CS('deflate');
  const w = cs.writable.getWriter(); w.write(data); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** Vector PDF: one A3 landscape page per sheet, true lines and Helvetica text. */
export async function sheetsToPDF(sheets: VectorSheet[], title = 'neevv drawings'): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const objs: (Uint8Array | string)[] = []; // index + 1 = object number
  const add = (o: Uint8Array | string) => { objs.push(o); return objs.length; };
  const alphas = new Map<number, string>();
  const pageIds: number[] = [];
  const font1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const font2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesId = add(''); // filled at the end
  const gsDefs: { name: string; a: number }[] = [];
  const gsName = (a: number) => { const k = Math.round(a * 100) / 100; if (!alphas.has(k)) { const nm = `GS${alphas.size + 1}`; alphas.set(k, nm); gsDefs.push({ name: nm, a: k }); } return alphas.get(k)!; };
  const contents: { sheet: VectorSheet; ops: string }[] = [];
  for (const sh of sheets) {
    const s = 841.89 / sh.height, H = sh.height;
    const o: string[] = [`${n2(s)} 0 0 ${n2(-s)} 0 ${n2(H * s)} cm`, '1 j']; // sheet pixels, y down
    for (const it of sh.items) {
      const col = rgb(it.color); if (!col) continue;
      o.push('q');
      for (const c of it.clips) o.push(pathOps(c), 'W n');
      if (it.alpha < 0.999) o.push(`/${gsName(it.alpha)} gs`);
      if (it.kind === 'text') o.push(pdfText(it, col));
      else {
        const d = it as DrawItem;
        if (d.kind === 'stroke') {
          o.push(`${col.map(n2).join(' ')} RG`, `${n2(Math.max(0.2, d.width))} w`, `${d.cap === 'round' ? 1 : d.cap === 'square' ? 2 : 0} J`, d.dash.length ? `[${d.dash.map(n2).join(' ')}] 0 d` : '[] 0 d', pathOps(d.segs), 'S');
        } else o.push(`${col.map(n2).join(' ')} rg`, pathOps(d.segs), 'f');
      }
      o.push('Q');
    }
    contents.push({ sheet: sh, ops: o.join('\n') });
  }
  const gsDict = gsDefs.length ? `/ExtGState << ${gsDefs.map((g) => `/${g.name} << /CA ${g.a} /ca ${g.a} >>`).join(' ')} >>` : '';
  for (const { sheet, ops } of contents) {
    const raw = enc.encode(ops), z = await deflate(raw);
    const body = z ?? raw;
    const head = enc.encode(`<< /Length ${body.length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`), tail = enc.encode('\nendstream');
    const stream = new Uint8Array(head.length + body.length + tail.length); stream.set(head); stream.set(body, head.length); stream.set(tail, head.length + body.length);
    const cid = add(stream);
    const w = 1190.55 * (sheet.width / sheet.height) / (420 / 297);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n2(w)} 841.89] /Contents ${cid} 0 R /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> ${gsDict} >> >>`));
  }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const info = add(`<< /Title ${pdfString(title)} /Producer (neevv drawing engine) /Creator (neevv) >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  // assemble with a cross-reference table
  const parts: Uint8Array[] = [enc.encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let off = parts[0].length; const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(off);
    const pre = enc.encode(`${i + 1} 0 obj\n`), body = typeof o === 'string' ? enc.encode(o) : o, post = enc.encode('\nendobj\n');
    parts.push(pre, body, post); off += pre.length + body.length + post.length;
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((v) => `${String(v).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${off}\n%%EOF\n`;
  parts.push(enc.encode(xref));
  const total = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(total);
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function pdfText(t: TextItem, col: RGB): string {
  const cos = Math.cos(t.angle), sin = Math.sin(t.angle);
  const dx = t.align === 'center' ? -t.width / 2 : t.align === 'right' || t.align === 'end' ? -t.width : 0;
  const dy = t.baseline === 'middle' ? t.size * 0.35 : t.baseline === 'top' || t.baseline === 'hanging' ? t.size * 0.78 : t.baseline === 'bottom' || t.baseline === 'ideographic' ? -t.size * 0.21 : 0;
  // anchor moved along the text's own axes (x along the line, y down the page)
  const x = t.x + dx * cos - dy * sin, y = t.y + dx * sin + dy * cos;
  return `${col.map(n2).join(' ')} rg BT /${t.bold ? 'F2' : 'F1'} ${n2(t.size)} Tf ${n2(cos)} ${n2(sin)} ${n2(sin)} ${n2(-cos)} ${n2(x)} ${n2(y)} Tm ${pdfString(t.text)} Tj ET`;
}

/* ───────────────────────── DXF (R12, mm on the A3 sheet) ───────────────────────── */
const ACI: [number, RGB][] = [[1, [1, 0, 0]], [2, [1, 1, 0]], [3, [0, 1, 0]], [4, [0, 1, 1]], [5, [0, 0, 1]], [6, [1, 0, 1]], [7, [0, 0, 0]], [8, [0.5, 0.5, 0.5]], [9, [0.75, 0.75, 0.75]],
  [30, [1, 0.5, 0]], [34, [0.65, 0.33, 0]], [94, [0, 0.5, 0]], [134, [0, 0.4, 0.5]], [150, [0, 0.5, 1]], [174, [0, 0.25, 0.5]], [252, [0.33, 0.33, 0.33]], [253, [0.5, 0.5, 0.5]], [254, [0.68, 0.68, 0.68]]];
function aci(c: RGB): number { let best = 7, bd = 9; for (const [n, v] of ACI) { const d = (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2 + (v[2] - c[2]) ** 2; if (d < bd) { bd = d; best = n; } } return best; }
function layerFor(it: DrawItem, col: RGB): string {
  const sat = Math.max(...col) - Math.min(...col);
  if (it.kind === 'fill') return 'NV-FILL';
  if (sat > 0.25) return 'NV-SERVICES';
  if (it.dash.length) return 'NV-CENTRE-HIDDEN';
  if (lum(col) > 0.72) return 'NV-HATCH';
  if (it.width >= 2.4) return 'NV-CUT';
  if (it.width <= 1.05) return 'NV-THIN';
  return 'NV-LINES';
}
const LAYERS: [string, number][] = [['NV-CUT', 7], ['NV-LINES', 7], ['NV-THIN', 8], ['NV-HATCH', 9], ['NV-CENTRE-HIDDEN', 8], ['NV-SERVICES', 150], ['NV-FILL', 8], ['NV-TEXT', 7]];

function inside(p: Pt, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
/** Pieces of segment pq inside the clip polygon. */
function clipSeg(p: Pt, q: Pt, poly: Pt[]): [Pt, Pt][] {
  const ts = [0, 1];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i], rx = q.x - p.x, ry = q.y - p.y, sx = b.x - a.x, sy = b.y - a.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den, u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const at = (t: number): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const out: [Pt, Pt][] = [];
  for (let i = 0; i < ts.length - 1; i++) if (ts[i + 1] - ts[i] > 1e-6 && inside(at((ts[i] + ts[i + 1]) / 2), poly)) out.push([at(ts[i]), at(ts[i + 1])]);
  return out;
}
function clipPolyline(pts: Pt[], clips: Pt[][]): Pt[][] {
  let runs: Pt[][] = [pts];
  for (const poly of clips) {
    const next: Pt[][] = [];
    for (const run of runs) {
      let cur: Pt[] = [];
      for (let i = 0; i < run.length - 1; i++) {
        const pieces = clipSeg(run[i], run[i + 1], poly);
        for (const [a, b] of pieces) {
          const last = cur[cur.length - 1];
          if (last && Math.hypot(last.x - a.x, last.y - a.y) < 1e-6) cur.push(b); else { if (cur.length > 1) next.push(cur); cur = [a, b]; }
        }
        if (!pieces.length || pieces[pieces.length - 1][1] !== undefined && Math.hypot(pieces[pieces.length - 1][1].x - run[i + 1].x, pieces[pieces.length - 1][1].y - run[i + 1].y) > 1e-6) { if (cur.length > 1) next.push(cur); cur = []; }
      }
      if (cur.length > 1) next.push(cur);
    }
    runs = next;
  }
  return runs;
}
/** Text for an ANSI_1252 DXF: Latin-1 characters kept as they are (×, ², Ø, °), others in plain words. */
function dxfText(t: string): string {
  let out = '';
  for (const ch of t) {
    const sub = SUB[ch]; if (sub !== undefined) { out += sub; continue; }
    const c = ch.codePointAt(0)!;
    out += c < 256 && (c >= 32 && c < 127 || c >= 160) ? ch : WIN[ch] ? ({ '—': '-', '–': '-', '…': '...', '•': '*', '‘': "'", '’': "'", '“': '"', '”': '"' } as Record<string, string>)[ch] ?? '?' : '?';
  }
  return out;
}
/** DXF text as bytes in the file's code page (Windows-1252 / Latin-1 for the characters dxfText keeps). */
export function dxfBytes(dxf: string): Uint8Array { const b = new Uint8Array(dxf.length); for (let i = 0; i < dxf.length; i++) b[i] = dxf.charCodeAt(i) & 0xff; return b; }

/** One sheet as DXF R12: paper millimetres (A3 = 420 × 297), layers by line role, true text. */
export function sheetToDXF(sh: VectorSheet): string {
  const X = (x: number) => n2(x / PX_PER_MM), Y = (y: number) => n2((sh.height - y) / PX_PER_MM);
  const e: string[] = [];
  const g = (code: number, v: string | number) => e.push(String(code), String(v));
  for (const it of sh.items) {
    const col = rgb(it.color); if (!col) continue;
    const clipPolys = it.clips.map((c) => flatten(c).flatMap((f) => f.pts)).filter((p) => p.length > 2);
    if (it.kind === 'text') {
      if (clipPolys.some((p) => !inside({ x: it.x, y: it.y }, p))) continue;
      const h = (it.size * 0.72) / PX_PER_MM, rot = (-it.angle * 180) / Math.PI;
      const hj = it.align === 'center' ? 1 : it.align === 'right' || it.align === 'end' ? 2 : 0, vj = it.baseline === 'middle' ? 2 : it.baseline === 'top' ? 3 : it.baseline === 'bottom' ? 1 : 0;
      g(0, 'TEXT'); g(8, 'NV-TEXT'); g(62, aci(col)); g(10, X(it.x)); g(20, Y(it.y)); g(30, 0); g(40, n2(h)); g(1, dxfText(it.text));
      if (Math.abs(rot) > 0.01) g(50, n2(rot));
      g(7, it.bold ? 'NV-BOLD' : 'NV-TEXT');
      if (hj || vj) { g(72, hj); g(11, X(it.x)); g(21, Y(it.y)); g(31, 0); g(73, vj); }
      continue;
    }
    const d = it as DrawItem, polys = flatten(d.segs);
    if (d.kind === 'fill') {
      // dark solid fills (wall poché, arrowheads) as SOLIDs; light / white fills are backgrounds and are left out
      if (lum(col) > 0.6) continue;
      for (const f of polys) {
        const pts = f.pts.filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.y - a[i - 1].y) > 1e-6);
        if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6) pts.pop();
        if (pts.length < 3 || pts.length > 4 || clipPolys.length) continue;
        const [a, b, c, dd] = pts.length === 3 ? [pts[0], pts[1], pts[2], pts[2]] : pts;
        g(0, 'SOLID'); g(8, 'NV-FILL'); g(62, aci(col));
        g(10, X(a.x)); g(20, Y(a.y)); g(30, 0); g(11, X(b.x)); g(21, Y(b.y)); g(31, 0); g(12, X(dd.x)); g(22, Y(dd.y)); g(32, 0); g(13, X(c.x)); g(23, Y(c.y)); g(33, 0);
      }
      continue;
    }
    const layer = layerFor(d, col), ci = aci(col), wmm = d.width / PX_PER_MM >= 0.35 ? n2(d.width / PX_PER_MM) : '';
    for (const f of polys) {
      const pts = f.closed ? [...f.pts, f.pts[0]] : f.pts;
      for (const run of clipPolys.length ? clipPolyline(pts, clipPolys) : [pts]) {
        if (run.length === 2 && !wmm) {
          g(0, 'LINE'); g(8, layer); g(62, ci); if (d.dash.length) g(6, 'DASHED');
          g(10, X(run[0].x)); g(20, Y(run[0].y)); g(30, 0); g(11, X(run[1].x)); g(21, Y(run[1].y)); g(31, 0);
        } else if (run.length >= 2) {
          g(0, 'POLYLINE'); g(8, layer); g(62, ci); if (d.dash.length) g(6, 'DASHED'); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 0);
          if (wmm) { g(40, wmm); g(41, wmm); }
          for (const p of run) { g(0, 'VERTEX'); g(8, layer); g(10, X(p.x)); g(20, Y(p.y)); g(30, 0); }
          g(0, 'SEQEND'); g(8, layer);
        }
      }
    }
  }
  const W = n2(sh.width / PX_PER_MM), Hh = n2(sh.height / PX_PER_MM);
  const head = [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$DWGCODEPAGE', '3', 'ANSI_1252', '9', '$INSBASE', '10', '0', '20', '0', '30', '0',
    '9', '$EXTMIN', '10', '0', '20', '0', '30', '0', '9', '$EXTMAX', '10', W, '20', Hh, '30', '0',
    '9', '$LIMMIN', '10', '0', '20', '0', '9', '$LIMMAX', '10', W, '20', Hh, '9', '$LTSCALE', '40', '1', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LTYPE', '70', '2',
    '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0',
    '0', 'LTYPE', '2', 'DASHED', '70', '0', '3', '__ __ __', '72', '65', '73', '2', '40', '4.5', '49', '3', '49', '-1.5',
    '0', 'ENDTAB',
    '0', 'TABLE', '2', 'LAYER', '70', String(LAYERS.length + 1),
    '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS',
    ...LAYERS.flatMap(([n, c]) => ['0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS']),
    '0', 'ENDTAB',
    '0', 'TABLE', '2', 'STYLE', '70', '2',
    '0', 'STYLE', '2', 'NV-TEXT', '70', '0', '40', '0', '41', '1', '50', '0', '71', '0', '42', '2.5', '3', 'arial.ttf', '4', '',
    '0', 'STYLE', '2', 'NV-BOLD', '70', '0', '40', '0', '41', '1', '50', '0', '71', '0', '42', '2.5', '3', 'arialbd.ttf', '4', '',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];
  return [...head, ...e, '0', 'ENDSEC', '0', 'EOF', ''].join('\r\n');
}

/* ───────────────────────── ZIP (stored) ───────────────────────── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** A plain (uncompressed) ZIP of the given files. */
export function zipFiles(files: { name: string; data: Uint8Array | string }[]): Uint8Array {
  const enc = new TextEncoder(), chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let at = 0; for (const c of all) { out.set(c, at); at += c.length; }
  return out;
}
