/**
 * A recording stand-in for CanvasRenderingContext2D. The drawing engine draws into it exactly as it
 * draws into a real canvas; every stroke, fill and text is kept as vector data in sheet pixels
 * (2100 × 1485 = A3 at 5 px per paper-mm) for the PDF and CAD writers. Only the canvas features the
 * engine uses are implemented: paths (lines, arcs, ellipses, quadratic curves, rects), stroke / fill,
 * rect helpers, dashes, line width / cap, alpha, save / restore, translate / rotate, clipping, text.
 */
export type Pt = { x: number; y: number };
/** Path segment in sheet coordinates: move, line, cubic curve, close. */
export type Seg = { t: 'M'; p: Pt } | { t: 'L'; p: Pt } | { t: 'C'; c1: Pt; c2: Pt; p: Pt } | { t: 'Z' };
export interface DrawItem {
  kind: 'stroke' | 'fill';
  segs: Seg[];
  color: string; alpha: number;
  width: number; dash: number[]; cap: CanvasLineCap;
  clips: Seg[][];
}
export interface TextItem {
  kind: 'text';
  text: string; x: number; y: number; angle: number;
  size: number; bold: boolean; align: CanvasTextAlign; baseline: CanvasTextBaseline;
  width: number; color: string; alpha: number; clips: Seg[][];
}
export type VItem = DrawItem | TextItem;
export interface VectorSheet { width: number; height: number; items: VItem[]; title?: string; sheetNo?: string }

type M = [number, number, number, number, number, number]; // a b c d e f
interface State { m: M; stroke: string; fill: string; lw: number; dash: number[]; cap: CanvasLineCap; join: CanvasLineJoin; alpha: number; font: string; align: CanvasTextAlign; baseline: CanvasTextBaseline; clips: Seg[][] }


let measurer: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  if (!measurer && typeof document !== 'undefined') measurer = document.createElement('canvas').getContext('2d');
  if (measurer) { measurer.font = font; return measurer.measureText(text).width; }
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12);
  return text.length * size * (/700|bold/.test(font) ? 0.58 : 0.54);
}

export class VectorContext {
  items: VItem[] = [];
  private st: State = { m: [1, 0, 0, 1, 0, 0], stroke: '#000000', fill: '#000000', lw: 1, dash: [], cap: 'butt', join: 'miter', alpha: 1, font: '10px Arial, sans-serif', align: 'start', baseline: 'alphabetic', clips: [] };
  private stack: State[] = [];
  private path: Seg[] = [];
  private cur: Pt | null = null; // current point in user space
  private start: Pt | null = null;
  constructor(readonly width: number, readonly height: number) {}

