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

  const isLightTheme = mode === 'landing' || (mode === 'new_build' && step === 'requirements') || mode === 'interior_only' && step !== 'interior';

  /* ============ LANDING PAGE ============ */
  if (mode === 'landing') {
    return (
      <div className="flex flex-col h-screen" data-theme="light">
        <div className="bg-base-200 border-b border-base-300 px-4 py-3 mb-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <img src={BRAND_LOGO_BASE64} alt="neevv" className="h-8" />
            <div className="h-6 w-px bg-base-300" />
            <span className="text-xs text-base-content/50 tracking-wide uppercase">Residential Design Studio</span>
          </div>
          <div>
            {authLoading ? null : user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-base-content/50 hidden sm:inline">{user.displayName}</span>
                <button onClick={signOut} className="text-sm text-base-content/40 hover:text-base-content/60">Sign Out</button>
              </div>
            ) : (
              <button onClick={signInWithGoogle} className="btn btn-sm btn-outline text-sm">
                Sign In
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-3xl w-full space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-base-content">Welcome to neevv</h1>
              <p className="text-base-content/60 text-lg">Sapno Ka Nirman — Building Dreams</p>
              <p className="text-base-content/50 text-sm mt-2">Choose how you'd like to get started</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* New Build Card */}
              <button
                className="card bg-base-100 border-2 border-base-300 hover:border-primary hover:shadow-lg transition-all duration-200 cursor-pointer text-left group"
                onClick={() => setMode('new_build')}
              >
                <div className="card-body p-6 space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Home size={28} className="text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-base-content">Build a New Home</h2>
                    <p className="text-sm text-base-content/60 mt-1">
                      Complete architectural workflow — from plot requirements to construction drawings, BOQ, 3D views, and interior design.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['Floor Plans', '3D Views', 'Working Drawings', 'BOQ', 'Interior Design'].map(tag => (
                      <span key={tag} className="badge badge-sm badge-ghost">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-primary text-sm font-medium">
                    Get Started <ArrowRight size={14} />
                  </div>
                </div>
              </button>

              {/* Interior Only Card */}
              <button
                className="card bg-base-100 border-2 border-base-300 hover:border-secondary hover:shadow-lg transition-all duration-200 cursor-pointer text-left group"
                onClick={() => setMode('interior_only')}
              >
                <div className="card-body p-6 space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                    <Palette size={28} className="text-secondary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-base-content">Interior Design Only</h2>
                    <p className="text-sm text-base-content/60 mt-1">
                      Already have an apartment or flat? Enter your room details and jump straight into mood boards, interior drawings, and cost estimation.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['Mood Boards', 'Interior Drawings', 'Execution Plan', 'Cost Estimation'].map(tag => (
                      <span key={tag} className="badge badge-sm badge-ghost">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-secondary text-sm font-medium">
                    Get Started <ArrowRight size={14} />
                  </div>
                </div>
              </button>
            </div>
            <p className="text-center text-xs text-base-content/40">
              NBC 2016 compliant · Vastu intelligence · Indian residential standards
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ============ MAIN APP ============ */
  return (
    <div className="flex flex-col h-screen" data-theme={isLightTheme ? 'light' : undefined}>
      <div className="bg-base-200 border-b border-base-300 px-4 py-3 mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={BRAND_LOGO_BASE64}
            alt="neevv"
            className="h-8 cursor-pointer"
            onClick={handleBackToLanding}
            title="Back to Home"
          />
          <div className="h-6 w-px bg-base-300" />
          {mode === 'interior_only' ? (
            <span className="text-xs text-base-content/50 tracking-wide uppercase">Interior Design Studio</span>
          ) : (
            <span className="text-xs text-base-content/50 tracking-wide uppercase">Residential Design Studio</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm bg-primary/20 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : '💾 Save Project'}
            </button>
          )}
          {user ? (
            <button onClick={signOut} className="text-sm text-base-content/40 hover:text-base-content">Sign Out</button>
          ) : (
            <button onClick={signInWithGoogle} className="text-sm text-base-content/40 hover:text-base-content">Sign In</button>
          )}
        </div>
      </div>

      {/* Step indicator - only show for new_build mode */}
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
