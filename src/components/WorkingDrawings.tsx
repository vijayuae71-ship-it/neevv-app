'use client';

import React, { useState } from 'react';
import { Layout, ProjectRequirements, BOQ } from '../types';
import {
  Layers, Grid3x3, ArrowUpDown, Building, Shovel, Columns3,
  BarChart3, BrickWall, Zap, Droplets, Grid2x2, Ruler, Download,
  Footprints, Container, ShieldCheck, Pipette, Sparkles, Image as ImageIcon
} from 'lucide-react';
import { exportToPDF, ExportProgress } from '../utils/pdfExport';

/* ── Import all drawing renderers ── */
import { C, MARGIN, SC, dimChain, levelMark, concreteHatch, drawingBorder, northArrow, legend, gridLabels } from '../utils/drawingHelpers';
import { renderExcavation } from '../utils/drawings/excavation';
import { renderReinforcement } from '../utils/drawings/reinforcement';
import { renderBarBending } from '../utils/drawings/barBending';
import { renderBrickwork } from '../utils/drawings/brickwork';
import { renderElectrical } from '../utils/drawings/electrical';
import { renderPlumbing } from '../utils/drawings/plumbing';
import { renderTiling } from '../utils/drawings/tiling';
import { renderRCCDetail } from '../utils/drawings/rccDetail';
import { renderFootingDetail } from '../utils/drawings/footingDetail';
import { renderStaircase } from '../utils/drawings/staircase';
import { renderWaterTank } from '../utils/drawings/waterTank';
import { renderWaterproofing } from '../utils/drawings/waterproofing';
import { renderSTP } from '../utils/drawings/stp';

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
  boq?: BOQ | null;
}

type DrawingType =
  | 'excavation'
  | 'foundation'
  | 'rccDetail'
  | 'section'
  | 'elevation'
  | 'structural'
  | 'reinforcement'
  | 'barBending'
  | 'brickwork'
  | 'electrical'
  | 'plumbing'
  | 'tiling'
  | 'footingDetail'
  | 'staircase'
  | 'waterTank'
  | 'waterproofing'
  | 'stp';

