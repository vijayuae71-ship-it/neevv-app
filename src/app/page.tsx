'use client';

import React, { useState, useEffect } from 'react';
import { AppStep, ProjectRequirements, Layout, BOQ, CustomRateSheet } from '@/types';
import { StepIndicator } from '@/components/StepIndicator';
import { RequirementForm } from '@/components/RequirementForm';
import { LayoutSelector } from '@/components/LayoutSelector';

import { IsometricView } from '@/components/IsometricView';
import { WorkingDrawings } from '@/components/WorkingDrawings';
import { BOQReport } from '@/components/BOQReport';
import { ComplianceReport } from '@/components/ComplianceReport';
import { InteriorDesign } from '@/components/InteriorDesign';
import ApartmentForm from '@/components/ApartmentForm';
import { generateLayouts } from '@/utils/layoutGenerator';
import { autoFixLayout } from '@/utils/vastuAutoFix';
import { calculateBOQ } from '@/utils/boqCalculator';
import { BRAND_LOGO_BASE64 } from '@/utils/brand';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProject';
import DrawingUpload from '@/components/DrawingUpload';
import { RateSheet } from '@/components/RateSheet';
import { Home, Palette, Upload, ArrowRight, CheckCircle, Shield, Zap, Users, Clock, Building, Hammer, Compass, Star, FileText, Eye } from 'lucide-react';
import { analytics } from '@/utils/analytics';

type AppMode = 'landing' | 'new_build' | 'interior_only' | 'upload_drawing';

