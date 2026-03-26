/* ── Shared SVG Drawing Helpers for Construction Drawings ── */
/* Used by all working drawing renderers */
import { BRAND_LOGO_BASE64 } from './brand';

export const C = {
  wall: '#1a1a1a', dim: '#444', grid: '#0055AA', hatch: '#888',
  concrete: '#C0C0C0', earth: '#C4A060', steel: '#555', glass: '#A0C8E0',
  wood: '#8B7355', bg: '#FEFEFE', text: '#111', slab: '#B0A898',
  plaster: '#F0ECE4', band: '#D8D0C0', plinth: '#C8C0B0',
  water: '#4488CC', hotWater: '#CC4444', drain: '#886644',
  elecRed: '#CC3333', elecBlue: '#3366CC', elecGreen: '#33AA33',
  tile: '#D4C4B0', tileGreen: '#88AA88', tileBlue: '#8899BB',
  brick: '#C47040', mortar: '#BBAA88',
};

export const MARGIN = 90;
export const SC = 42; // px per meter

/* ── Transform helpers ── */
export const txFn = (m: number) => MARGIN + m * SC;
export const tyFn = (baseY: number, m: number) => baseY - m * SC;

/* ── Dimension chain with 45° ticks ── */
export function dimChain(x1: number, y1: number, x2: number, y2: number, label: string, offset: number, horizontal: boolean): string {
  const p: string[] = [];
  if (horizontal) {
    const dy = offset;
    p.push(`<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1 + dy}" stroke="${C.dim}" stroke-width="0.3"/>`);
    p.push(`<line x1="${x2}" y1="${y1}" x2="${x2}" y2="${y1 + dy}" stroke="${C.dim}" stroke-width="0.3"/>`);
    const ly = y1 + dy * 0.8;
    p.push(`<line x1="${x1}" y1="${ly}" x2="${x2}" y2="${ly}" stroke="${C.dim}" stroke-width="0.5"/>`);
    p.push(`<line x1="${x1 - 2}" y1="${ly + 2}" x2="${x1 + 2}" y2="${ly - 2}" stroke="${C.dim}" stroke-width="0.8"/>`);
    p.push(`<line x1="${x2 - 2}" y1="${ly + 2}" x2="${x2 + 2}" y2="${ly - 2}" stroke="${C.dim}" stroke-width="0.8"/>`);
    p.push(`<text x="${(x1 + x2) / 2}" y="${ly - 3}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">${label}</text>`);
  } else {
    const dx = offset;
    p.push(`<line x1="${x1}" y1="${y1}" x2="${x1 + dx}" y2="${y1}" stroke="${C.dim}" stroke-width="0.3"/>`);
    p.push(`<line x1="${x1}" y1="${y2}" x2="${x1 + dx}" y2="${y2}" stroke="${C.dim}" stroke-width="0.3"/>`);
    const lx = x1 + dx * 0.8;
    p.push(`<line x1="${lx}" y1="${y1}" x2="${lx}" y2="${y2}" stroke="${C.dim}" stroke-width="0.5"/>`);
    p.push(`<line x1="${lx - 2}" y1="${y1 + 2}" x2="${lx + 2}" y2="${y1 - 2}" stroke="${C.dim}" stroke-width="0.8"/>`);
    p.push(`<line x1="${lx - 2}" y1="${y2 + 2}" x2="${lx + 2}" y2="${y2 - 2}" stroke="${C.dim}" stroke-width="0.8"/>`);
    p.push(`<text x="${lx + 5}" y="${(y1 + y2) / 2 + 3}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">${label}</text>`);
  }
  return p.join('');
}

/* ── Level mark (triangle + RL) ── */
export function levelMark(x: number, y: number, label: string, rl: string): string {
  const p: string[] = [];
  p.push(`<polygon points="${x},${y} ${x - 5},${y + 5} ${x + 5},${y + 5}" fill="none" stroke="${C.dim}" stroke-width="0.6"/>`);
  p.push(`<line x1="${x - 25}" y1="${y}" x2="${x + 25}" y2="${y}" stroke="${C.dim}" stroke-width="0.3" stroke-dasharray="2,2"/>`);
  p.push(`<text x="${x + 28}" y="${y + 3}" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}">${label}</text>`);
  p.push(`<text x="${x + 28}" y="${y + 10}" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">RL ${rl}</text>`);
  return p.join('');
}