/* ══════════════════════════════════════════ */
/* ── SECTION A-A (inline — kept from original) ── */
/* ══════════════════════════════════════════ */
function renderSection(layout: Layout, numFloors: number): string {
  const bW = layout.buildableWidthM;
  const sX = layout.setbacks.left;
  const wallH = 3.0;
  const slabT = 0.15;
  const footD = 1.0;
  const footW = 1.2;
  const plinthH = 0.45;
  const colW = 0.23;

  const svgW = (layout.plotWidthM + 5) * SC;
  const svgH = (numFloors * wallH + footD + 4) * SC;
  const baseY = svgH - MARGIN - footD * SC;

  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => baseY - m * SC;

  const parts: string[] = [];

  parts.push(drawingBorder(svgW, svgH, 'SECTION A-A',
    `Scale 1:${Math.round(1000 / SC)} • ${numFloors} Floor(s) • Floor-to-Floor: 3000mm • Slab: 150mm • M20 Grade Concrete`));

  // Ground line
  parts.push(`<line x1="20" y1="${ty(0)}" x2="${svgW - 20}" y2="${ty(0)}" stroke="${C.earth}" stroke-width="2.5"/>`);
  parts.push(`<rect x="20" y="${ty(0)}" width="${svgW - 40}" height="${(footD + 0.5) * SC}" fill="#F5ECD0" opacity="0.4"/>`);
  for (let hx = 20; hx < svgW - 20; hx += 8) {
    parts.push(`<line x1="${hx}" y1="${ty(0) + 2}" x2="${hx + 5}" y2="${ty(-0.3)}" stroke="${C.earth}" stroke-width="0.3" opacity="0.5"/>`);
  }
  parts.push(levelMark(tx(sX) - 35, ty(0), 'GL', '±0.000'));

  // Columns and footings
  const nCols = Math.ceil(bW / 4.0) + 1;
  const colSpacing = bW / (nCols - 1);

  for (let ci = 0; ci < nCols; ci++) {
    const cx = sX + ci * colSpacing;
    const fL = tx(cx - footW / 2);
    const fR = tx(cx + footW / 2);
    const fTop = ty(-0.2);
    const fBot = ty(-footD);
    const fW = fR - fL;
    const fH = fTop - fBot;

    parts.push(`<rect x="${fL}" y="${fBot}" width="${fW}" height="${fH}" fill="#DDD" stroke="${C.wall}" stroke-width="1.2"/>`);
    parts.push(concreteHatch(`ft${ci}`, fL, fBot, fW, fH));
    parts.push(`<rect x="${fL - 5}" y="${fBot}" width="${fW + 10}" height="${4}" fill="#E0D8C8" stroke="${C.wall}" stroke-width="0.4"/>`);

    for (let si = 0; si < 3; si++) {
      const barY = fTop - 4 - si * 4;
      parts.push(`<line x1="${fL + 3}" y1="${barY}" x2="${fR - 3}" y2="${barY}" stroke="${C.steel}" stroke-width="1"/>`);
      parts.push(`<line x1="${fL + 3}" y1="${barY}" x2="${fL + 3}" y2="${barY - 4}" stroke="${C.steel}" stroke-width="0.8"/>`);
      parts.push(`<line x1="${fR - 3}" y1="${barY}" x2="${fR - 3}" y2="${barY - 4}" stroke="${C.steel}" stroke-width="0.8"/>`);
    }

    const pedW = 0.35;
    parts.push(`<rect x="${tx(cx - pedW / 2)}" y="${ty(0)}" width="${pedW * SC}" height="${fTop - ty(0)}" fill="#DDD" stroke="${C.wall}" stroke-width="0.8"/>`);

    for (let fi = 0; fi < numFloors; fi++) {
      const cBot = ty(fi * wallH + (fi === 0 ? plinthH : 0));
      const cTop = ty((fi + 1) * wallH);
      const cPxW = colW * SC;
      parts.push(`<rect x="${tx(cx - colW / 2)}" y="${cTop}" width="${cPxW}" height="${cBot - cTop}" fill="#DDD" stroke="${C.wall}" stroke-width="0.8"/>`);
      [-colW / 3, -colW / 6, colW / 6, colW / 3].forEach(bp => {
        parts.push(`<line x1="${tx(cx + bp)}" y1="${cTop + 2}" x2="${tx(cx + bp)}" y2="${cBot - 2}" stroke="${C.steel}" stroke-width="0.8"/>`);
      });
      for (let stY = cTop + 8; stY < cBot - 4; stY += 12) {
        parts.push(`<rect x="${tx(cx - colW / 2) + 2}" y="${stY}" width="${cPxW - 4}" height="6" fill="none" stroke="${C.steel}" stroke-width="0.4" stroke-dasharray="2,1"/>`);
      }
    }

    parts.push(`<text x="${tx(cx)}" y="${fBot - 5}" text-anchor="middle" font-size="5.5" font-family="'Courier New',monospace" fill="${C.dim}" font-weight="600">F${ci + 1}</text>`);
  }

  // Plinth beam
  parts.push(`<rect x="${tx(sX)}" y="${ty(plinthH)}" width="${bW * SC}" height="${plinthH * SC}" fill="#E8E0D0" stroke="${C.wall}" stroke-width="1"/>`);
  parts.push(concreteHatch('plinth', tx(sX), ty(plinthH), bW * SC, plinthH * SC));
  parts.push(levelMark(tx(sX) - 35, ty(plinthH), 'Plinth', `+${plinthH.toFixed(3)}`));

  for (let fi = 0; fi <= numFloors; fi++) {
    const slY = fi * wallH;
    const slTop = ty(slY + slabT);
    const slBot = ty(slY);
    parts.push(`<rect x="${tx(sX)}" y="${slTop}" width="${bW * SC}" height="${slBot - slTop}" fill="#D0C8C0" stroke="${C.wall}" stroke-width="1.2"/>`);
    parts.push(concreteHatch(`slab${fi}`, tx(sX), slTop, bW * SC, slBot - slTop));
    parts.push(`<line x1="${tx(sX) + 3}" y1="${slBot - 2}" x2="${tx(sX + bW) - 3}" y2="${slBot - 2}" stroke="${C.steel}" stroke-width="0.6"/>`);
    if (fi > 0) {
      parts.push(levelMark(tx(sX) - 35, ty(slY), fi === numFloors ? 'Terrace' : `Floor ${fi}`, `+${slY.toFixed(3)}`));
      const beamD = 0.4;
      for (let ci = 0; ci < nCols - 1; ci++) {
        const bLeft = sX + ci * colSpacing + colW / 2;
        const bRight = sX + (ci + 1) * colSpacing - colW / 2;
        parts.push(`<rect x="${tx(bLeft)}" y="${ty(slY)}" width="${(bRight - bLeft) * SC}" height="${beamD * SC}" fill="none" stroke="${C.wall}" stroke-width="0.6" stroke-dasharray="6,2"/>`);
      }
    }
  }

  // Parapet
  const topSlab = numFloors * wallH + slabT;
  parts.push(`<rect x="${tx(sX)}" y="${ty(topSlab + 1.0)}" width="${0.1 * SC}" height="${1.0 * SC}" fill="#E8E0D0" stroke="${C.wall}" stroke-width="0.8"/>`);
  parts.push(`<rect x="${tx(sX + bW - 0.1)}" y="${ty(topSlab + 1.0)}" width="${0.1 * SC}" height="${1.0 * SC}" fill="#E8E0D0" stroke="${C.wall}" stroke-width="0.8"/>`);
  parts.push(levelMark(tx(sX) - 35, ty(topSlab + 1.0), 'Parapet', `+${(topSlab + 1.0).toFixed(3)}`));

  // Dimensions
  for (let fi = 0; fi < numFloors; fi++) {
    parts.push(dimChain(tx(sX + bW) + 20, ty((fi + 1) * wallH), tx(sX + bW) + 20, ty(fi * wallH), '3000', 30, false));
  }
  for (let ci = 0; ci < nCols - 1; ci++) {
    parts.push(dimChain(tx(sX + ci * colSpacing), ty(-footD) + 10, tx(sX + (ci + 1) * colSpacing), ty(-footD) + 10, `${(colSpacing * 1000).toFixed(0)}`, 20, true));
  }

  parts.push(legend(svgW, svgH, '▨ RCC M20 │ ─── Steel Fe500 │ ┈┈ Masonry Infill │ █ PCC │ All dims in mm'));
  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${parts.join('')}</svg>`;
}

/* ══════════════════════════════════════════ */
/* ── FRONT ELEVATION (inline — kept from original) ── */
/* ══════════════════════════════════════════ */
function renderElevation(layout: Layout, numFloors: number, facing: string): string {
  const bW = layout.buildableWidthM;
  const sX = layout.setbacks.left;
  const wallH = 3.0;
  const slabT = 0.15;
  const plinthH = 0.6;
  const parH = 1.0;

  const svgW = (layout.plotWidthM + 5) * SC;
  const totalH = numFloors * wallH + plinthH + slabT + parH + 2;
  const svgH = (totalH + 2) * SC;
  const baseY = svgH - MARGIN;

  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => baseY - m * SC;

  const parts: string[] = [];

  parts.push(drawingBorder(svgW, svgH, 'FRONT ELEVATION',
    `${facing.toUpperCase()} FACING • Scale 1:${Math.round(1000 / SC)} • ${numFloors} Storey(s)`));

  // Ground line
  parts.push(`<line x1="20" y1="${ty(0)}" x2="${svgW - 20}" y2="${ty(0)}" stroke="${C.earth}" stroke-width="2.5"/>`);
  for (let hx = 20; hx < svgW - 20; hx += 6) {
    parts.push(`<line x1="${hx}" y1="${ty(0) + 2}" x2="${hx + 4}" y2="${ty(0) + 8}" stroke="${C.earth}" stroke-width="0.3" opacity="0.4"/>`);
  }

  // Plinth
  parts.push(`<rect x="${tx(sX)}" y="${ty(plinthH)}" width="${bW * SC}" height="${plinthH * SC}" fill="${C.plinth}" stroke="${C.wall}" stroke-width="1.2"/>`);
  parts.push(`<rect x="${tx(sX)}" y="${ty(plinthH)}" width="${bW * SC}" height="${0.08 * SC}" fill="${C.band}" stroke="${C.wall}" stroke-width="0.5"/>`);
  parts.push(`<line x1="${tx(sX)}" y1="${ty(plinthH - 0.02)}" x2="${tx(sX + bW)}" y2="${ty(plinthH - 0.02)}" stroke="#000" stroke-width="0.8" stroke-dasharray="4,2"/>`);

  // Floors
  for (let fi = 0; fi < numFloors; fi++) {
    const floorBase = plinthH + fi * wallH;
    const floorTop = floorBase + wallH;

    parts.push(`<rect x="${tx(sX)}" y="${ty(floorTop)}" width="${bW * SC}" height="${wallH * SC}" fill="${C.plaster}" stroke="${C.wall}" stroke-width="1"/>`);

    if (fi > 0) {
      parts.push(`<rect x="${tx(sX - 0.05)}" y="${ty(floorBase + slabT)}" width="${(bW + 0.1) * SC}" height="${slabT * SC}" fill="${C.band}" stroke="${C.wall}" stroke-width="0.6"/>`);
    }

    const nWin = Math.max(2, Math.floor(bW / 2.2));
    const winSpacing = bW / (nWin + 1);
    const winW = 1.2;
    const winH = 1.2;
    const sillH = floorBase + 0.9;

    for (let wi = 1; wi <= nWin; wi++) {
      if (fi === 0 && wi === Math.ceil(nWin / 2)) continue;
      const wx = sX + wi * winSpacing - winW / 2;

      parts.push(`<rect x="${tx(wx)}" y="${ty(sillH + winH)}" width="${winW * SC}" height="${winH * SC}" fill="${C.glass}" stroke="${C.wall}" stroke-width="0.8"/>`);
      parts.push(`<line x1="${tx(wx + winW / 2)}" y1="${ty(sillH + winH)}" x2="${tx(wx + winW / 2)}" y2="${ty(sillH)}" stroke="${C.wall}" stroke-width="0.6"/>`);
      parts.push(`<line x1="${tx(wx)}" y1="${ty(sillH + winH / 2)}" x2="${tx(wx + winW)}" y2="${ty(sillH + winH / 2)}" stroke="${C.wall}" stroke-width="0.4"/>`);
      parts.push(`<rect x="${tx(wx - 0.06)}" y="${ty(sillH)}" width="${(winW + 0.12) * SC}" height="3" fill="${C.band}" stroke="${C.wall}" stroke-width="0.5"/>`);
      parts.push(`<rect x="${tx(wx - 0.06)}" y="${ty(sillH + winH + 0.15)}" width="${(winW + 0.12) * SC}" height="${0.15 * SC}" fill="${C.band}" stroke="${C.wall}" stroke-width="0.5"/>`);
      parts.push(`<rect x="${tx(wx - 0.1)}" y="${ty(sillH + winH + 0.21)}" width="${(winW + 0.2) * SC}" height="${0.06 * SC}" fill="${C.slab}" stroke="${C.wall}" stroke-width="0.6"/>`);
    }

    // Main door (ground floor)
    if (fi === 0) {
      const doorW = 1.2;
      const doorH = 2.1;
      const doorX = sX + bW / 2 - doorW / 2;
      parts.push(`<rect x="${tx(doorX)}" y="${ty(plinthH + doorH)}" width="${doorW * SC}" height="${doorH * SC}" fill="${C.wood}" stroke="${C.wall}" stroke-width="1.2"/>`);
      const panelInset = 3;
      const panelW = doorW * SC / 2 - panelInset * 1.5;
      parts.push(`<rect x="${tx(doorX) + panelInset}" y="${ty(plinthH + doorH) + panelInset}" width="${panelW}" height="${doorH * SC - panelInset * 2}" fill="#9B8365" stroke="#6B5340" stroke-width="0.5" rx="1"/>`);
      parts.push(`<rect x="${tx(doorX) + doorW * SC / 2 + panelInset / 2}" y="${ty(plinthH + doorH) + panelInset}" width="${panelW}" height="${doorH * SC - panelInset * 2}" fill="#9B8365" stroke="#6B5340" stroke-width="0.5" rx="1"/>`);
      parts.push(`<rect x="${tx(doorX - 0.08)}" y="${ty(plinthH + doorH + 0.15)}" width="${(doorW + 0.16) * SC}" height="${0.15 * SC}" fill="${C.band}" stroke="${C.wall}" stroke-width="0.6"/>`);
      for (let si = 0; si < 3; si++) {
        const stepW = doorW + 0.3 + si * 0.15;
        const stepX = sX + bW / 2 - stepW / 2;
        const stepY = plinthH * (1 - (si + 1) / 3.5);
        parts.push(`<rect x="${tx(stepX)}" y="${ty(stepY)}" width="${stepW * SC}" height="${(plinthH / 3.5) * SC}" fill="#D8D0C4" stroke="${C.wall}" stroke-width="0.4"/>`);
      }
    }

    // Balcony (upper floors)
    if (fi > 0) {
      const balW = bW * 0.4;
      const balX = sX + (bW - balW) / 2;
      const railH = 1.0;
      parts.push(`<rect x="${tx(balX) - 2}" y="${ty(floorBase + slabT)}" width="${balW * SC + 4}" height="${slabT * SC + 2}" fill="${C.slab}" stroke="${C.wall}" stroke-width="0.6"/>`);
      parts.push(`<line x1="${tx(balX) - 2}" y1="${ty(floorBase + railH)}" x2="${tx(balX) + balW * SC + 2}" y2="${ty(floorBase + railH)}" stroke="${C.wall}" stroke-width="1"/>`);
      const railCount = Math.floor(balW / 0.15);
      for (let ri = 0; ri <= railCount; ri++) {
        const rx = tx(balX) + (ri / railCount) * balW * SC;
        parts.push(`<line x1="${rx}" y1="${ty(floorBase + slabT)}" x2="${rx}" y2="${ty(floorBase + railH)}" stroke="${C.wall}" stroke-width="0.3"/>`);
      }
    }

    parts.push(levelMark(tx(sX) - 40, ty(floorBase), fi === 0 ? 'GFL' : `F${fi}L`, `+${floorBase.toFixed(3)}`));
  }

  // Parapet
  const topBase = plinthH + numFloors * wallH;
  parts.push(`<rect x="${tx(sX)}" y="${ty(topBase + slabT + parH)}" width="${bW * SC}" height="${parH * SC}" fill="${C.plaster}" stroke="${C.wall}" stroke-width="0.8"/>`);
  parts.push(`<rect x="${tx(sX - 0.05)}" y="${ty(topBase + slabT + parH + 0.06)}" width="${(bW + 0.1) * SC}" height="${0.06 * SC}" fill="${C.slab}" stroke="${C.wall}" stroke-width="0.5"/>`);

  parts.push(dimChain(tx(sX), ty(-0.3), tx(sX + bW), ty(-0.3), `${(bW * 1000).toFixed(0)}`, 20, true));
  parts.push(dimChain(tx(sX + bW) + 20, ty(topBase + slabT + parH), tx(sX + bW) + 20, ty(0), `${((topBase + slabT + parH) * 1000).toFixed(0)}`, 30, false));

  parts.push(legend(svgW, svgH, '█ Plastered Wall │ ▬ RCC Band │ ▤ Glass │ ▧ Timber Door │ All dims in mm'));
  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${parts.join('')}</svg>`;
}

