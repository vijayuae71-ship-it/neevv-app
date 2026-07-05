/**
 * PDF Export Utility — AI-First
 * Exports cached AI-generated drawing images as a professional PDF package.
 * Uses reportlab to compose images with cover page and title blocks.
 */
import { Layout, ProjectRequirements, BOQ } from '../types';

export interface ExportProgress {
  step: string;
  current: number;
  total: number;
}

export type ExportMode = 'working-drawings' | 'floorplan' | 'full-package';

/**
 * Export AI-generated images as a PDF package.
 * Takes the cached images map from WorkingDrawings component.
 */
export async function exportAIPDF(
  aiImages: Record<string, string>,
  layout: Layout,
  requirements: ProjectRequirements,
  boq: BOQ | null,
  onProgress?: (p: ExportProgress) => void
): Promise<string> {
  if (typeof window === 'undefined' || !(window as any).tasklet) {
    throw new Error('PDF export is coming soon! Our team is building a seamless download experience for you.');
  }

  const imageEntries = Object.entries(aiImages);
  if (imageEntries.length === 0) {
    throw new Error('No drawings generated yet. Generate at least one drawing before exporting.');
  }

  const totalSteps = imageEntries.length + 4;
  let currentStep = 0;

  const report = (step: string) => {
    currentStep++;
    onProgress?.({ step, current: currentStep, total: totalSteps });
  };

  // Clean up temp directory
  report('Preparing export...');
  await window.tasklet!.runCommand('rm -rf /tmp/ai-drawings && mkdir -p /tmp/ai-drawings');

  // Drawing label map for PDF page titles
  const labelMap: Record<string, string> = {
    excavation: 'EXCAVATION LAYOUT',
    foundation: 'FOUNDATION PLAN',
    footingDetail: 'FOOTING DETAIL',
    rccDetail: 'RCC SLAB & BEAM DETAIL',
    structural: 'COLUMN & BEAM GRID',
    reinforcement: 'REINFORCEMENT DETAILS',
    barBending: 'BAR BENDING SCHEDULE',
    section: 'SECTION A-A',
    elevation: 'FRONT ELEVATION',
    brickwork: 'BRICKWORK LAYOUT',
    electrical: 'ELECTRICAL LAYOUT',
    plumbing: 'PLUMBING LAYOUT',
    tiling: 'TILING LAYOUT',
    staircase: 'STAIRCASE DETAIL',
    waterTank: 'WATER TANK DETAIL',
    waterproofing: 'WATERPROOFING DETAIL',
    stp: 'STP LAYOUT',
  };

  // Write each AI image as a PNG file
  for (const [key, dataUri] of imageEntries) {
    report(`Saving ${labelMap[key] || key}...`);
    // Extract base64 data from data URI
    const base64Data = dataUri.replace(/^data:image\/\w+;base64,/, '');
    await window.tasklet!.writeFileToDisk(`/tmp/ai-drawings/${key}.b64`, base64Data);
    // Decode base64 to actual PNG
    await window.tasklet!.runCommand(`base64 -d /tmp/ai-drawings/${key}.b64 > /tmp/ai-drawings/${key}.png && rm /tmp/ai-drawings/${key}.b64`);
  }

  // Project info for cover page
  const totalBeds = requirements.floors.reduce((sum: number, f: any) => sum + (f.bedrooms || 0), 0);
  const bhkLabel = `${totalBeds}BHK`;
  const projectInfo = {
    project: `${bhkLabel} Residential Building`,
    location: `${requirements.city}, ${requirements.state}`,
    plotSize: `${requirements.plotWidthFt}ft x ${requirements.plotDepthFt}ft (${requirements.facing} Facing)`,
    floors: requirements.floors.map((f: any, i: number) => `${i === 0 ? 'Ground' : `Floor ${i}`}: ${f.bedrooms} Bed`).join(', '),
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    drawingCount: imageEntries.length,
    labels: Object.fromEntries(imageEntries.map(([k]) => [k, labelMap[k] || k])),
  };

  await window.tasklet!.writeFileToDisk('/tmp/ai-drawings/project-info.json', JSON.stringify(projectInfo));

  if (boq) {
    await window.tasklet!.writeFileToDisk('/tmp/ai-drawings/boq-data.json', JSON.stringify(boq));
  }

  // Copy logo if available
  await window.tasklet!.runCommand('cp /agent/home/apps/architect-engineer/neevv-logo.png /tmp/ai-drawings/neevv-logo.png 2>/dev/null || true');

  const outputPath = `/agent/home/exports/neevv-drawings-${Date.now()}.pdf`;

  // Generate PDF using Python + reportlab
  report('Generating PDF package...');

  const pythonScript = `
import json, os, sys, glob
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

drawings_dir = sys.argv[1]
output_path = sys.argv[2]

with open(os.path.join(drawings_dir, 'project-info.json')) as f:
    info = json.load(f)

labels = info.get('labels', {})
page_w, page_h = landscape(A3)
c = canvas.Canvas(output_path, pagesize=landscape(A3))

# Cover page
c.setFillColor(HexColor('#4f6f52'))
c.rect(0, 0, page_w, page_h, fill=1)
c.setFillColor(HexColor('#ffffff'))
c.setFont('Helvetica-Bold', 36)
c.drawCentredString(page_w/2, page_h - 120, 'neevv')
c.setFont('Helvetica', 14)
c.drawCentredString(page_w/2, page_h - 150, 'ARCHITECTURE  •  STRUCTURE  •  MEP  •  INTERIORS')
c.setFont('Helvetica-Bold', 24)
c.drawCentredString(page_w/2, page_h/2 + 40, info['project'])
c.setFont('Helvetica', 16)
c.drawCentredString(page_w/2, page_h/2, info['location'])
c.drawCentredString(page_w/2, page_h/2 - 30, f"Plot: {info['plotSize']}")
c.drawCentredString(page_w/2, page_h/2 - 60, info['floors'])
c.setFont('Helvetica', 12)
c.drawCentredString(page_w/2, 80, f"Generated: {info['date']}  |  {info['drawingCount']} Professional Drawings")
c.drawCentredString(page_w/2, 60, 'Powered by neevv Generation Pro')
c.showPage()

# Drawing pages
png_files = sorted(glob.glob(os.path.join(drawings_dir, '*.png')))
for png_path in png_files:
    key = os.path.splitext(os.path.basename(png_path))[0]
    if key == 'neevv-logo':
        continue
    title = labels.get(key, key.upper())
    
    # Title block header
    c.setFillColor(HexColor('#f5f5f5'))
    c.rect(0, page_h - 50, page_w, 50, fill=1)
    c.setStrokeColor(HexColor('#4f6f52'))
    c.setLineWidth(2)
    c.line(0, page_h - 50, page_w, page_h - 50)
    
    c.setFillColor(HexColor('#1a1a1a'))
    c.setFont('Helvetica-Bold', 18)
    c.drawString(20, page_h - 35, title)
    
    c.setFillColor(HexColor('#4f6f52'))
    c.setFont('Helvetica', 10)
    c.drawRightString(page_w - 20, page_h - 25, 'neevv  |  Architecture • Structure • MEP • Interiors')
    c.drawRightString(page_w - 20, page_h - 40, f"{info['project']}  |  {info['location']}")
    
    # Drawing image - fit to page with margins
    margin = 30
    img_area_w = page_w - margin * 2
    img_area_h = page_h - 50 - margin * 2 - 30  # subtract header and footer
    
    try:
        from reportlab.lib.utils import ImageReader
        img = ImageReader(png_path)
        iw, ih = img.getSize()
        scale = min(img_area_w / iw, img_area_h / ih)
        draw_w = iw * scale
        draw_h = ih * scale
        x = margin + (img_area_w - draw_w) / 2
        y = margin + 30 + (img_area_h - draw_h) / 2
        c.drawImage(png_path, x, y, draw_w, draw_h, preserveAspectRatio=True)
    except Exception as e:
        c.setFillColor(HexColor('#cc0000'))
        c.setFont('Helvetica', 14)
        c.drawCentredString(page_w/2, page_h/2, f'Image load error: {str(e)}')
    
    # Footer
    c.setFillColor(HexColor('#999999'))
    c.setFont('Helvetica', 8)
    c.drawString(20, 20, f"neevv Generation Pro  |  NBC 2016 Compliant  |  {info['date']}")
    c.drawRightString(page_w - 20, 20, f"Plot: {info['plotSize']}")
    
    c.showPage()

c.save()
print(f'PDF saved: {output_path}')
`;

  await window.tasklet!.writeFileToDisk('/tmp/ai-drawings/gen_pdf.py', pythonScript);

  const result = await window.tasklet!.runCommand(
    `mkdir -p /agent/home/exports && uv run --with reportlab python3 /tmp/ai-drawings/gen_pdf.py /tmp/ai-drawings '${outputPath}'`
  );

  if (result.exitCode !== 0) {
    console.error('PDF generation failed:', result.log);
    throw new Error(`PDF generation failed: ${result.log}`);
  }

  // Trigger browser download
  report('Preparing download...');
  try {
    const pdfBase64 = await window.tasklet!.readFileFromDisk(outputPath);
    const isBase64 = !pdfBase64.startsWith('%PDF');
    const blob = isBase64
      ? new Blob([Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' })
      : new Blob([pdfBase64], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = outputPath.split('/').pop() || 'neevv-drawings.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (dlErr) {
    console.warn('Browser download failed:', dlErr);
  }

  report('PDF ready!');
  if (window.tasklet && window.tasklet.sendMessageToAgent) {
    await window.tasklet.sendMessageToAgent(`PDF export complete. File saved at: ${outputPath}`);
  }

  return outputPath;
}

/* Legacy export function signature kept for backward compatibility */
export async function exportToPDF(
  layout: Layout,
  requirements: ProjectRequirements,
  boq: BOQ | null,
  mode: ExportMode,
  onProgress?: (p: ExportProgress) => void
): Promise<string> {
  throw new Error('SVG export has been replaced by AI-powered drawings. Use the Generate All button first, then export.');
}