/* ── Concrete hatch (diagonal lines clipped to rect) ── */
export function concreteHatch(id: string, x: number, y: number, w: number, h: number, spacing: number = 4): string {
  const p: string[] = [];
  p.push(`<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>`);
  p.push(`<g clip-path="url(#${id})">`);
  for (let d = 0; d < w + h; d += spacing) {
    p.push(`<line x1="${x + d}" y1="${y}" x2="${x}" y2="${y + d}" stroke="${C.hatch}" stroke-width="0.3"/>`);
  }
  p.push('</g>');
  return p.join('');
}

/* ── Cross hatch (double diagonal) ── */
export function crossHatch(id: string, x: number, y: number, w: number, h: number, spacing: number = 5): string {
  const p: string[] = [];
  p.push(`<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>`);
  p.push(`<g clip-path="url(#${id})">`);
  for (let d = 0; d < w + h; d += spacing) {
    p.push(`<line x1="${x + d}" y1="${y}" x2="${x}" y2="${y + d}" stroke="${C.hatch}" stroke-width="0.2"/>`);
    p.push(`<line x1="${x + w - d}" y1="${y}" x2="${x + w}" y2="${y + d}" stroke="${C.hatch}" stroke-width="0.2"/>`);
  }
  p.push('</g>');
  return p.join('');
}

/* ── Brick hatch pattern ── */
export function brickHatch(id: string, x: number, y: number, w: number, h: number): string {
  const p: string[] = [];
  p.push(`<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>`);
  p.push(`<g clip-path="url(#${id})">`);
  const bh = 3.5; // brick height in px
  const bw = 8; // brick width in px
  for (let row = 0; row * bh < h; row++) {
    const ry = y + row * bh;
    p.push(`<line x1="${x}" y1="${ry}" x2="${x + w}" y2="${ry}" stroke="${C.brick}" stroke-width="0.2"/>`);
    const off = row % 2 === 0 ? 0 : bw / 2;
    for (let bx = off; bx < w; bx += bw) {
      p.push(`<line x1="${x + bx}" y1="${ry}" x2="${x + bx}" y2="${ry + bh}" stroke="${C.brick}" stroke-width="0.2"/>`);
    }
  }
  p.push('</g>');
  return p.join('');
}

/* ── Drawing border + title block ── */
export function drawingBorder(svgW: number, svgH: number, title: string, subtitle: string): string {
  const LOGO = BRAND_LOGO_BASE64;
  const p: string[] = [];
  p.push(`<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="${C.bg}" stroke="${C.wall}" stroke-width="1.5"/>`);
  p.push(`<rect x="4" y="4" width="${svgW - 8}" height="${svgH - 8}" fill="none" stroke="${C.wall}" stroke-width="0.5"/>`);
  p.push(`<text x="${svgW / 2}" y="28" text-anchor="middle" font-size="13" font-family="'Courier New',monospace" font-weight="700" fill="${C.text}" letter-spacing="3">${title}</text>`);
  p.push(`<text x="${svgW / 2}" y="42" text-anchor="middle" font-size="7" font-family="'Courier New',monospace" fill="${C.dim}">${subtitle}</text>`);
  // Brand logo watermark - small, top-left corner
  p.push(`<image href="${LOGO}" x="10" y="10" width="100" height="33" opacity="0.35" preserveAspectRatio="xMidYMid meet"/>`);
  return p.join('');
}

/* ── North arrow ── */
export function northArrow(x: number, y: number): string {
  const p: string[] = [];
  p.push(`<polygon points="${x},${y - 15} ${x - 5},${y} ${x},${y - 5}" fill="#333" stroke="${C.wall}" stroke-width="0.3"/>`);
  p.push(`<polygon points="${x},${y - 15} ${x + 5},${y} ${x},${y - 5}" fill="#CCC" stroke="${C.wall}" stroke-width="0.3"/>`);
  p.push(`<text x="${x}" y="${y + 8}" text-anchor="middle" font-size="7" font-family="'Courier New',monospace" fill="${C.wall}" font-weight="700">N</text>`);
  return p.join('');
}

/* ── Legend line ── */
export function legend(svgW: number, svgH: number, text: string): string {
  return `<text x="20" y="${svgH - 18}" font-size="5.5" font-family="'Courier New',monospace" fill="${C.dim}">${text}</text>`;
}

