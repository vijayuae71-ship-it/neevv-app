/**
 * PDF Export Utility
 * Collects SVG drawings from the app and triggers server-side PDF generation.
 * Uses chunked writing to handle large SVG files within command length limits.
 */
import { Layout, ProjectRequirements, BOQ } from '../types';
import { renderExcavation } from './drawings/excavation';
import { renderReinforcement } from './drawings/reinforcement';
import { renderBarBending } from './drawings/barBending';
import { renderBrickwork } from './drawings/brickwork';
import { renderElectrical } from './drawings/electrical';
import { renderPlumbing } from './drawings/plumbing';
import { renderTiling } from './drawings/tiling';
import { renderRCCDetail } from './drawings/rccDetail';

export interface ExportProgress {
  step: string;
  current: number;
  total: number;
}

export type ExportMode = 'working-drawings' | 'floorplan' | 'full-package';

/**
 * Write a file to disk with chunking for large content.
 * writeFileToDisk has a command length limit (~120KB), so we split large files
 * into chunks, writing each via writeFileToDisk to a temp part, then cat them together.
 */
async function writeLargeFile(filePath: string, content: string): Promise<void> {
  if (!window.tasklet) {
    throw new Error('PDF export requires the Tasklet environment. Use the /api/export endpoint in production.');
  }
  const MAX_DIRECT = 80000; // 80KB - safe for writeFileToDisk
  if (content.length <= MAX_DIRECT) {
    await window.tasklet!.writeFileToDisk(filePath, content);
    return;
  }
  // Split into chunks and write each as a separate temp file
  const CHUNK_SIZE = 60000;
  const totalChunks = Math.ceil(content.length / CHUNK_SIZE);
  const partFiles: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunk = content.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const partPath = `${filePath}.part${i}`;
    partFiles.push(partPath);
    await window.tasklet!.writeFileToDisk(partPath, chunk);
  }
  // Concatenate all parts into the final file
  await window.tasklet!.runCommand(`cat ${partFiles.map(p => `'${p}'`).join(' ')} > '${filePath}' && rm -f ${partFiles.map(p => `'${p}'`).join(' ')}`);
}

/**
 * Capture any rendered SVG from the DOM by data-drawing attribute
 */
function captureSVGFromDOM(drawingId: string): string | null {
  const container = document.querySelector(`[data-drawing="${drawingId}"]`);
  if (!container) return null;
  const svg = container.querySelector('svg');
  if (svg) return svg.outerHTML;
  if (container.innerHTML && container.innerHTML.includes('<svg')) return container.innerHTML;
  return null;
}