/* ══════════════════════════════════════════ */
/* ── FOUNDATION PLAN (inline — kept from original) ── */
/* ══════════════════════════════════════════ */
function renderFoundation(layout: Layout): string {
  const pW = layout.plotWidthM;
  const pD = layout.plotDepthM;
  const bW = layout.buildableWidthM;
  const bD = layout.buildableDepthM;
  const sX = layout.setbacks.left;
  const sY = layout.setbacks.front;

  const svgW = (pW + 5) * SC;
  const svgH = (pD + 5) * SC;
  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => MARGIN + m * SC;

  const parts: string[] = [];

  parts.push(drawingBorder(svgW, svgH, 'FOUNDATION PLAN',
    `Isolated Footings • M20 Concrete • Fe500 Steel • SBC: 150 kN/m² • Scale 1:${Math.round(1000 / SC)}`));

  parts.push(`<rect x="${tx(0)}" y="${ty(0)}" width="${pW * SC}" height="${pD * SC}" fill="none" stroke="${C.wall}" stroke-width="0.6" stroke-dasharray="12,4,2,4"/>`);
  parts.push(`<rect x="${tx(sX)}" y="${ty(sY)}" width="${bW * SC}" height="${bD * SC}" fill="#FAFAF5" stroke="${C.grid}" stroke-width="0.4" stroke-dasharray="6,3"/>`);

  const columns = layout.floors[0]?.columns || [];
  const footW = 1.2;
  const footD = 1.2;

  // Plinth beams
  const sortedCols = [...columns].sort((a, b) => a.x - b.x || a.y - b.y);
  for (let i = 0; i < sortedCols.length; i++) {
    for (let j = i + 1; j < sortedCols.length; j++) {
      const dx = Math.abs(sortedCols[i].x - sortedCols[j].x);
      const dy = Math.abs(sortedCols[i].y - sortedCols[j].y);
      const aligned = dx < 0.01 || dy < 0.01;
      const dist = Math.hypot(dx, dy);
      if (aligned && dist < 5.5) {
        const bw = 0.115;
        if (dx < 0.01) {
          parts.push(`<rect x="${tx(sortedCols[i].x - bw)}" y="${ty(Math.min(sortedCols[i].y, sortedCols[j].y))}" width="${bw * 2 * SC}" height="${dy * SC}" fill="none" stroke="${C.grid}" stroke-width="0.5" stroke-dasharray="8,3"/>`);
        } else {
          parts.push(`<rect x="${tx(Math.min(sortedCols[i].x, sortedCols[j].x))}" y="${ty(sortedCols[i].y) - bw * SC}" width="${dx * SC}" height="${bw * 2 * SC}" fill="none" stroke="${C.grid}" stroke-width="0.5" stroke-dasharray="8,3"/>`);
        }
      }
    }
  }

  // Footings
  columns.forEach((col, ci) => {
    const fx = tx(col.x - footW / 2);
    const fy = ty(col.y - footD / 2);
    const fw = footW * SC;
    const fh = footD * SC;
    parts.push(`<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="#F0EDE8" stroke="${C.wall}" stroke-width="1" stroke-dasharray="5,2"/>`);
    parts.push(concreteHatch(`fdn${ci}`, fx, fy, fw, fh));
    const cw = col.widthMM / 1000;
    const cd = col.depthMM / 1000;
    parts.push(`<rect x="${tx(col.x - cw / 2)}" y="${ty(col.y - cd / 2)}" width="${cw * SC}" height="${cd * SC}" fill="${C.concrete}" stroke="${C.wall}" stroke-width="1.2"/>`);
    parts.push(`<line x1="${tx(col.x - cw / 2)}" y1="${ty(col.y - cd / 2)}" x2="${tx(col.x + cw / 2)}" y2="${ty(col.y + cd / 2)}" stroke="${C.wall}" stroke-width="0.3"/>`);
    parts.push(`<line x1="${tx(col.x + cw / 2)}" y1="${ty(col.y - cd / 2)}" x2="${tx(col.x - cw / 2)}" y2="${ty(col.y + cd / 2)}" stroke="${C.wall}" stroke-width="0.3"/>`);
    parts.push(`<text x="${tx(col.x)}" y="${fy - 6}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.dim}" font-weight="700">F${ci + 1}</text>`);
  });

  // Grid labels
  const xs = Array.from(new Set(columns.map(c => c.x))).sort((a: number, b: number) => a - b);
  const ys = Array.from(new Set(columns.map(c => c.y))).sort((a: number, b: number) => a - b);
  parts.push(gridLabels(xs, ys, pW, pD));
  parts.push(northArrow(svgW - 40, 65));
  parts.push(legend(svgW, svgH, '┈┈ Plinth Beam 230×300 │ ▨ Isolated Footing │ ■ Column 230×300 │ ─·─ Plot Boundary │ All dims in mm'));

  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${parts.join('')}</svg>`;
}

/* ══════════════════════════════════════════ */
/* ── STRUCTURAL LAYOUT (inline — kept from original) ── */
/* ══════════════════════════════════════════ */
function renderStructural(layout: Layout): string {
  const pW = layout.plotWidthM;
  const pD = layout.plotDepthM;
  const bW = layout.buildableWidthM;
  const bD = layout.buildableDepthM;
  const sX = layout.setbacks.left;
  const sY = layout.setbacks.front;

  const svgW = (pW + 6) * SC;
  const svgH = (pD + 6) * SC;
  const tx = (m: number) => MARGIN + m * SC;
  const ty = (m: number) => MARGIN + m * SC;

  const parts: string[] = [];

  parts.push(drawingBorder(svgW, svgH, 'STRUCTURAL LAYOUT – COLUMN &amp; BEAM GRID',
    `Columns 230×300mm • Beams 230×400mm • Max Span ≤ 4500mm • M20 Grade • Scale 1:${Math.round(1000 / SC)}`));

  parts.push(`<rect x="${tx(0)}" y="${ty(0)}" width="${pW * SC}" height="${pD * SC}" fill="none" stroke="#999" stroke-width="0.5" stroke-dasharray="12,4,2,4"/>`);
  parts.push(`<rect x="${tx(sX)}" y="${ty(sY)}" width="${bW * SC}" height="${bD * SC}" fill="#FAFAF8" stroke="${C.wall}" stroke-width="0.8"/>`);

  const columns = layout.floors[0]?.columns || [];
  const xs = Array.from(new Set(columns.map(c => c.x))).sort((a: number, b: number) => a - b);
  const ys = Array.from(new Set(columns.map(c => c.y))).sort((a: number, b: number) => a - b);
  parts.push(gridLabels(xs, ys, pW, pD));

  // Beams
  const sortedCols = [...columns].sort((a, b) => a.x - b.x || a.y - b.y);
  for (let i = 0; i < sortedCols.length; i++) {
    for (let j = i + 1; j < sortedCols.length; j++) {
      const dx = Math.abs(sortedCols[i].x - sortedCols[j].x);
      const dy = Math.abs(sortedCols[i].y - sortedCols[j].y);
      const aligned = (dx < 0.01 || dy < 0.01);
      const dist = Math.hypot(dx, dy);
      if (aligned && dist < 5.5) {
        const bw = 0.115;
        if (dx < 0.01) {
          parts.push(`<rect x="${tx(sortedCols[i].x - bw)}" y="${ty(Math.min(sortedCols[i].y, sortedCols[j].y))}" width="${bw * 2 * SC}" height="${dy * SC}" fill="#E8E4E0" stroke="${C.wall}" stroke-width="0.6"/>`);
        } else {
          parts.push(`<rect x="${tx(Math.min(sortedCols[i].x, sortedCols[j].x))}" y="${ty(sortedCols[i].y) - bw * SC}" width="${dx * SC}" height="${bw * 2 * SC}" fill="#E8E4E0" stroke="${C.wall}" stroke-width="0.6"/>`);
        }
        const mx = (sortedCols[i].x + sortedCols[j].x) / 2;
        const my = (sortedCols[i].y + sortedCols[j].y) / 2;
        const spanLabel = `${(dist * 1000).toFixed(0)}`;
        if (dx < 0.01) {
          parts.push(`<text x="${tx(mx) + 12}" y="${ty(my) + 3}" font-size="5.5" font-family="'Courier New',monospace" fill="${C.dim}" font-weight="600">${spanLabel}</text>`);
        } else {
          parts.push(`<text x="${tx(mx)}" y="${ty(my) - 8}" text-anchor="middle" font-size="5.5" font-family="'Courier New',monospace" fill="${C.dim}" font-weight="600">${spanLabel}</text>`);
        }
      }
    }
  }

  // Columns
  columns.forEach((col, ci) => {
    const cw = col.widthMM / 1000;
    const cd = col.depthMM / 1000;
    const cx = tx(col.x - cw / 2);
    const cy = ty(col.y - cd / 2);
    const cpW = cw * SC;
    const cpH = cd * SC;
    parts.push(`<rect x="${cx}" y="${cy}" width="${cpW}" height="${cpH}" fill="#333" stroke="${C.wall}" stroke-width="1.2"/>`);
    parts.push(`<line x1="${cx + 1}" y1="${cy + 1}" x2="${cx + cpW - 1}" y2="${cy + cpH - 1}" stroke="#888" stroke-width="0.4"/>`);
    parts.push(`<line x1="${cx + cpW - 1}" y1="${cy + 1}" x2="${cx + 1}" y2="${cy + cpH - 1}" stroke="#888" stroke-width="0.4"/>`);
    parts.push(`<text x="${tx(col.x)}" y="${cy - 5}" text-anchor="middle" font-size="5.5" font-family="'Courier New',monospace" fill="${C.dim}" font-weight="700">C${ci + 1}</text>`);
  });

  // Schedule table
  const tblX = svgW - 160;
  const tblY = svgH - 100;
  parts.push(`<rect x="${tblX}" y="${tblY}" width="145" height="80" fill="#FFF" stroke="${C.wall}" stroke-width="0.6"/>`);
  parts.push(`<text x="${tblX + 72}" y="${tblY + 12}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">COLUMN SCHEDULE</text>`);
  parts.push(`<line x1="${tblX}" y1="${tblY + 16}" x2="${tblX + 145}" y2="${tblY + 16}" stroke="${C.wall}" stroke-width="0.4"/>`);
  parts.push(`<text x="${tblX + 5}" y="${tblY + 28}" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">C1-C${columns.length} │ 230×300 │ 4-12φ+4-10φ │ 8φ@150c/c</text>`);
  parts.push(`<text x="${tblX + 72}" y="${tblY + 55}" text-anchor="middle" font-size="6" font-family="'Courier New',monospace" fill="${C.text}" font-weight="700">BEAM SCHEDULE</text>`);
  parts.push(`<text x="${tblX + 5}" y="${tblY + 68}" font-size="5" font-family="'Courier New',monospace" fill="${C.dim}">All Beams: 230×400 • 2-16φ top + 2-16φ bot • 8φ@150c/c</text>`);

  parts.push(legend(svgW, svgH, '■ Column 230×300 │ □ Beam 230×400 │ ── Grid CL │ All dims in mm │ Concrete M20 • Steel Fe500'));
  return `<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" width="100%" preserveAspectRatio="xMidYMin meet" style="background:${C.bg}">${parts.join('')}</svg>`;
}


