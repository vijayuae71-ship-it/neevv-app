// Analytics event tracking for neevv
// Replace G-XXXXXXXXXX in layout.tsx with your GA4 measurement ID

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}

// Pre-defined events for key user actions
export const analytics = {
  // Funnel events
  requirementsSubmitted: (req: { plotSize: string; facing: string; floors: number }) =>
    trackEvent('requirements_submitted', req),
  
  layoutSelected: (layoutId: string) =>
    trackEvent('layout_selected', { layout_id: layoutId }),
  
  // Generation events
  drawingGenerated: (drawingType: string) =>
    trackEvent('drawing_generated', { drawing_type: drawingType }),
  
  renderGenerated: (viewAngle: string) =>
    trackEvent('render_generated', { view_angle: viewAngle }),
  
  // Download events
  drawingDownloaded: (drawingType: string) =>
    trackEvent('drawing_downloaded', { drawing_type: drawingType }),
  
  pdfExported: (section: string) =>
    trackEvent('pdf_exported', { section }),
  
  // Share events
  shareClicked: (method: string) =>
    trackEvent('share_clicked', { method }),
  
  // Mode events
  modeSelected: (mode: string) =>
    trackEvent('mode_selected', { mode }),
  
  // Error events
  generationFailed: (drawingType: string, error: string) =>
    trackEvent('generation_failed', { drawing_type: drawingType, error }),
};
