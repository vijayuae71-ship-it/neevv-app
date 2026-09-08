'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppStep, ProjectRequirements, Layout, BOQ, CustomRateSheet, OfficeRequirements } from '@/types';
import { StepIndicator } from '@/components/StepIndicator';
import { RequirementForm } from '@/components/RequirementForm';
import { LayoutSelector } from '@/components/LayoutSelector';

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
import DrawingUpload from '@/components/DrawingUpload';
import { OfficeRequirementForm } from '@/components/OfficeRequirementForm';
import { computeOfficeLayout } from '@/utils/computeOfficeLayout';
import { OfficeWorkingDrawings } from '@/components/OfficeWorkingDrawings';
import { OfficeBOQReport } from '@/components/OfficeBOQReport';
import { RateSheet } from '@/components/RateSheet';
import { LandingPage } from '@/components/LandingPage';
import { Dashboard, SavedProject } from '@/components/Dashboard';
import { useProjectAutoSave } from '@/hooks/useProjectAutoSave';
import { Home, Palette, Upload, ArrowRight, CheckCircle, Zap, Users, Clock, Building, Hammer, Compass, Star, FileText, Eye, Building2, ShieldCheck, ClipboardList, Layers, FileStack, Lock, Sparkles, ChevronLeft, ChevronRight, Boxes, Wrench, HardHat, CheckCircle2, Award, Briefcase, Ruler, LayoutDashboard } from 'lucide-react';
import { SHOWCASE_FLOORPLAN, SHOWCASE_ELEVATION, SHOWCASE_3DRENDER, SHOWCASE_ELECTRICAL, SHOWCASE_PLUMBING, SHOWCASE_STRUCTURAL, SHOWCASE_INTERIOR_PLAN, SHOWCASE_INTERIOR_ELEVATION, SHOWCASE_INTERIOR_3D } from '@/utils/showcaseImages';
import { analytics } from '@/utils/analytics';