  // ── state ──
  save(): void { this.stack.push({ ...this.st, m: [...this.st.m] as M, dash: [...this.st.dash], clips: [...this.st.clips] }); }
  restore(): void { const s = this.stack.pop(); if (s) this.st = s; }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) { this.st.stroke = String(v); } get strokeStyle(): string { return this.st.stroke; }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) { this.st.fill = String(v); } get fillStyle(): string { return this.st.fill; }
  set lineWidth(v: number) { if (Number.isFinite(v) && v > 0) this.st.lw = v; } get lineWidth(): number { return this.st.lw; }
  set lineCap(v: CanvasLineCap) { this.st.cap = v; } get lineCap(): CanvasLineCap { return this.st.cap; }
  set lineJoin(v: CanvasLineJoin) { this.st.join = v; } get lineJoin(): CanvasLineJoin { return this.st.join; }
  set globalAlpha(v: number) { if (Number.isFinite(v)) this.st.alpha = Math.max(0, Math.min(1, v)); } get globalAlpha(): number { return this.st.alpha; }
  set font(v: string) { this.st.font = v; } get font(): string { return this.st.font; }
  set textAlign(v: CanvasTextAlign) { this.st.align = v; } get textAlign(): CanvasTextAlign { return this.st.align; }
  set textBaseline(v: CanvasTextBaseline) { this.st.baseline = v; } get textBaseline(): CanvasTextBaseline { return this.st.baseline; }
  setLineDash(d: number[]): void { this.st.dash = d.filter((v) => Number.isFinite(v) && v >= 0); }
  getLineDash(): number[] { return [...this.st.dash]; }

  // ── transforms ──
  private mul(n: M): void { const [a, b, c, d, e, f] = this.st.m; this.st.m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f]; }
  translate(x: number, y: number): void { this.mul([1, 0, 0, 1, x, y]); }
  rotate(r: number): void { const c = Math.cos(r), s = Math.sin(r); this.mul([c, s, -s, c, 0, 0]); }
  scale(x: number, y: number): void { this.mul([x, 0, 0, y, 0, 0]); }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.st.m = [a, b, c, d, e, f]; }
  resetTransform(): void { this.st.m = [1, 0, 0, 1, 0, 0]; }
  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number } { const [a, b, c, d, e, f] = this.st.m; return { a, b, c, d, e, f }; }
  private T(x: number, y: number): Pt { const [a, b, c, d, e, f] = this.st.m; return { x: a * x + c * y + e, y: b * x + d * y + f }; }
  private get lineScale(): number { const [a, b, c, d] = this.st.m; return Math.sqrt(Math.abs(a * d - b * c)) || 1; }

  // ── paths (stored already transformed to sheet space) ──
  beginPath(): void { this.path = []; this.cur = null; this.start = null; }
  moveTo(x: number, y: number): void { this.path.push({ t: 'M', p: this.T(x, y) }); this.cur = { x, y }; this.start = { x, y }; }
  lineTo(x: number, y: number): void { if (!this.cur) return this.moveTo(x, y); this.path.push({ t: 'L', p: this.T(x, y) }); this.cur = { x, y }; }
  closePath(): void { if (this.cur) { this.path.push({ t: 'Z' }); this.cur = this.start; } }
  rect(x: number, y: number, w: number, h: number): void { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  private curve(c1: Pt, c2: Pt, p: Pt): void { this.path.push({ t: 'C', c1: this.T(c1.x, c1.y), c2: this.T(c2.x, c2.y), p: this.T(p.x, p.y) }); this.cur = p; }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const p0 = this.cur ?? { x: cx, y: cy }; if (!this.cur) this.moveTo(p0.x, p0.y);
    this.curve({ x: p0.x + (2 / 3) * (cx - p0.x), y: p0.y + (2 / 3) * (cy - p0.y) }, { x: x + (2 / 3) * (cx - x), y: y + (2 / 3) * (cy - y) }, { x, y });
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void { if (!this.cur) this.moveTo(c1x, c1y); this.curve({ x: c1x, y: c1y }, { x: c2x, y: c2y }, { x, y }); }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % (2 * Math.PI)) + 2 * Math.PI; else if (ccw && sweep > 0) sweep = (sweep % (2 * Math.PI)) - 2 * Math.PI;
    if (Math.abs(a1 - a0) >= 2 * Math.PI - 1e-9) sweep = ccw ? -2 * Math.PI : 2 * Math.PI;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const P = (a: number): Pt => { const ex = rx * Math.cos(a), ey = ry * Math.sin(a); return { x: x + ex * cr - ey * sr, y: y + ex * sr + ey * cr }; };
    const D = (a: number): Pt => { const ex = -rx * Math.sin(a), ey = ry * Math.cos(a); return { x: ex * cr - ey * sr, y: ex * sr + ey * cr }; };
    const p0 = P(a0);
    if (this.cur) this.lineTo(p0.x, p0.y); else this.moveTo(p0.x, p0.y);
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2))), step = sweep / n, k = (4 / 3) * Math.tan(step / 4);
    for (let i = 0; i < n; i++) {
      const s = a0 + i * step, e = s + step, ps = P(s), pe = P(e), ds = D(s), de = D(e);
      this.curve({ x: ps.x + k * ds.x, y: ps.y + k * ds.y }, { x: pe.x - k * de.x, y: pe.y - k * de.y }, pe);
    }
  }

  // ── painting ──
  private push(kind: 'stroke' | 'fill', segs: Seg[]): void {
    if (!segs.length) return;
    const color = kind === 'stroke' ? this.st.stroke : this.st.fill;
    if (color === 'transparent' || this.st.alpha <= 0) return;
    const ls = this.lineScale;
    this.items.push({ kind, segs, color, alpha: this.st.alpha, width: this.st.lw * ls, dash: this.st.dash.map((v) => v * ls), cap: this.st.cap, clips: this.st.clips });
  }
  stroke(): void { this.push('stroke', [...this.path]); }
  fill(): void { this.push('fill', [...this.path]); }
  private rectSegs(x: number, y: number, w: number, h: number): Seg[] {
    return [{ t: 'M', p: this.T(x, y) }, { t: 'L', p: this.T(x + w, y) }, { t: 'L', p: this.T(x + w, y + h) }, { t: 'L', p: this.T(x, y + h) }, { t: 'Z' }];
  }
  fillRect(x: number, y: number, w: number, h: number): void { this.push('fill', this.rectSegs(x, y, w, h)); }
  strokeRect(x: number, y: number, w: number, h: number): void { this.push('stroke', this.rectSegs(x, y, w, h)); }
  clearRect(x: number, y: number, w: number, h: number): void { const f = this.st.fill, a = this.st.alpha; this.st.fill = '#ffffff'; this.st.alpha = 1; this.fillRect(x, y, w, h); this.st.fill = f; this.st.alpha = a; }
  clip(): void { if (this.path.length) this.st.clips = [...this.st.clips, [...this.path]]; }

  // ── text ──
  measureText(text: string): TextMetrics { return { width: measure(text, this.st.font) } as TextMetrics; }
  fillText(text: string, x: number, y: number): void {
    if (!text || this.st.alpha <= 0) return;
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.st.font)?.[1] ?? 10), bold = /\b(700|bold)\b/.test(this.st.font);
    const p = this.T(x, y), [a, b] = this.st.m, ls = this.lineScale;
    this.items.push({ kind: 'text', text, x: p.x, y: p.y, angle: Math.atan2(b, a), size: size * ls, bold, align: this.st.align, baseline: this.st.baseline,
      width: measure(text, this.st.font) * ls, color: this.st.fill, alpha: this.st.alpha, clips: this.st.clips });
  }

  sheet(extra: Partial<VectorSheet> = {}): VectorSheet { return { width: this.width, height: this.height, items: this.items, ...extra }; }
}