export async function exportToPDF(
  layout: Layout,
  requirements: ProjectRequirements,
  boq: BOQ | null,
  mode: ExportMode,
  onProgress?: (p: ExportProgress) => void
): Promise<string> {
  if (!window.tasklet) {
    throw new Error('PDF export requires the Tasklet environment. Use the /api/export endpoint in production.');
  }

  const totalSteps = 16;
  let currentStep = 0;

  const report = (step: string) => {
    currentStep++;
    onProgress?.({ step, current: currentStep, total: totalSteps });
  };

  // Clean up temp directory
  report('Preparing export...');
  await window.tasklet!.runCommand('rm -rf /tmp/drawings && mkdir -p /tmp/drawings');

  const drawings: { key: string; svg: string }[] = [];

  if (mode === 'floorplan' || mode === 'full-package') {
    report('Capturing floor plan...');
    const fpSvg = captureSVGFromDOM('floorplan');
    if (fpSvg) drawings.push({ key: 'floorplan', svg: fpSvg });
  }

  if (mode === 'working-drawings' || mode === 'full-package') {
    const drawingGenerators: { key: string; label: string; fn: () => string }[] = [
      { key: 'excavation', label: 'excavation drawing', fn: () => renderExcavation(layout, requirements) },
      { key: 'rcc-slab', label: 'RCC slab drawing', fn: () => renderRCCDetail(layout, requirements) },
      { key: 'rebar-details', label: 'reinforcement details', fn: () => renderReinforcement(layout, requirements) },
      { key: 'bbs', label: 'bar bending schedule', fn: () => renderBarBending(layout, requirements) },
      { key: 'brickwork', label: 'brickwork layout', fn: () => renderBrickwork(layout, requirements) },
      { key: 'tiling', label: 'tiling layout', fn: () => renderTiling(layout, requirements) },
      { key: 'electrical', label: 'electrical layout', fn: () => renderElectrical(layout, requirements) },
      { key: 'plumbing', label: 'plumbing layout', fn: () => renderPlumbing(layout, requirements) },
    ];

    for (const { key, label, fn } of drawingGenerators) {
      report(`Generating ${label}...`);
      try {
        drawings.push({ key, svg: fn() });
      } catch (e) {
        console.warn(`${label} generation failed:`, e);
      }
    }

    // Capture inline drawings rendered in DOM
    report('Capturing section drawing...');
    const inlineKeys = ['section', 'elevation', 'foundation', 'column-grid'];
    for (const ik of inlineKeys) {
      const svg = captureSVGFromDOM(ik);
      if (svg) drawings.push({ key: ik, svg });
    }
  }

  // Copy logo file for Python to overlay on PDF pages
  await window.tasklet!.runCommand(`cp /agent/home/apps/architect-engineer/neevv-logo.png /tmp/drawings/neevv-logo.png 2>/dev/null || true`);

  // Strip embedded base64 logo images from SVGs to reduce size (logo added by Python in PDF)
  // This removes <image> tags with data:image/png;base64 hrefs
  const stripLogo = (svg: string): string => {
    return svg.replace(/<image[^>]*href="data:image\/png;base64,[^"]*"[^>]*\/>/g, '');
  };

  // Write all SVG files to temp directory in parallel
  report('Writing drawing files...');
  await Promise.all(drawings.map(({ key, svg }) => writeLargeFile(`/tmp/drawings/${key}.svg`, stripLogo(svg))));

  // Project info for the cover page
  const totalBeds = requirements.floors.reduce((sum: number, f: any) => sum + (f.bedrooms || 0), 0);
  const bhkLabel = `${totalBeds}BHK`;
  const projectInfo = {
    project: `${bhkLabel} Residential Building`,
    location: `${requirements.city}, ${requirements.state}`,
    plotSize: `${requirements.plotWidthFt}ft x ${requirements.plotDepthFt}ft (${requirements.facing} Facing)`,
    floors: requirements.floors.map((f: any, i: number) => `${i === 0 ? 'Ground' : `Floor ${i}`}: ${f.bedrooms} Bed`).join(', '),
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  };

  // Write project info to a file to avoid command length issues
  await window.tasklet!.writeFileToDisk('/tmp/drawings/project-info.json', JSON.stringify(projectInfo));

  // Write BOQ data for the BOQ summary page in the PDF
  if (boq) {
    await window.tasklet!.writeFileToDisk('/tmp/drawings/boq-data.json', JSON.stringify(boq));
  }

  const outputPath = `/agent/home/exports/construction-docs-${Date.now()}.pdf`;

  // Run the Python conversion script with file-based info (no inline JSON)
  report('Generating PDF package...');
  const result = await window.tasklet!.runCommand(
    `mkdir -p /agent/home/exports && uv run --with cairosvg,pypdf,reportlab python3 /agent/home/scripts/svg_to_pdf.py /tmp/drawings '${outputPath}' /tmp/drawings/project-info.json`
  );

  if (result.exitCode !== 0) {
    console.error('PDF generation failed:', result.log);
    throw new Error(`PDF generation failed: ${result.log}`);
  }

  // Trigger browser download
  report('Preparing download...');
  try {
    const pdfBase64 = await window.tasklet!.readFileFromDisk(outputPath);
    // Check if it's already base64 or raw text
    const isBase64 = !pdfBase64.startsWith('%PDF');
    const blob = isBase64
      ? new Blob([Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' })
      : new Blob([pdfBase64], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputPath.split('/').pop() || 'construction-docs.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (dlErr) {
    console.warn('Browser download failed, falling back to chat link:', dlErr);
  }

  // Also notify the agent for chat link as backup
  report('PDF ready!');
  if (window.tasklet?.sendMessageToAgent) {
    await window.tasklet!.sendMessageToAgent(`PDF export complete. File saved at: ${outputPath}`);
  }

  return outputPath;
}