type AppMode = 'landing' | 'new_build' | 'interior_only' | 'upload_drawing' | 'office_design' | 'room_design' | 'dashboard';

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
  const [motherLayoutLocked, setMotherLayoutLocked] = useState(false);
  const [officeRequirements, setOfficeRequirements] = useState<OfficeRequirements | null>(null);
  const [officeStep, setOfficeStep] = useState<'requirements' | 'layouts' | 'drawings' | 'boq'>('requirements');
  const [roomDesignType, setRoomDesignType] = useState<string>('');
  const [roomDesignWidth, setRoomDesignWidth] = useState<number>(12);
  const [roomDesignDepth, setRoomDesignDepth] = useState<number>(12);
  const [roomDesignStyle, setRoomDesignStyle] = useState<string>('modern_minimalist');
  const [drawingsGenerated, setDrawingsGenerated] = useState<number>(0);
  const [generatedDrawingTypes, setGeneratedDrawingTypes] = useState<string[]>([]);

  const { projectId: autoSaveProjectId, saving: autoSaving, lastSaved } = useProjectAutoSave({
    mode,
    step,
    requirements: requirements ?? undefined,
    selectedLayout: selectedLayout ?? undefined,
    boq: boq ?? undefined,
    drawingsGenerated,
    generatedDrawingTypes,
  });

  const handleDrawingGenerated = useCallback((drawingType: string) => {
    setGeneratedDrawingTypes(prev => {
      if (prev.includes(drawingType)) return prev;
      return [...prev, drawingType];
    });
    setDrawingsGenerated(prev => prev + 1);
  }, []);


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
          if (data.selectedLayout) setMotherLayoutLocked(true);
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
      case 'isometric': return motherLayoutLocked && selectedLayout !== null;
      case 'working': return motherLayoutLocked && selectedLayout !== null;
      case 'rates': return motherLayoutLocked && selectedLayout !== null;
      case 'boq': return motherLayoutLocked && boq !== null;
      case 'interior': return motherLayoutLocked && selectedLayout !== null;
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
    setMotherLayoutLocked(false);
    setStep('layouts');
  };

  const handleLayoutSelect = (layout: Layout) => {
    setSelectedLayout(layout);
    setMotherLayoutLocked(true); // Lock immediately — AI already generated NBC-compliant plan
    if (requirements) {
      const b = calculateBOQ(layout, requirements.floors.length, customRates);
      setBOQ(b);
    }
    analytics.layoutSelected(layout.id);
    setStep('isometric'); // Skip compliance — go straight to 3D View
  };

  const handleApartmentSubmit = (layout: Layout, req: ProjectRequirements) => {
    setRequirements(req);
    setSelectedLayout(layout);
    setLayouts([layout]);
    setStep('interior');
  };

  const handleLogoClick = () => {
    if (requirements !== null) {
      if (window.confirm('Return to home page? Your current project will be saved.')) {
        setMode('landing');
      }
    } else {
      setMode('landing');
    }
  };

  const handleNewProject = () => {
    setMode('landing');
    setStep('requirements');
    setRequirements(null);
    setLayouts([]);
    setSelectedLayout(null);
    setBOQ(null);
    localStorage.removeItem('neevv_project_autosave');
    setOfficeStep('requirements');
    setOfficeRequirements(null);
    setRoomDesignType('');
  };



  const handleUploadConversion = (layout: Layout, req: ProjectRequirements) => {
    setRequirements(req);
    setSelectedLayout(layout);
    setLayouts([layout]);
    const b = calculateBOQ(layout, req.floors.length, customRates);
    setBOQ(b);
    setMotherLayoutLocked(true);
    setMode('new_build');
    setStep('isometric');
  };

  const handleOfficeSubmit = (req: OfficeRequirements) => {
    setOfficeRequirements(req);
    const result = computeOfficeLayout(req);
    setLayouts(result.layouts);
    setSelectedLayout(null);
    setBOQ(null);
    setMotherLayoutLocked(false);
    setOfficeStep('layouts');
  };

  
  const handleRoomDesignSubmit = () => {
    const widthM = roomDesignWidth * 0.3048;
    const depthM = roomDesignDepth * 0.3048;
    const areaSqFt = roomDesignWidth * roomDesignDepth;
    const roomTypeMap: Record<string, string> = {
      'living_room': 'hall', 'bedroom': 'bedroom', 'master_bedroom': 'master_bedroom',
      'kitchen': 'kitchen', 'bathroom': 'toilet', 'dining': 'dining',
      'puja': 'puja', 'balcony': 'balcony', 'study': 'bedroom',
    };
    const mappedType = roomTypeMap[roomDesignType] || 'hall';
    const roomName = roomDesignType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    const singleRoomLayout: Layout = {
      id: 'room_design_' + Date.now(),
      name: roomName + ' Design',
      strategy: 'room_design',
      description: 'Individual room design',
      floors: [{
        floor: 0,
        floorLabel: 'Ground Floor',
        rooms: [{
          id: 'room_1',
          name: roomName,
          type: mappedType as any,
          x: 0, y: 0,
          width: widthM,
          depth: depthM,
          floor: 0,
        }],
        columns: [],
      }],
      vastuScore: 0,
      vastuDetails: [],
      nbcCompliant: true,
      nbcIssues: [],
      builtUpAreaSqM: widthM * depthM,
      builtUpAreaSqFt: areaSqFt,
      setbacks: { front: 0, rear: 0, left: 0, right: 0 },
      plotWidthM: widthM,
      plotDepthM: depthM,
      buildableWidthM: widthM,
      buildableDepthM: depthM,
    };

    const singleRoomReqs: ProjectRequirements = {
      city: 'Bangalore',
      state: 'Karnataka',
      plotWidthFt: roomDesignWidth,
      plotDepthFt: roomDesignDepth,
      facing: 'North',
      vastuCompliance: false,
      parkingType: 'None',
      budget: 'standard',
      architecturalStyle: roomDesignStyle as any,
      floors: [{
        floorLabel: 'Ground Floor',
        bedrooms: mappedType === 'bedroom' || mappedType === 'master_bedroom' ? 1 : 0,
        halls: mappedType === 'hall' ? 1 : 0,
        kitchens: mappedType === 'kitchen' ? 1 : 0,
        hasDining: mappedType === 'dining',
        hasPuja: mappedType === 'puja',
      }],
    };

    setRequirements(singleRoomReqs);
    setSelectedLayout(singleRoomLayout);
    setLayouts([singleRoomLayout]);
    setStep('interior');
  };

  const handleOfficeLayoutSelect = (layout: Layout) => {
    setSelectedLayout(layout);
    setMotherLayoutLocked(true);
    setOfficeStep('drawings');
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
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={BRAND_LOGO_BASE64}
            alt="neevv"
            className="h-8 hover:opacity-80 transition-opacity"
            onClick={handleLogoClick}
            style={{ cursor: 'pointer' }}
            title="Back to Home"
          />
          <div className="h-6 w-px bg-gray-300 hidden sm:block" />
          <span className="text-xs opacity-80 tracking-wide uppercase hidden sm:inline">
            {mode === 'interior_only' ? 'Interior Design Studio' : mode === 'office_design' ? 'Office Design Studio' : 'Architecture • Structure • MEP • Interiors'}
          </span>
          <button
            onClick={() => setMode('dashboard')}
            title="My Projects"
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <LayoutDashboard size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          {requirements !== null && (
            <button
              onClick={() => {
                if (window.confirm('Start a new project? Current progress will be saved until you begin a new one.')) {
                  handleNewProject();
                }
              }}
              className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              🔄 New Project
            </button>
          )}
          {selectedLayout && (
            <button
              onClick={() => {
                analytics.pdfExported('full_project');
                window.print();
              }}
              className="text-xs sm:text-sm bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 transition-colors"
            >
              📄 <span className="hidden sm:inline">Export Summary</span>
            </button>
          )}
          {user && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs sm:text-sm bg-blue-100 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-80"
            >
              {saving || autoSaving ? 'Saving...' : (<>💾 <span className="hidden sm:inline">Save</span></>)}
            </button>
          )}
          {authLoading ? null : user ? (
            <button onClick={signOut} className="text-xs sm:text-sm opacity-70 hover:opacity-80 transition-opacity">Sign Out</button>
          ) : (
            <button onClick={signInWithGoogle} className="btn btn-sm btn-outline text-xs sm:text-sm">Sign In</button>
          )}
        </div>
      </div>
    );
  };

