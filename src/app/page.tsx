'use client';

import React, { useState } from 'react';
import Image from 'next/image';
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
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProject';

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
        name: requirements ? `${requirements.plotWidth}x${requirements.plotDepth} ${requirements.facing}-Facing` : 'Interior Project',
        requirements,
        selectedLayout,
        interiorConfig: null,
        renders: [],
      });
    }
  };

  /* ============ LANDING PAGE ============ */
  if (mode === 'landing') {
    return (
      <div className="flex flex-col min-h-screen bg-white">
        {/* Header */}
        <header className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Image src="/icons/logo.png" alt="neevv" width={120} height={32} className="h-8 w-auto" />
            <div className="h-6 w-px bg-gray-300" />
            <span className="text-xs text-gray-400 tracking-wide uppercase hidden sm:inline">Residential Design Studio</span>
          </div>
          <div>
            {authLoading ? null : user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 hidden sm:inline">{user.displayName}</span>
                <button onClick={signOut} className="text-sm text-gray-400 hover:text-gray-600">Sign Out</button>
              </div>
            ) : (
              <button onClick={signInWithGoogle} className="btn-secondary text-sm px-4 py-2">
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* Hero */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-3xl w-full space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Welcome to neevv</h1>
              <p className="text-gray-500 text-lg">Sapno Ka Nirman — Building Dreams</p>
              <p className="text-gray-400 text-sm mt-2">Choose how you&apos;d like to get started</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* New Build Card */}
              <button
                className="card text-left group hover:shadow-xl hover:border-neevv-accent transition-all duration-200"
                onClick={() => setMode('new_build')}
              >
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                    <span className="text-3xl">🏠</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Build a New Home</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Complete architectural workflow — from plot requirements to construction drawings, BOQ, 3D views, and interior design.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['Floor Plans', '3D Views', 'Working Drawings', 'BOQ', 'Interior Design'].map(tag => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-neevv-accent text-sm font-medium">
                    Get Started →
                  </div>
                </div>
              </button>

              {/* Interior Only Card */}
              <button
                className="card text-left group hover:shadow-xl hover:border-neevv-purple transition-all duration-200"
                onClick={() => setMode('interior_only')}
              >
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                    <span className="text-3xl">🎨</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Interior Design Only</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Already have an apartment or flat? Enter your room details and jump straight into mood boards, interior drawings, and cost estimation.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['Mood Boards', 'Interior Drawings', 'Execution Plan', 'Cost Estimation'].map(tag => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-neevv-purple text-sm font-medium">
                    Get Started →
                  </div>
                </div>
              </button>
            </div>

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
    <div className="flex flex-col min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image
            src="/icons/logo.png"
            alt="neevv"
            width={120}
            height={32}
            className="h-8 w-auto cursor-pointer"
            onClick={handleBackToLanding}
          />
          <div className="h-6 w-px bg-gray-600" />
          <span className="text-xs text-gray-400 tracking-wide uppercase">
            {mode === 'interior_only' ? 'Interior Design Studio' : 'Residential Design Studio'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm bg-neevv-accent/20 text-neevv-accent px-3 py-1.5 rounded-lg hover:bg-neevv-accent/30 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : '💾 Save Project'}
            </button>
          )}
          {user ? (
            <button onClick={signOut} className="text-sm text-gray-400 hover:text-white">Sign Out</button>
          ) : (
            <button onClick={signInWithGoogle} className="text-sm text-gray-400 hover:text-white">Sign In</button>
          )}
        </div>
      </header>

      {/* Step indicator — only for new_build */}
      {mode === 'new_build' && (
        <StepIndicator current={step} onNavigate={setStep} canNavigate={canNavigate} />
      )}

      <main className="flex-1 overflow-y-auto">
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
      </main>
    </div>
  );
}