export default function HomePage() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const { saveProject, saving } = useProject();

  const [mode, setMode] = useState<AppMode>('landing');
  const [step, setStep] = useState<AppStep>('requirements');
  const [requirements, setRequirements] = useState<ProjectRequirements | null>(null);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<Layout | null>(null);
  const [boq, setBOQ] = useState<BOQ | null>(null);
  const [customRates, setCustomRates] = useState<CustomRateSheet | null>(null);

  // Auto-save to localStorage
  useEffect(() => {
    if (requirements || selectedLayout || boq) {
      const saveData = {
        mode,
        step,
        requirements,
        layouts,
        selectedLayout,
        boq,
        customRates,
        savedAt: Date.now(),
      };
      try {
        localStorage.setItem('neevv_project_autosave', JSON.stringify(saveData));
      } catch (e) {
        console.warn('Auto-save failed:', e);
      }
    }
  }, [mode, step, requirements, layouts, selectedLayout, boq, customRates]);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('neevv_project_autosave');
      if (saved) {
        const data = JSON.parse(saved);
        // Only restore if saved within last 24 hours
        if (data.savedAt && Date.now() - data.savedAt < 24 * 60 * 60 * 1000) {
          if (data.requirements) setRequirements(data.requirements);
          if (data.layouts?.length) setLayouts(data.layouts);
          if (data.selectedLayout) setSelectedLayout(data.selectedLayout);
          if (data.boq) setBOQ(data.boq);
          if (data.customRates) setCustomRates(data.customRates);
          if (data.mode && data.mode !== 'landing') setMode(data.mode);
          if (data.step) setStep(data.step);
        }
      }
    } catch (e) {
      console.warn('Restore failed:', e);
    }
  }, []);

  const canNavigate = (target: AppStep): boolean => {
    if (mode === 'interior_only') {
      return target === 'interior' && selectedLayout !== null;
    }
    switch (target) {
      case 'requirements': return true;
      case 'layouts': return layouts.length > 0;
      case 'compliance': return selectedLayout !== null;

      case 'isometric': return selectedLayout !== null;
      case 'working': return selectedLayout !== null;
      case 'rates': return selectedLayout !== null;
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
    analytics.requirementsSubmitted({
      plotSize: `${req.plotWidthFt}x${req.plotDepthFt}`,
      facing: req.facing,
      floors: req.floors.length,
    });
    setStep('layouts');
  };

  const handleLayoutSelect = (layout: Layout) => {
    setSelectedLayout(layout);
    if (requirements) {
      const b = calculateBOQ(layout, requirements.floors.length, customRates);
      setBOQ(b);
    }
    analytics.layoutSelected(layout.id);
    setStep('compliance');
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
    localStorage.removeItem('neevv_project_autosave');
  };

  const handleAutoFix = (currentLayout: Layout) => {
    if (!requirements) return;
    const optimized = autoFixLayout(currentLayout, requirements.facing);
    setSelectedLayout(optimized);
    // Update layouts array with the optimized version
    setLayouts(prev => prev.map(l => l.id === optimized.id ? optimized : l));
    // Recalculate BOQ with optimized layout
    const b = calculateBOQ(optimized, requirements.floors.length, customRates);
    setBOQ(b);
  };

  const handleUploadConversion = (layout: Layout, req: ProjectRequirements) => {
    setRequirements(req);
    setSelectedLayout(layout);
    setLayouts([layout]);
    const b = calculateBOQ(layout, req.floors.length, customRates);
    setBOQ(b);
    setMode('new_build');
    setStep('compliance');
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
  const Navbar = ({ showBack = false }: { showBack?: boolean }) => {
    if (!showBack) {
      // Landing page light navbar
      return (
        <nav className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8 py-3 flex items-center justify-between shrink-0" style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e5e5' }}>
          <div className="flex items-center gap-3">
            <img src={BRAND_LOGO_BASE64} alt="neevv" className="h-8" />
            <div className="h-6 w-px" style={{ backgroundColor: '#e5e5e5' }} />
            <span className="text-xs tracking-wide uppercase hidden sm:inline" style={{ color: '#4f6f52' }}>
              Architecture • Structure • MEP • Interiors
            </span>
          </div>
          <div className="flex items-center gap-1 md:gap-4">
            <a href="#why-neevv" className="text-xs md:text-sm px-2 py-1 rounded transition-colors hidden md:inline" style={{ color: '#555' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#4f6f52'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#555'; }}>Why neevv?</a>
            <a href="#deliverables" className="text-xs md:text-sm px-2 py-1 rounded transition-colors hidden md:inline" style={{ color: '#555' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#4f6f52'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#555'; }}>Deliverables</a>
            <a href="#how-it-works" className="text-xs md:text-sm px-2 py-1 rounded transition-colors hidden md:inline" style={{ color: '#555' }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#4f6f52'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#555'; }}>How It Works</a>
            <a href="#get-started" className="text-xs md:text-sm font-semibold px-4 py-1.5 rounded-lg transition-all hover:shadow-lg text-white" style={{ backgroundColor: '#4f6f52', color: '#fff' }}>
              Beta Access: FREE
            </a>
          </div>
        </nav>
      );
    }
    // App mode light navbar
    return (
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={BRAND_LOGO_BASE64}
            alt="neevv"
            className="h-8"
            onClick={handleBackToLanding}
            style={{ cursor: 'pointer' }}
            title="Back to Home"
          />
          <div className="h-6 w-px bg-gray-300" />
          <span className="text-xs opacity-80 tracking-wide uppercase">
            {mode === 'interior_only' ? 'Interior Design Studio' : 'Architecture • Structure • MEP • Interiors'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {selectedLayout && (
            <button
              onClick={() => {
                analytics.pdfExported('full_project');
                window.print();
              }}
              className="text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 transition-colors"
            >
              📄 Export Summary
            </button>
          )}
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
  };

  /* ============ LANDING PAGE ============ */
  if (mode === 'landing') {
    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#ffffff', color: '#1a1a1a', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", lineHeight: 1.6 }}>
        <Navbar />
        
        {/* Spacer for fixed navbar */}
        <div className="h-14" />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          
          {/* HERO SECTION */}
          <section style={{ padding: '80px 24px 60px', textAlign: 'center', background: 'linear-gradient(135deg, #f0f7f1 0%, #fff 50%, #f5f0eb 100%)' }}>
            <div style={{ display: 'inline-block', background: '#fff3e0', color: '#e65100', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700, marginBottom: '24px', letterSpacing: '0.5px' }}>
              🎉 BETA — First Design Package Completely FREE
            </div>
            <h1 style={{ fontSize: '48px', fontWeight: 800, color: '#1a1a1a', marginBottom: '16px', lineHeight: 1.15 }} className="md:text-5xl">
              Design Your Dream Home<br /><span style={{ color: '#4f6f52' }}>In Minutes, Not Months</span>
            </h1>
            <p style={{ fontSize: '20px', color: '#666', maxWidth: '700px', margin: '0 auto 32px' }}>
              Get 13 professional architectural drawings — Floor Plans, 3D Renders, Structural, MEP, BOQ — powered by <strong>neevv Generation Pro™</strong>
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => { analytics.modeSelected('new_build'); setMode('new_build'); }}
                style={{ background: '#4f6f52', color: '#fff', padding: '14px 32px', borderRadius: '10px', fontSize: '16px', fontWeight: 700, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                className="hover:opacity-90 transition-all"
              >
                🏠 Build a New Home
              </button>
              <button
                onClick={() => { analytics.modeSelected('interior_only'); setMode('interior_only'); }}
                style={{ background: '#fff', color: '#4f6f52', padding: '14px 32px', borderRadius: '10px', fontSize: '16px', fontWeight: 600, border: '2px solid #4f6f52', cursor: 'pointer' }}
                className="hover:opacity-90 transition-all"
              >
                🎨 Interior Design Only
              </button>
            </div>
          </section>

          {/* TRUST BAR */}
          <div style={{ background: '#f8faf8', padding: '40px 24px', borderTop: '1px solid #e8e8e8', borderBottom: '1px solid #e8e8e8' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'center', gap: '40px', flexWrap: 'wrap' }}>
              {[
                { icon: '📋', label: 'NBC 2016 Compliant' },
                { icon: '🕉️', label: 'Vastu Shastra' },
                { icon: '📐', label: 'IS 962 & SP 46' },
                { icon: '🔒', label: 'Data Secure' },
                { icon: '🇮🇳', label: 'Made for India' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#555', fontWeight: 500 }}>
                  <span style={{ fontSize: '20px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* STAKEHOLDERS */}
          <section id="stakeholders" style={{ padding: '80px 24px' }}>
            <h2 style={{ textAlign: 'center', fontSize: '36px', fontWeight: 800, color: '#1a1a1a', marginBottom: '12px' }}>Built for Every Stakeholder</h2>
            <p style={{ textAlign: 'center', fontSize: '18px', color: '#666', marginBottom: '48px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
              Whether you&apos;re building your first home or your hundredth project — neevv saves time, money, and headaches
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" style={{ maxWidth: '1100px', margin: '0 auto' }}>
              {[
                { icon: '🏠', title: 'Home Owners', desc: 'See your dream home in 3D before spending a single rupee on construction. Get all drawings in one go.', stat: '₹2-5L', statLabel: 'Saved on consultancy fees' },
                { icon: '📐', title: 'Architects', desc: 'Generate client presentations in minutes. Focus on creative design, not repetitive drafting.', stat: '80%', statLabel: 'Faster concept delivery' },
                { icon: '🏗️', title: 'Contractors', desc: 'Get accurate BOQ, structural details, and working drawings. No ambiguity on site.', stat: '0', statLabel: 'Rework from unclear drawings' },
                { icon: '🧱', title: 'Material Suppliers', desc: 'BOQ with exact quantities and specifications. Plan your inventory with confidence.', stat: '3%', statLabel: 'Wastage buffer built-in' },
              ].map(card => (
                <div
                  key={card.title}
                  className="transition-all hover:shadow-lg"
                  style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '16px', padding: '32px 24px', textAlign: 'center', cursor: 'default' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#4f6f52'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e5e5'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                >
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>{card.icon}</div>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>{card.title}</h3>
                  <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>{card.desc}</p>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#4f6f52' }}>{card.stat}</div>
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{card.statLabel}</div>
                </div>
              ))}
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section id="how-it-works" style={{ padding: '80px 24px', background: '#f8faf8' }}>
            <h2 style={{ textAlign: 'center', fontSize: '36px', fontWeight: 800, color: '#1a1a1a', marginBottom: '12px' }}>How It Works</h2>
            <p style={{ textAlign: 'center', fontSize: '18px', color: '#666', marginBottom: '48px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
              Three simple steps from dream to professional drawings
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8" style={{ maxWidth: '900px', margin: '0 auto' }}>
              {[
                { num: '1', title: 'Tell Us Your Requirements', desc: 'Plot size, rooms, budget tier, architectural style, Vastu preferences, and facing direction' },
                { num: '2', title: 'Choose Your Layout', desc: 'We generate 3 unique floor plan options. Pick the one you love — or customize further' },
                { num: '3', title: 'Get 13 Pro Drawings', desc: '3D renders, elevations, sections, structural, MEP, BOQ — all consistent and NBC-compliant' },
              ].map(item => (
                <div key={item.num} style={{ textAlign: 'center', padding: '24px' }}>
                  <div style={{ width: '48px', height: '48px', background: '#4f6f52', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 800, margin: '0 auto 16px' }}>
                    {item.num}
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>{item.title}</h3>
                  <p style={{ fontSize: '14px', color: '#666' }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 13 DELIVERABLES */}
          <section id="deliverables" style={{ padding: '80px 24px' }}>
            <h2 style={{ textAlign: 'center', fontSize: '36px', fontWeight: 800, color: '#1a1a1a', marginBottom: '12px' }}>13 Professional Deliverables</h2>
            <p style={{ textAlign: 'center', fontSize: '18px', color: '#666', marginBottom: '48px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
              Everything you need to start construction — generated in minutes
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4" style={{ maxWidth: '1100px', margin: '0 auto' }}>
              {[
                { icon: '🏠', name: '3D Front View' },
                { icon: '🌅', name: '3D Aerial View' },
                { icon: '🌙', name: '3D Night View' },
                { icon: '📐', name: 'Floor Plan' },
                { icon: '🏛️', name: 'Front Elevation' },
                { icon: '✂️', name: 'Cross Section' },
                { icon: '🧱', name: 'Brickwork Layout' },
                { icon: '🪜', name: 'Staircase Detail' },
                { icon: '🔩', name: 'Structural Plan' },
                { icon: '⚡', name: 'Electrical Layout' },
                { icon: '🚿', name: 'Plumbing Layout' },
                { icon: '💰', name: 'BOQ & Estimation' },
                { icon: '✅', name: 'Compliance Report' },
              ].map(item => (
                <div
                  key={item.name}
                  className="transition-all hover:shadow-md"
                  style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 16px', textAlign: 'center' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#4f6f52'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#e5e5e5'; }}
                >
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>{item.icon}</div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a' }}>{item.name}</h4>
                </div>
              ))}
            </div>
          </section>

          {/* WHY TRUST neevv? */}
          <section style={{ padding: '80px 24px', background: '#f8faf8' }}>
            <h2 style={{ textAlign: 'center', fontSize: '36px', fontWeight: 800, color: '#1a1a1a', marginBottom: '12px' }}>Why Trust neevv?</h2>
            <p style={{ textAlign: 'center', fontSize: '18px', color: '#666', marginBottom: '48px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
              Built on 25 years of industry wisdom
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ maxWidth: '900px', margin: '0 auto' }}>
              {[
                { icon: '📋', title: 'NBC 2016 Compliant', desc: 'Every drawing follows National Building Code minimums — room sizes, staircase headroom, fire safety standards' },
                { icon: '🕉️', title: 'Vastu Intelligence', desc: 'Kitchen in SE, Master Bedroom in SW, Pooja in NE — automatically applied to every layout' },
                { icon: '🔗', title: 'Drawing Consistency', desc: 'Floor plan matches elevation matches 3D matches section — no contradictions across your 13 deliverables' },
                { icon: '📐', title: 'Pro Drafting Standards', desc: 'IS 962:1989 and SP 46:2003 — proper line weights, hatching, grid lines, and section marks' },
                { icon: '🌍', title: 'Regional Intelligence', desc: 'A Kerala house looks different from a Rajasthan home — climate-appropriate design for your city' },
                { icon: '🧠', title: 'neevv Generation Pro™', desc: 'Our proprietary AI engine generates unique designs for every client — no two homes look alike' },
              ].map(item => (
                <div key={item.title} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '28px', flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>{item.title}</h4>
                    <p style={{ fontSize: '14px', color: '#666' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* CTA SECTION */}
          <section id="get-started" style={{ background: '#4f6f52', padding: '60px 24px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '36px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>Sapno Ka Nirman — Starts Here</h2>
            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.85)', marginBottom: '32px' }}>
              Your first complete design package is FREE during beta. No credit card. No commitment.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6" style={{ maxWidth: '900px', margin: '0 auto' }}>
              <div
                role="button"
                tabIndex={0}
                className="rounded-xl p-6 cursor-pointer transition-all hover:scale-105"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', padding: '24px' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.15)'; }}
                onClick={() => { analytics.modeSelected('new_build'); setMode('new_build'); }}
              >
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏠</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Build a New Home</h3>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginBottom: '12px' }}>
                  Complete architectural workflow — from plot requirements to construction-ready drawings.
                </p>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                  Start Designing →
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                className="rounded-xl p-6 cursor-pointer transition-all hover:scale-105"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', padding: '24px' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.15)'; }}
                onClick={() => { analytics.modeSelected('interior_only'); setMode('interior_only'); }}
              >
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🎨</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Interior Design Only</h3>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginBottom: '12px' }}>
                  Already have a flat? Get mood boards, interior drawings, and detailed cost estimation.
                </p>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                  Design Interiors →
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                className="rounded-xl p-6 cursor-pointer transition-all hover:scale-105"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', padding: '24px' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.15)'; }}
                onClick={() => { analytics.modeSelected('upload_drawing'); setMode('upload_drawing'); }}
              >
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>📤</div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>Upload Drawing</h3>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginBottom: '12px' }}>
                  Have an existing plan? Upload it — AI extracts rooms and generates all professional outputs.
                </p>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                  Upload Now →
                </div>
              </div>
            </div>
          </section>

          {/* FOOTER */}
          <footer style={{ background: '#1a1a1a', color: '#aaa', padding: '48px 24px 24px', textAlign: 'center' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
              <img src={BRAND_LOGO_BASE64} alt="neevv" style={{ height: '36px', marginBottom: '4px' }} />
              <div style={{ color: '#4f6f52', fontSize: '13px', letterSpacing: '2px', marginBottom: '24px', fontWeight: 600 }}>
                ARCHITECTURE • STRUCTURE • MEP • INTERIORS
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', flexWrap: 'wrap', marginBottom: '24px' }}>
                <a href="#" style={{ color: '#aaa', textDecoration: 'none', fontSize: '14px' }}>About</a>
                <a href="#" style={{ color: '#aaa', textDecoration: 'none', fontSize: '14px' }}>Privacy Policy</a>
                <a href="#" style={{ color: '#aaa', textDecoration: 'none', fontSize: '14px' }}>Terms of Service</a>
                <a href="#" style={{ color: '#aaa', textDecoration: 'none', fontSize: '14px' }}>Contact</a>
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>
                © {new Date().getFullYear()} <span style={{ color: '#4f6f52' }}>neevv</span> — Sapno Ka Nirman. All rights reserved.
              </div>
            </div>
          </footer>

        </div>
      </div>
    );
  }

  /* ============ UPLOAD DRAWING MODE ============ */
  if (mode === 'upload_drawing') {
    return <DrawingUpload onConversionComplete={handleUploadConversion} onBack={handleBackToLanding} />;
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
            {step === 'compliance' && selectedLayout && requirements && (
              <ComplianceReport layout={selectedLayout} vastuEnabled={requirements.vastuCompliance} facing={requirements.facing} onAutoFix={handleAutoFix} boqTotal={boq?.totalCost} numFloors={requirements.floors.length} customRates={customRates} />
            )}

            {step === 'isometric' && selectedLayout && requirements && (
              <IsometricView layout={selectedLayout} requirements={requirements} />
            )}
            {step === 'working' && selectedLayout && requirements && (
              <WorkingDrawings layout={selectedLayout} requirements={requirements} boq={boq} />
            )}
            {step === 'rates' && selectedLayout && requirements && (
              <RateSheet
                onSave={(rates) => {
                  setCustomRates(rates);
                  // Recalculate BOQ with new rates
                  const b = calculateBOQ(selectedLayout, requirements.floors.length, rates);
                  setBOQ(b);
                  setStep('boq');
                }}
                onSkip={() => {
                  // Use default rates
                  setCustomRates(null);
                  const b = calculateBOQ(selectedLayout, requirements.floors.length, null);
                  setBOQ(b);
                  setStep('boq');
                }}
                initialRateSheet={customRates || undefined}
              />
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
