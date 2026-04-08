'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Layout, ProjectRequirements } from '../types';
import { Smartphone, RotateCcw, ZoomIn, ZoomOut, Maximize, Info, ShoppingCart } from 'lucide-react';

/**
 * ModelARView — Embeds the .glb villa model using Google <model-viewer>
 * with AR support (WebXR, Scene Viewer, Quick Look) and material hotspot.
 */

// TypeScript declaration for model-viewer custom element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          ar?: boolean | string;
          'ar-modes'?: string;
          'camera-controls'?: boolean | string;
          'touch-action'?: string;
          'auto-rotate'?: boolean | string;
          'shadow-intensity'?: string;
          'shadow-softness'?: string;
          'environment-image'?: string;
          exposure?: string;
          'camera-orbit'?: string;
          'min-camera-orbit'?: string;
          'max-camera-orbit'?: string;
          'field-of-view'?: string;
          poster?: string;
          loading?: string;
          reveal?: string;
          'ar-scale'?: string;
          'ar-placement'?: string;
          'ios-src'?: string;
          tone-mapping?: string;
          ref?: React.Ref<HTMLElement>;
        },
        HTMLElement
      >;
    }
  }
}

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
}

export const ModelARView: React.FC<Props> = ({ layout, requirements }) => {
  const modelRef = useRef<HTMLElement>(null);
  const [arSupported, setArSupported] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showQuotePanel, setShowQuotePanel] = useState(false);

  // Compute building stats for the quote panel
  const numFloors = layout.floors.length;
  const frontSetback = requirements.plotWidthFt >= 40 ? 3.0 : 1.5;
  const sideSetback = requirements.plotWidthFt >= 40 ? 1.5 : 1.0;
  const rearSetback = requirements.plotDepthFt >= 40 ? 1.5 : 1.0;
  const buildW = layout.plotWidthM - 2 * sideSetback;
  const buildD = layout.plotDepthM - frontSetback - rearSetback;
  const builtUpPerFloor = Math.round(buildW * buildD * 10.764);
  const totalBuiltUp = builtUpPerFloor * numFloors;

  // Material estimates (approximate)
  const cementBags = Math.round(totalBuiltUp * 0.4);      // ~0.4 bags per sq.ft
  const steelKg = Math.round(totalBuiltUp * 4.5);          // 4.5 kg/sq.ft
  const bricks = Math.round(totalBuiltUp * 8);              // ~8 bricks per sq.ft
  const sandCFT = Math.round(totalBuiltUp * 1.25);          // 1.25 CFT per sq.ft
  const aggregateCFT = Math.round(totalBuiltUp * 0.85);     // 0.85 CFT per sq.ft

  useEffect(() => {
    const el = modelRef.current;
    if (!el) return;

    const handleLoad = () => setIsLoaded(true);
    el.addEventListener('load', handleLoad);

    // Check AR support
    if ('xr' in navigator) {
      (navigator as any).xr?.isSessionSupported?.('immersive-ar')
        .then((supported: boolean) => setArSupported(supported))
        .catch(() => setArSupported(false));
    }

    return () => {
      el.removeEventListener('load', handleLoad);
    };
  }, []);

  const handleHotspotClick = () => {
    setShowQuotePanel(!showQuotePanel);
  };

  return (
    <div className="relative w-full h-full min-h-[500px] bg-gradient-to-b from-gray-50 to-gray-100 rounded-xl overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border border-gray-200">
          <span className="text-xs font-bold text-[#4f6f52]">
            🏠 AR Model — {requirements.plotWidthFt}' × {requirements.plotDepthFt}' Villa
          </span>
        </div>
        {arSupported && (
          <div className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1">
            <Smartphone size={12} />
            AR Ready
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#4f6f52] border-t-transparent" />
          <p className="mt-3 text-sm text-gray-600 font-medium">Loading 3D Model...</p>
        </div>
      )}

      {/* model-viewer */}
      <model-viewer
        ref={modelRef}
        src="/models/villa_30x40.glb"
        alt={`${requirements.plotWidthFt}×${requirements.plotDepthFt} Villa — neevv Architecture`}
        ar
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="auto"
        ar-placement="floor"
        camera-controls
        touch-action="pan-y"
        auto-rotate
        shadow-intensity="1.2"
        shadow-softness="0.8"
        exposure="1.0"
        camera-orbit="45deg 55deg 20m"
        min-camera-orbit="auto auto 5m"
        max-camera-orbit="auto auto 50m"
        field-of-view="30deg"
        loading="eager"
        style={{ width: '100%', height: '100%', minHeight: '500px' }}
      >
        {/* AR button custom styling */}
        <button
          slot="ar-button"
          className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[#4f6f52] text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg hover:bg-[#3d5840] transition-colors flex items-center gap-2 z-30"
        >
          <Smartphone size={16} />
          View in Your Space (AR)
        </button>

        {/* Hotspot — Front Pillar: "Get Quote for Cement and all materials" */}
        <button
          className="hotspot"
          slot="hotspot-pillar-quote"
          data-position="-3.4m 3.5m -4.4m"
          data-normal="0 0 -1"
          data-visibility-attribute="visible"
          onClick={handleHotspotClick}
          style={{
            background: showQuotePanel ? '#4f6f52' : '#ff6b35',
            color: 'white',
            border: '3px solid white',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.3s ease',
            fontSize: '18px',
            fontWeight: 'bold',
            animation: 'pulse 2s infinite',
          }}
          title="Get Quote for Cement and all materials"
        >
          <ShoppingCart size={20} />
        </button>

        {/* Hotspot annotation label */}
        <div
          className="hotspot-label"
          slot="hotspot-pillar-quote"
          style={{
            background: showQuotePanel ? '#4f6f52' : '#ff6b35',
            color: 'white',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '11px',
            fontWeight: '700',
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            marginTop: '8px',
            letterSpacing: '0.3px',
          }}
        >
          Get Quote for Cement &amp; all materials
        </div>

        {/* Poster placeholder during load */}
        <div slot="poster" className="flex items-center justify-center w-full h-full bg-gray-100">
          <div className="text-center">
            <div className="animate-pulse text-4xl mb-2">🏠</div>
            <p className="text-sm text-gray-500">Preparing 3D Model...</p>
          </div>
        </div>
      </model-viewer>

      {/* Material Quote Panel (slides in when hotspot clicked) */}
      {showQuotePanel && (
        <div className="absolute right-3 top-14 z-30 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-72" style={{ animation: 'slideIn 0.3s ease-out' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[#4f6f52] text-sm flex items-center gap-1">
              <ShoppingCart size={14} />
              Material Estimate
            </h3>
            <button
              onClick={() => setShowQuotePanel(false)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="text-xs text-gray-500 mb-3 pb-2 border-b border-gray-100">
            {requirements.plotWidthFt}' × {requirements.plotDepthFt}' | {totalBuiltUp} sq.ft | {numFloors} Floor(s)
          </div>

          <div className="space-y-2">
            <QuoteRow label="Cement (OPC 53)" qty={`${cementBags} bags`} rate="₹380/bag" total={`₹${(cementBags * 380).toLocaleString('en-IN')}`} />
            <QuoteRow label="Steel (Fe500D)" qty={`${steelKg} kg`} rate="₹72/kg" total={`₹${(steelKg * 72).toLocaleString('en-IN')}`} />
            <QuoteRow label="Bricks (Fly Ash)" qty={`${bricks} nos`} rate="₹7/brick" total={`₹${(bricks * 7).toLocaleString('en-IN')}`} />
            <QuoteRow label="River Sand" qty={`${sandCFT} CFT`} rate="₹55/CFT" total={`₹${(sandCFT * 55).toLocaleString('en-IN')}`} />
            <QuoteRow label="20mm Aggregate" qty={`${aggregateCFT} CFT`} rate="₹38/CFT" total={`₹${(aggregateCFT * 38).toLocaleString('en-IN')}`} />
          </div>

          <div className="mt-3 pt-2 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <span className="font-bold text-sm text-gray-800">Estimated Total</span>
              <span className="font-bold text-[#4f6f52] text-sm">
                ₹{(
                  cementBags * 380 +
                  steelKg * 72 +
                  bricks * 7 +
                  sandCFT * 55 +
                  aggregateCFT * 38
                ).toLocaleString('en-IN')}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">*Includes 3% site wastage buffer. Rates are indicative.</p>
          </div>

          <button
            className="mt-3 w-full bg-[#4f6f52] text-white py-2 rounded-lg text-xs font-bold hover:bg-[#3d5840] transition-colors flex items-center justify-center gap-1"
            onClick={() => {
              const msg = `Hi, I need a quote for building materials for my ${requirements.plotWidthFt}'×${requirements.plotDepthFt}' villa (${totalBuiltUp} sq.ft). Cement: ${cementBags} bags, Steel: ${steelKg} kg, Bricks: ${bricks}. Please share best rates.`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
            }}
          >
            📲 Share on WhatsApp for Best Rates
          </button>
        </div>
      )}

      {/* Bottom info bar */}
      <div className="absolute bottom-3 left-3 z-20 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Info size={11} />
            Drag to rotate • Pinch to zoom • Tap hotspot for quote
          </span>
        </div>
      </div>

      {/* CSS for pulse animation */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
          50% { transform: scale(1.1); box-shadow: 0 6px 20px rgba(255,107,53,0.5); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

/** Single row in the material quote panel */
const QuoteRow: React.FC<{
  label: string;
  qty: string;
  rate: string;
  total: string;
}> = ({ label, qty, rate, total }) => (
  <div className="flex items-center justify-between py-1 border-b border-gray-50">
    <div>
      <div className="font-semibold text-gray-800 text-xs">{label}</div>
      <div className="text-[10px] text-gray-400">{qty} @ {rate}</div>
    </div>
    <div className="font-bold text-xs text-gray-700">{total}</div>
  </div>
);