/* ══════════════════════════════════════════ */
/* ── MAIN COMPONENT ── */
/* ══════════════════════════════════════════ */
export const WorkingDrawings: React.FC<Props> = ({ layout, requirements, boq }) => {
  const [activeDrawing, setActiveDrawing] = useState<DrawingType>('excavation');
  const [zoom, setZoom] = useState(100);
  const [aiImages, setAiImages] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'svg' | 'ai'>('svg');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportResult, setExportResult] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPDF = async () => {
    setExporting(true);
    setExportResult(null);
    setExportError(null);
    try {
      const path = await exportToPDF(layout, requirements, boq || null, 'working-drawings', setExportProgress);
      setExportResult(path);
    } catch (e: any) {
      setExportError(e.message || 'Export failed');
      console.error('PDF export error:', e);
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };
  const aiDrawingMap: Partial<Record<DrawingType, string>> = {
    excavation: 'excavation',
    foundation: 'column_layout',
    footingDetail: 'footing_detail',
    rccDetail: 'beam_slab',
    structural: 'column_layout',
    reinforcement: 'column_detail',
    barBending: 'bar_bending',
    section: 'section_aa',
    elevation: 'front_elevation',
    brickwork: 'ground_floor',
    electrical: 'electrical',
    plumbing: 'plumbing',
    staircase: 'ground_floor',
    waterTank: 'plumbing',
    waterproofing: 'footing_detail',
    stp: 'plumbing',
    tiling: 'ground_floor',
  };

  const generateAI = async () => {
    const aiType = aiDrawingMap[activeDrawing];
    if (!aiType || aiLoading) return;
    
    // If already cached, just switch view
    if (aiImages[activeDrawing]) {
      setViewMode('ai');
      return;
    }
    
    setAiLoading(activeDrawing);
    try {
      const res = await fetch('/api/generate-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drawingType: aiType,
          layout,
          requirements,
        }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      if (data.image) {
        setAiImages(prev => ({ ...prev, [activeDrawing]: data.image }));
        setViewMode('ai');
      }
    } catch (e) {
      console.error('AI generation error:', e);
    } finally {
      setAiLoading(null);
    }
  };

  const numFloors = requirements.floors.length;

  const tabs: { id: DrawingType; label: string; icon: React.ReactNode; group: string }[] = [
    { id: 'excavation', label: 'Excavation', icon: <Shovel size={12} />, group: 'Site' },
    { id: 'foundation', label: 'Foundation Plan', icon: <Grid3x3 size={12} />, group: 'Structure' },
    { id: 'footingDetail', label: 'Footing Detail', icon: <Layers size={12} />, group: 'Structure' },
    { id: 'rccDetail', label: 'RCC Slab/Beam', icon: <Layers size={12} />, group: 'Structure' },
    { id: 'structural', label: 'Column Grid', icon: <Columns3 size={12} />, group: 'Structure' },
    { id: 'reinforcement', label: 'Rebar Details', icon: <Ruler size={12} />, group: 'Structure' },
    { id: 'barBending', label: 'BBS', icon: <BarChart3 size={12} />, group: 'Structure' },
    { id: 'section', label: 'Section A-A', icon: <ArrowUpDown size={12} />, group: 'Views' },
    { id: 'elevation', label: 'Elevation', icon: <Building size={12} />, group: 'Views' },
    { id: 'brickwork', label: 'Brickwork', icon: <BrickWall size={12} />, group: 'Finishes' },
    { id: 'electrical', label: 'Electrical', icon: <Zap size={12} />, group: 'MEP' },
    { id: 'plumbing', label: 'Plumbing', icon: <Droplets size={12} />, group: 'MEP' },
    { id: 'tiling', label: 'Tiling', icon: <Grid2x2 size={12} />, group: 'Finishes' },
    { id: 'staircase', label: 'Staircase', icon: <Footprints size={12} />, group: 'Structure' },
    { id: 'waterTank', label: 'Water Tank', icon: <Container size={12} />, group: 'MEP' },
    { id: 'waterproofing', label: 'Waterproofing', icon: <ShieldCheck size={12} />, group: 'Finishes' },
    { id: 'stp', label: 'STP', icon: <Pipette size={12} />, group: 'MEP' },
  ];

  const groups = ['Site', 'Structure', 'Views', 'Finishes', 'MEP'];

  let svgHtml = '';
  switch (activeDrawing) {
    case 'excavation': svgHtml = renderExcavation(layout, requirements); break;
    case 'foundation': svgHtml = renderFoundation(layout); break;
    case 'footingDetail': svgHtml = renderFootingDetail(layout, requirements); break;
    case 'rccDetail': svgHtml = renderRCCDetail(layout, requirements); break;
    case 'structural': svgHtml = renderStructural(layout); break;
    case 'reinforcement': svgHtml = renderReinforcement(layout, requirements); break;
    case 'barBending': svgHtml = renderBarBending(layout, requirements); break;
    case 'section': svgHtml = renderSection(layout, numFloors); break;
    case 'elevation': svgHtml = renderElevation(layout, numFloors, requirements.facing); break;
    case 'brickwork': svgHtml = renderBrickwork(layout, requirements); break;
    case 'electrical': svgHtml = renderElectrical(layout, requirements); break;
    case 'plumbing': svgHtml = renderPlumbing(layout, requirements); break;
    case 'tiling': svgHtml = renderTiling(layout, requirements); break;
    case 'staircase': svgHtml = renderStaircase(layout, requirements); break;
    case 'waterTank': svgHtml = renderWaterTank(layout, requirements); break;
    case 'waterproofing': svgHtml = renderWaterproofing(layout, requirements); break;
    case 'stp': svgHtml = renderSTP(layout, requirements); break;
  }

  const descriptions: Record<DrawingType, string> = {
    excavation: 'Trench excavation layout with depths, bench mark, center line pegs, and earth removal volume. Trench width: 1800mm (1200mm footing + 300mm working space each side).',
    foundation: 'Foundation layout with isolated footings (1200×1200×300mm), column pedestals, plinth beam grid (230×300). SBC assumed 150 kN/m².',
    footingDetail: 'Detailed footing cross-section and plan with reinforcement, PCC bed, pedestal starter bars, and soil bearing details per IS 456. Includes raft foundation option for weak soil.',
    rccDetail: 'RCC slab & beam layout showing slab panels (one-way/two-way), beam grid, reinforcement directions, staircase opening, and cantilever balcony slabs.',
    structural: 'Column-beam grid with centerline references. Column: 230×300mm. Beam: 230×400mm. Max clear span ≤ 4500mm.',
    reinforcement: 'Detailed reinforcement sections for footing, column, beam, slab, and lintel with bar sizes, spacing, cover, and stirrup details.',
    barBending: 'Bar Bending Schedule per IS 2502. All members quantified with bar mark, diameter, shape code, cutting length, and total weight.',
    section: `Cross-section showing foundation system, RCC frame, infill masonry, and lintels. Floor-to-floor: 3000mm. Slab: 150mm.`,
    elevation: `Front elevation (${requirements.facing} facing). Plinth, DPC, windows, main door, balcony, slab bands, parapet with coping.`,
    brickwork: 'Masonry layout: 230mm external walls (stretcher bond), 115mm partitions, door/window openings, lintel positions, waterproof plaster in wet areas.',
    electrical: 'Electrical layout: room-wise light/fan/socket/AC points, DB & MSB positions, circuit runs (power/lighting/earth), load schedule.',
    plumbing: 'Plumbing layout: cold/hot water supply lines, drainage with slope, fixtures (WC/basin/shower/sink), OHT, sump, manholes, RWP.',
    tiling: 'Floor finish layout: room-wise tile type/size, wall tiles in wet areas, skirting, threshold details, material schedule.',
    staircase: 'Dog-leg staircase detail: section and plan views with tread/riser dimensions, waist slab, handrail, landing, reinforcement per IS 456 / NBC 2016.',
    waterTank: 'Underground sump and overhead tank details: section views with reinforcement, inlet/outlet pipes, waterproof coating, capacity calculations per IS 3370.',
    waterproofing: 'Waterproofing details for roof terrace (APP membrane + brick bat coba) and bathroom (sunken floor + membrane) per IS 3067 / NBC Part 7.',
    stp: 'Sewage Treatment Plant layout: bar screen, settling tank, anaerobic baffled reactor, filter media, chlorination chamber with flow direction per CPCB / NBC Part 9.',
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Tab bar - grouped */}
      <div className="p-2 bg-gray-100 border-b border-gray-200 overflow-x-auto">
        <div className="flex items-center gap-1 flex-wrap">
          {groups.map(g => {
            const groupTabs = tabs.filter(t => t.group === g);
            return (
              <React.Fragment key={g}>
                <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mr-1 ml-2">{g}</span>
                {groupTabs.map(t => (
                  <button key={t.id} className={`btn btn-xs gap-1 ${activeDrawing === t.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveDrawing(t.id)}>
                    {t.icon} {t.label}
                  </button>
                ))}
                <span className="border-r border-gray-200 h-4 mx-1" />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 border-b border-gray-200">
        <span className="text-[10px] font-mono text-gray-500">ZOOM</span>
        <button className="btn btn-xs btn-ghost font-mono" onClick={() => setZoom(z => Math.max(50, z - 25))}>−</button>
        <span className="text-xs font-mono w-10 text-center">{zoom}%</span>
        <button className="btn btn-xs btn-ghost font-mono" onClick={() => setZoom(z => Math.min(200, z + 25))}>+</button>
        <button className="btn btn-xs btn-ghost font-mono" onClick={() => setZoom(100)}>Fit</button>

        {/* View mode toggle */}
        <div className="join ml-2">
          <button className={`join-item btn btn-xs ${viewMode === 'svg' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setViewMode('svg')}>
            <Ruler size={10} /> SVG
          </button>
          <button 
            className={`join-item btn btn-xs ${viewMode === 'ai' ? 'btn-primary' : 'btn-ghost'} ${!aiImages[activeDrawing] && !aiLoading ? 'btn-ghost' : ''}`} 
            onClick={() => aiImages[activeDrawing] ? setViewMode('ai') : generateAI()}
          >
            <ImageIcon size={10} /> AI
          </button>
        </div>

        {/* Generate AI button */}
        {aiDrawingMap[activeDrawing] && !aiImages[activeDrawing] && (
          <button 
            className={`btn btn-xs btn-accent gap-1 ml-1 ${aiLoading ? 'btn-disabled' : ''}`}
            onClick={generateAI}
            disabled={!!aiLoading}
          >
            {aiLoading === activeDrawing ? (
              <><span className="loading loading-spinner loading-xs" /> Generating...</>
            ) : (
              <><Sparkles size={10} /> Generate AI</>
            )}
          </button>
        )}

        <div className="flex-1" />
        {exporting ? (
          <span className="text-[10px] font-mono text-blue-600 flex items-center gap-1">
            <span className="loading loading-spinner loading-xs" />
            {exportProgress ? `${exportProgress.step} (${exportProgress.current}/${exportProgress.total})` : 'Preparing...'}
          </span>
        ) : exportResult ? (
          <span className="text-[10px] font-mono text-green-600">✓ PDF downloaded</span>
        ) : exportError ? (
          <span className="text-[10px] font-mono text-red-600">{exportError}</span>
        ) : (
          <span className="text-[10px] font-mono text-gray-400">Scroll to pan • Use zoom to see details</span>
        )}
        <button
          className={`btn btn-xs gap-1 ${exporting ? 'btn-disabled' : 'btn-primary'}`}
          onClick={handleExportPDF}
          disabled={exporting}
        >
          <Download size={12} /> {exporting ? 'Exporting...' : 'Download PDF'}
        </button>
      </div>

      {/* Canvas — scrollable container */}
      <div className="flex-1 overflow-auto min-h-0 bg-neutral-100 p-4">
        {viewMode === 'ai' && aiImages[activeDrawing] ? (
          <div className="flex justify-center">
            <img 
              src={aiImages[activeDrawing]} 
              alt={tabs.find(t => t.id === activeDrawing)?.label || activeDrawing}
              className="max-w-full rounded shadow-lg"
              style={{ maxHeight: '80vh' }}
            />
          </div>
        ) : (
          <div
            data-drawing={activeDrawing}
            className="svg-container"
            style={{
              width: zoom === 100 ? '100%' : `${zoom}%`,
              minWidth: zoom < 100 ? `${zoom}%` : '100%',
              margin: zoom <= 100 ? '0 auto' : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: svgHtml }}
          />
        )}
      </div>

      {/* Description */}
      <div className="p-2 bg-gray-100 border-t border-gray-200">
        <div className="text-[10px] text-gray-500 font-mono leading-relaxed">
          {descriptions[activeDrawing]}
        </div>
      </div>
    </div>
  );
};