const BRAND_GREEN = '#4f6f52';
  const BRAND_ACCENT = '#E86C2C';

  /* ============ LANDING PAGE ============ */
  if (mode === 'landing') {
    const heroCards = [
      { icon: <Home className="w-6 h-6" />, title: 'Build a New Home', subtitle: 'For homeowners & builders', desc: '17+ construction drawings — plans, structure, electrical, plumbing. All site-ready.', onClick: () => { analytics.modeSelected('new_build'); setMode('new_build'); } },
      { icon: <Palette className="w-6 h-6" />, title: 'Interior Design', subtitle: 'For homeowners & designers', desc: 'Room layouts, 3D renders, material schedules. Transform any space.', onClick: () => { analytics.modeSelected('interior_only'); setMode('interior_only'); } },
      { icon: <Building2 className="w-6 h-6" />, title: 'Design an Office', subtitle: 'For businesses & architects', desc: 'Workspace planning, MEP drawings, fire safety. NBC commercial compliant.', onClick: () => { analytics.modeSelected('office_design'); setMode('office_design'); } },
    ];

    const featureItems = [
      { icon: <FileStack className="w-5 h-5" />, value: '17+', label: 'Construction Drawings' },
      { icon: <Clock className="w-5 h-5" />, value: '< 5 min', label: 'Ready in Minutes' },
      { icon: <ShieldCheck className="w-5 h-5" />, value: 'NBC 2016', label: 'Fully Compliant' },
      { icon: <Layers className="w-5 h-5" />, value: 'IS 962', label: 'Drawing Standards' },
      { icon: <Lock className="w-5 h-5" />, value: '1 Layout', label: 'All Drawings Follow' },
    ];

    const showcaseItems = [
      { title: 'Floor Plan', src: SHOWCASE_FLOORPLAN, category: 'Architectural' },
      { title: 'Front Elevation', src: SHOWCASE_ELEVATION, category: 'Architectural' },
      { title: '3D Exterior Render', src: SHOWCASE_3DRENDER, category: 'Visualization' },
      { title: 'Electrical Layout', src: SHOWCASE_ELECTRICAL, category: 'MEP' },
      { title: 'Plumbing Layout', src: SHOWCASE_PLUMBING, category: 'MEP' },
      { title: 'Structural Drawing', src: SHOWCASE_STRUCTURAL, category: 'Structural' },
      { title: 'Interior — Plan', src: SHOWCASE_INTERIOR_PLAN, category: 'Interior' },
      { title: 'Interior — Wall Elevation', src: SHOWCASE_INTERIOR_ELEVATION, category: 'Interior' },
      { title: 'Interior — 3D Render', src: SHOWCASE_INTERIOR_3D, category: 'Interior' },
    ];

    const howSteps = [
      { icon: <ClipboardList className="w-5 h-5" />, title: 'Enter your plot details', desc: 'Plot size, facing, floors, rooms' },
      { icon: <Layers className="w-5 h-5" />, title: 'Pick from 3 layouts', desc: 'AI-generated, NBC-compliant, Vastu-optimized' },
      { icon: <Lock className="w-5 h-5" />, title: 'Lock your design', desc: 'This becomes your single source of truth' },
      { icon: <FileStack className="w-5 h-5" />, title: 'Download everything', desc: '17+ drawings, renders, BOQ — contractor-ready' },
    ];

    const tabData = [
      { label: 'Structural', items: ['Floor Plan', 'Foundation Plan', 'RCC Layout', 'Structural Drawing', 'Column Detail', 'Bar Bending Schedule', 'Section & Elevation'] },
      { label: 'MEP & Finishes', items: ['Electrical Layout', 'Plumbing Layout', 'Water Tank Design', 'Waterproofing Plan', 'STP Design', 'Tiling Plan', 'Brickwork Layout'] },
      { label: 'Visualization', items: ['3D Isometric View', 'Interior Renders', 'Material Schedule', 'BOQ Sheet'] },
    ];

    return <LandingPage
      heroCards={heroCards}
      featureItems={featureItems}
      showcaseItems={showcaseItems}
      howSteps={howSteps}
      tabData={tabData}
      brandGreen={BRAND_GREEN}
      brandAccent={BRAND_ACCENT}
      onUploadClick={() => { analytics.modeSelected('upload_drawing'); setMode('upload_drawing'); }}
      onRoomDesignClick={() => { analytics.modeSelected('room_design'); setMode('room_design'); }}
      onGetStarted={() => { analytics.modeSelected('new_build'); setMode('new_build'); }}
      onDashboardClick={() => setMode('dashboard')}
    />;
  }

  /* ============ DASHBOARD MODE ============ */
  if (mode === 'dashboard') {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <Navbar showBack />
        <div className="flex-1 overflow-auto">
          <Dashboard
            onNewProject={() => {
              handleNewProject();
            }}
            onOpenProject={(project: SavedProject) => {
              if (project.requirements) setRequirements(project.requirements);
              if (project.selectedLayout) {
                setSelectedLayout(project.selectedLayout);
                setMotherLayoutLocked(true);
                if (project.requirements) {
                  const b = calculateBOQ(project.selectedLayout, project.requirements.floors?.length || 1, customRates);
                  setBOQ(b);
                }
              }
              if (project.boq) setBOQ(project.boq);
              setDrawingsGenerated(project.drawingsGenerated ?? 0);
              setGeneratedDrawingTypes(project.generatedDrawingTypes ?? []);

              const restoredMode = (project.mode || 'new_build') as AppMode;
              setMode(restoredMode === 'dashboard' ? 'new_build' : restoredMode);

              const restoredStep =
                (project.step as AppStep) ||
                (project.drawingsGenerated && project.drawingsGenerated > 0
                  ? 'working'
                  : project.selectedLayout
                  ? 'isometric'
                  : 'requirements');
              setStep(restoredStep);
            }}
          />
        </div>
      </div>
    );
  }

  /* ============ ROOM DESIGN MODE ============ */
  if (mode === 'room_design') {
    if (step === 'interior' && selectedLayout && requirements) {
      return (
        <div className="flex flex-col h-screen bg-white">
          <Navbar showBack />
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5 text-center">
            <span className="text-xs text-gray-500">
              🎨 {roomDesignType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Design • {roomDesignWidth}×{roomDesignDepth} ft
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <InteriorDesign layout={selectedLayout} requirements={requirements} />
          </div>
        </div>
      );
    }

    const roomTypes = [
      { id: 'living_room', name: 'Living Room', icon: '🛋️', defaultW: 15, defaultD: 12 },
      { id: 'bedroom', name: 'Bedroom', icon: '🛏️', defaultW: 12, defaultD: 12 },
      { id: 'master_bedroom', name: 'Master Bedroom', icon: '🛌', defaultW: 14, defaultD: 14 },
      { id: 'kitchen', name: 'Kitchen', icon: '🍳', defaultW: 10, defaultD: 8 },
      { id: 'bathroom', name: 'Bathroom', icon: '🚿', defaultW: 7, defaultD: 5 },
      { id: 'dining', name: 'Dining Room', icon: '🍽️', defaultW: 12, defaultD: 10 },
      { id: 'puja', name: 'Pooja Room', icon: '🕉️', defaultW: 6, defaultD: 6 },
      { id: 'study', name: 'Study Room', icon: '📚', defaultW: 10, defaultD: 8 },
      { id: 'balcony', name: 'Balcony', icon: '🌿', defaultW: 10, defaultD: 4 },
    ];

    const styles = [
      { id: 'modern_minimalist', name: 'Modern Minimalist' },
      { id: 'contemporary_indian', name: 'Contemporary Indian' },
      { id: 'traditional', name: 'Traditional' },
      { id: 'industrial', name: 'Industrial' },
      { id: 'scandinavian', name: 'Scandinavian' },
    ];

    return (
      <div className="flex flex-col h-screen bg-white">
        <Navbar showBack />
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-800">Design a Single Room</h2>
              <p className="text-sm text-gray-500 mt-2">Pick a room, set dimensions, choose a style — get complete interior drawings & renders</p>
            </div>

            {/* Room Type Selection */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">Select Room Type</label>
              <div className="grid grid-cols-3 gap-3">
                {roomTypes.map(rt => (
                  <button
                    key={rt.id}
                    onClick={() => { setRoomDesignType(rt.id); setRoomDesignWidth(rt.defaultW); setRoomDesignDepth(rt.defaultD); }}
                    className={'rounded-xl p-4 text-center border-2 transition-all ' + (roomDesignType === rt.id ? 'border-green-600 bg-green-50 shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white')}
                  >
                    <div className="text-2xl mb-1">{rt.icon}</div>
                    <div className="text-xs font-semibold text-gray-800">{rt.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {roomDesignType && (
              <>
                {/* Dimensions */}
                <div className="mb-6 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Width (ft)</label>
                    <input type="number" min={4} max={30} value={roomDesignWidth || ''} onChange={(e) => setRoomDesignWidth(e.target.value === '' ? 0 : Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Depth (ft)</label>
                    <input type="number" min={4} max={30} value={roomDesignDepth || ''} onChange={(e) => setRoomDesignDepth(e.target.value === '' ? 0 : Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="mb-6 text-center text-sm text-gray-500">
                  Room area: <strong>{roomDesignWidth * roomDesignDepth} sqft</strong> ({(roomDesignWidth * roomDesignDepth * 0.0929).toFixed(1)} sqm)
                </div>

                {/* Style */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Design Style</label>
                  <div className="flex flex-wrap gap-2">
                    {styles.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setRoomDesignStyle(s.id)}
                        className={'px-4 py-2 rounded-full text-sm font-medium border transition-all ' + (roomDesignStyle === s.id ? 'border-green-600 bg-green-600 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-400')}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <button
                  onClick={handleRoomDesignSubmit}
                  className="w-full py-3 rounded-xl text-white font-bold text-base transition-all hover:shadow-lg"
                  style={{ backgroundColor: '#4f6f52' }}
                >
                  🎨 Design This Room →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ============ UPLOAD DRAWING MODE ============ */
  if (mode === 'upload_drawing') {
    return <DrawingUpload onConversionComplete={handleUploadConversion} onBack={handleNewProject} />;
  }

  /* ============ OFFICE DESIGN MODE ============ */
  if (mode === 'office_design') {
    const officeSteps = ['requirements', 'layouts', 'drawings', 'boq'] as const;
    const officeStepLabels: Record<string, string> = {
      requirements: '📋 Requirements',
      layouts: '🏗️ Layouts',
      drawings: '📐 Drawings',
      boq: '💰 BOQ',
    };

    return (
      <div className="flex flex-col h-screen bg-white">
        <Navbar showBack />

        {/* Office Step Indicator */}
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-center gap-2 overflow-x-auto">
          {officeSteps.map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-gray-300 text-xs">→</span>}
              <button
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                  officeStep === s
                    ? 'bg-blue-600 text-white'
                    : officeSteps.indexOf(officeStep) > i
                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    : 'bg-gray-100 text-gray-400'
                }`}
                onClick={() => {
                  const idx = officeSteps.indexOf(s);
                  const currentIdx = officeSteps.indexOf(officeStep);
                  if (idx <= currentIdx) setOfficeStep(s);
                }}
                disabled={officeSteps.indexOf(s) > officeSteps.indexOf(officeStep)}
              >
                {officeStepLabels[s]}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Office Project Context Bar */}
        {officeRequirements && officeStep !== 'requirements' && (
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5 text-center">
            <span className="text-xs text-gray-500">
              🏢 {officeRequirements.companyName || 'Office'} • {officeRequirements.plotWidthFt}×{officeRequirements.plotDepthFt} ft • {officeRequirements.facing}-Facing • {officeRequirements.employeeCount} employees • {officeRequirements.floors.length === 1 ? 'Single Floor' : `${officeRequirements.floors.length} Floors`}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {officeStep === 'requirements' && (
            <OfficeRequirementForm
              onSubmit={handleOfficeSubmit}
              onBack={handleNewProject}
              initialValues={officeRequirements}
            />
          )}

          {officeStep === 'layouts' && layouts.length > 0 && officeRequirements && (
            <LayoutSelector
              layouts={layouts}
              onSelect={handleOfficeLayoutSelect}
              vastuEnabled={false}
              requirements={{
                city: officeRequirements.city,
                state: officeRequirements.state,
                plotWidthFt: officeRequirements.plotWidthFt,
                plotDepthFt: officeRequirements.plotDepthFt,
                facing: officeRequirements.facing,
                vastuCompliance: false,
                parkingType: officeRequirements.parkingType,
                budget: officeRequirements.budget,
                architecturalStyle: 'modern_minimalist',
                floors: officeRequirements.floors.map(f => ({
                  floorLabel: f.floorLabel,
                  bedrooms: 0,
                  halls: 0,
                  kitchens: 0,
                  hasDining: false,
                  hasPuja: false,
                })),
              }}
            />
          )}

          {officeStep === 'drawings' && selectedLayout && officeRequirements && (
            <OfficeWorkingDrawings layout={selectedLayout} officeReq={officeRequirements} />
          )}

          {officeStep === 'boq' && selectedLayout && officeRequirements && (
            <OfficeBOQReport layout={selectedLayout} officeReq={officeRequirements} />
          )}
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

      {mode === 'new_build' && requirements && (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5 text-center">
          <span className="text-xs text-gray-500">
            {requirements.plotWidthFt}×{requirements.plotDepthFt} ft • {requirements.facing}-Facing • {requirements.floors.length === 1 ? 'Ground Floor' : `G+${requirements.floors.length - 1}`} • {requirements.floors[0]?.bedrooms || 2} BHK
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* NEW BUILD MODE */}
        {mode === 'new_build' && (
          <>
            {step === 'requirements' && <RequirementForm onSubmit={handleRequirements} initialValues={requirements} />}
            {step === 'layouts' && requirements && (
              <LayoutSelector layouts={layouts} onSelect={handleLayoutSelect} vastuEnabled={requirements.vastuCompliance} requirements={requirements} />
            )}

            {step === 'isometric' && selectedLayout && requirements && (
              <IsometricView layout={selectedLayout} requirements={requirements} />
            )}
            {step === 'working' && selectedLayout && requirements && (
              <WorkingDrawings layout={selectedLayout} requirements={requirements} boq={boq} onDrawingGenerated={handleDrawingGenerated} />
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
          <ApartmentForm onSubmit={handleApartmentSubmit} onBack={handleNewProject} />
        )}
        {mode === 'interior_only' && step === 'interior' && selectedLayout && requirements && (
          <InteriorDesign layout={selectedLayout} requirements={requirements} />
        )}
      </div>
    </div>
  );
}