/* ── Grid labels (circles with A/B/C and 1/2/3) ── */
export function gridLabels(xs: number[], ys: number[], plotW: number, plotD: number): string {
  const p: string[] = [];
  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => MARGIN + m * SC;

  xs.forEach((xv, i) => {
    p.push(`<line x1="${tx(xv)}" y1="${ty(0) - 15}" x2="${tx(xv)}" y2="${ty(plotD) + 5}" stroke="${C.grid}" stroke-width="0.2" stroke-dasharray="6,4"/>`);
    // Top circle
    p.push(`<circle cx="${tx(xv)}" cy="${ty(0) - 25}" r="9" fill="#FFF" stroke="${C.grid}" stroke-width="0.6"/>`);
    p.push(`<text x="${tx(xv)}" y="${ty(0) - 22}" text-anchor="middle" font-size="7" font-family="'Courier New',monospace" fill="${C.grid}" font-weight="700">${String.fromCharCode(65 + i)}</text>`);
    // Bottom circle
    p.push(`<circle cx="${tx(xv)}" cy="${ty(plotD) + 15}" r="9" fill="#FFF" stroke="${C.grid}" stroke-width="0.6"/>`);
    p.push(`<text x="${tx(xv)}" y="${ty(plotD) + 18}" text-anchor="middle" font-size="7" font-family="'Courier New',monospace" fill="${C.grid}" font-weight="700">${String.fromCharCode(65 + i)}</text>`);
  });

  ys.forEach((yv, i) => {
    p.push(`<line x1="${tx(0) - 15}" y1="${ty(yv)}" x2="${tx(plotW) + 5}" y2="${ty(yv)}" stroke="${C.grid}" stroke-width="0.2" stroke-dasharray="6,4"/>`);
    // Left circle
    p.push(`<circle cx="${tx(0) - 25}" cy="${ty(yv)}" r="9" fill="#FFF" stroke="${C.grid}" stroke-width="0.6"/>`);
    p.push(`<text x="${tx(0) - 25}" y="${ty(yv) + 3}" text-anchor="middle" font-size="7" font-family="'Courier New',monospace" fill="${C.grid}" font-weight="700">${i + 1}</text>`);
    // Right circle
    p.push(`<circle cx="${tx(plotW) + 15}" cy="${ty(yv)}" r="9" fill="#FFF" stroke="${C.grid}" stroke-width="0.6"/>`);
    p.push(`<text x="${tx(plotW) + 15}" y="${ty(yv) + 3}" text-anchor="middle" font-size="7" font-family="'Courier New',monospace" fill="${C.grid}" font-weight="700">${i + 1}</text>`);
  });

  return p.join('');
}

/* ── Table helper for schedules ── */
export function drawTable(x: number, y: number, headers: string[], rows: string[][], colWidths: number[]): string {
  const p: string[] = [];
  const rowH = 14;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const totalH = (rows.length + 1) * rowH + 4;

  p.push(`<rect x="${x}" y="${y}" width="${totalW + 4}" height="${totalH}" fill="#FFF" stroke="${C.wall}" stroke-width="0.6"/>`);

  // Header
  let hx = x + 2;
  headers.forEach((h, i) => {
    p.push(`<text x="${hx + 2}" y="${y + 11}" font-size="5" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">${h}</text>`);
    hx += colWidths[i];
    if (i < headers.length - 1) {
      p.push(`<line x1="${hx}" y1="${y}" x2="${hx}" y2="${y + totalH}" stroke="${C.dim}" stroke-width="0.3"/>`);
    }
  });
  p.push(`<line x1="${x}" y1="${y + rowH}" x2="${x + totalW + 4}" y2="${y + rowH}" stroke="${C.wall}" stroke-width="0.4"/>`);

  // Rows
  rows.forEach((row, ri) => {
    let rx = x + 2;
    const ry = y + (ri + 1) * rowH + 11;
    row.forEach((cell, ci) => {
      p.push(`<text x="${rx + 2}" y="${ry}" font-size="4.5" font-family="'Courier New',monospace" fill="${C.dim}">${cell}</text>`);
      rx += colWidths[ci];
    });
    if (ri < rows.length - 1) {
      p.push(`<line x1="${x}" y1="${y + (ri + 2) * rowH}" x2="${x + totalW + 4}" y2="${y + (ri + 2) * rowH}" stroke="${C.dim}" stroke-width="0.2"/>`);
    }
  });

  return p.join('');
}
