'use client';

import React, { useState } from 'react';
import { AppStep, ProjectRequirements, Layout, BOQ } from '@/types';
import { StepIndicator } from '@/components/StepIndicator';
import { RequirementForm } from '@/components/RequirementForm';
import { LayoutSelector } from '@/components/LayoutSelector';
import { FloorPlanView } from '@/components/FloorPlanView';
import { IsometricView } from '@/components/IsometricView';
import { WorkingDrawings } from '@/components/WorkingDrawings';
import { BOQReport } from '@/components/BOQReport';
import { InteriorDesign } from '@/components/InteriorDesign';
import ApartmentForm from '@/components/ApartmentForm';
import { generateLayouts } from '@/utils/layoutGenerator';
import { calculateBOQ } from '@/utils/boqCalculator';
import { BRAND_LOGO_BASE64 } from '@/utils/brand';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProject';
import { Home, Palette, ArrowRight } from 'lucide-react';

type AppMode = 'landing' | 'new_build' | 'interior_only';

export default function HomePage() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const { saveProject, saving } = useProject();

  const [mode, setMode] = useState<AppMode>('landing');
  const [step, setStep] = useState<AppStep>('requirements');
  const [requirements, setRequirements] = useState<ProjectRequirements | null>(null);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<Layout | null>(null);
  const [boq, setBOQ] = useState<BOQ | null>(null);

  const canNavigate = (target: AppStep): boolean => {
    if (mode === 'interior_only') {
      return target === 'interior' && selectedLayout !== null;
    }
    switch (target) {
      case 'requirements': return true;
      case 'layouts': return layouts.length > 0;
      case 'floorplan': return selectedLayout !== null;
      case 'isometric': return selectedLayout !== null;
      case 'working': return selectedLayout !== null;
      case 'boq': return boq !== null;
      case 'interior': return selectedLayout !== null;
      default: return false;
    }
  };

  const handleRequirements = (req: ProjectRequirements) => {
    setRequirements(req);
    const generated = generateLayouts(req);
    setLayouts(generated);
    setSelectedLayout(null);
    setBOQ(null);
    setStep('layouts');
  };

  const handleLayoutSelect = (layout: Layout) => {
    setSelectedLayout(layout);
    if (requirements) {
      const b = calculateBOQ(layout, requirements.floors.length);
      setBOQ(b);
    }
    setStep('floorplan');
  };

  const handleApartmentSubmit = (layout: Layout, req: ProjectRequirements) => {
    setRequirements(req);
    setSelectedLayout(layout);
    setLayouts([layout]);
    setStep('interior');
  };

  const handleBackToLanding = () => {
    setMode('landing');
    setStep('requirements');
    setRequirements(null);
    setLayouts([]);
    setSelectedLayout(null);
    setBOQ(null);
  };

  const handleSave = async () => {
    if (!user) {
      await signInWithGoogle();
    }
    if (requirements || selectedLayout) {
      await saveProject({
        name: requirements ? `${requirements.plotWidthFt}x${requirements.plotDepthFt} ${requirements.facing}-Facing` : 'Interior Project',
        requirements,
        selectedLayout,
        interiorConfig: null,
        renders: [],
      });
    }
  };

  /* ============ NAVBAR (shared) ============ */
  const Navbar = ({ showBack = false }: { showBack?: boolean }) => (
    <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <img
          src={BRAND_LOGO_BASE64}
          alt="neevv"
          className="h-8"
          onClick={showBack ? handleBackToLanding : undefined}
          style={showBack ? { cursor: 'pointer' } : undefined}
          title={showBack ? 'Back to Home' : undefined}
        />
        <div className="h-6 w-px bg-gray-300" />
        <span className="text-xs opacity-80 tracking-wide uppercase">
          {mode === 'interior_only' ? 'Interior Design Studio' : 'Residential Design Studio'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-80"
          >
            {saving ? 'Saving...' : '💾 Save'}
          </button>
        )}
        {authLoading ? null : user ? (
          <button onClick={signOut} className="text-sm opacity-70 hover:opacity-80 transition-opacity">Sign Out</button>
        ) : (
          <button onClick={signInWithGoogle} className="btn btn-sm btn-outline text-sm">Sign In</button>
        )}
      </div>
    </div>
  );

  /* ============ LANDING PAGE ============ */
  if (mode === 'landing') {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-3xl w-full space-y-10">
            {/* Hero */}
            <div className="text-center space-y-3">
              <h1 className="text-4xl font-bold text-gray-900">
                Welcome to <span className="text-blue-600">neevv</span>
              </h1>
              <p className="text-lg text-gray-600">Sapno Ka Nirman — Building Dreams</p>
              <p className="text-sm text-gray-500">AI-powered residential design for Indian homes</p>
            </div>

            {/* Entry Cards - exactly 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Build a New Home */}
              <div
                role="button"
                tabIndex={0}
                className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:shadow-lg hover:border-primary transition-all"
                onClick={() => setMode('new_build')}
              >
                <div className="w-14 h-14 rounded-xl bg-green-50 flex items-center justify-center mb-4">
                  <Home size={28} className="text-blue-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Build a New Home</h2>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  Complete architectural workflow — plot requirements, floor plans, 3D views, construction drawings, BOQ, and interior design.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {['Floor Plans', '3D Views', 'Drawings', 'BOQ', 'Interiors'].map((label) => (
                    <span key={label} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-blue-600 text-sm font-medium">
                  Get Started <ArrowRight size={14} />
                </div>
              </div>

              {/* Card 2: Interior Design Only */}
              <div
                role="button"
                tabIndex={0}
                className="bg-white border border-gray-200 rounded-lg p-6 cursor-pointer hover:shadow-lg hover:border-secondary transition-all"
                onClick={() => setMode('interior_only')}
              >
                <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
                  <Palette size={28} className="text-amber-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Interior Design Only</h2>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  Already have an apartment or flat? Enter room details and get mood boards, interior drawings, and cost estimation.
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {['Mood Boards', 'Drawings', 'Execution', 'Costing'].map((label) => (
                    <span key={label} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-amber-600 text-sm font-medium">
                  Get Started <ArrowRight size={14} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-xs text-gray-400">
              NBC 2016 compliant · Vastu intelligence · Indian residential standards
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ============ MAIN APP ============ */
  return (
    <div className="flex flex-col h-screen bg-white">
      <Navbar showBack />

      {/* Step indicator - only for new_build mode */}
      {mode === 'new_build' && (
        <StepIndicator current={step} onNavigate={setStep} canNavigate={canNavigate} />
      )}

      <div className="flex-1 overflow-y-auto">
        {/* NEW BUILD MODE */}
        {mode === 'new_build' && (
          <>
            {step === 'requirements' && <RequirementForm onSubmit={handleRequirements} />}
            {step === 'layouts' && requirements && (
              <LayoutSelector layouts={layouts} onSelect={handleLayoutSelect} vastuEnabled={requirements.vastuCompliance} />
            )}
            {step === 'floorplan' && selectedLayout && requirements && (
              <FloorPlanView layout={selectedLayout} vastuEnabled={requirements.vastuCompliance} onProceedToBOQ={() => setStep('isometric')} />
            )}
            {step === 'isometric' && selectedLayout && requirements && (
              <IsometricView layout={selectedLayout} requirements={requirements} />
            )}
            {step === 'working' && selectedLayout && requirements && (
              <WorkingDrawings layout={selectedLayout} requirements={requirements} boq={boq} />
            )}
            {step === 'boq' && boq && selectedLayout && (
              <BOQReport boq={boq} layout={selectedLayout} />
            )}
            {step === 'interior' && selectedLayout && requirements && (
              <InteriorDesign layout={selectedLayout} requirements={requirements} />
            )}
          </>
        )}

        {/* INTERIOR ONLY MODE */}
        {mode === 'interior_only' && step !== 'interior' && (
          <ApartmentForm onSubmit={handleApartmentSubmit} onBack={handleBackToLanding} />
        )}
        {mode === 'interior_only' && step === 'interior' && selectedLayout && requirements && (
          <InteriorDesign layout={selectedLayout} requirements={requirements} />
        )}
      </div>
    </div>
  );
}
