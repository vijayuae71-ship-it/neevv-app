'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowRight, ShieldCheck, ChevronLeft, ChevronRight,
  CheckCircle2, HardHat, Upload, Lock, Clock, Sparkles,
} from 'lucide-react';
import { BRAND_LOGO_BASE64 } from '@/utils/brand';

/* Scroll-reveal */
function useRevealOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) { setVisible(true); obs.unobserve(entries[0].target); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({ children, delay = 0, className = '' }) => {
  const { ref, visible } = useRevealOnScroll();
  return (
    <div ref={ref} className={className} style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: `opacity 0.5s ease-out ${delay}ms, transform 0.5s ease-out ${delay}ms` }}>
      {children}
    </div>
  );
};

interface HeroCardData { icon: React.ReactNode; title: string; subtitle: string; desc: string; onClick: () => void; }
interface FeatureItem { icon: React.ReactNode; value: string; label: string; }
interface ShowcaseItem { title: string; src: string; category: string; }
interface HowStep { icon: React.ReactNode; title: string; desc: string; }
interface TabDataItem { label: string; items: string[]; }

interface LandingPageProps {
  heroCards: HeroCardData[];
  featureItems: FeatureItem[];
  showcaseItems: ShowcaseItem[];
  howSteps: HowStep[];
  tabData: TabDataItem[];
  brandGreen: string;
  brandAccent: string;
  onUploadClick: () => void;
  onRoomDesignClick: () => void;
  onGetStarted: () => void;
  onDashboardClick: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  heroCards, featureItems, showcaseItems, howSteps, tabData,
  brandGreen: BRAND, brandAccent: ACCENT,
  onUploadClick, onRoomDesignClick, onGetStarted, onDashboardClick,
}) => {
  const heroRef = useRef<HTMLDivElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => setHeroVisible(entries[0].isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const scrollToIndex = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.children[i] as HTMLElement | undefined;
    if (card) el.scrollTo({ left: card.offsetLeft - 24, behavior: 'smooth' });
    setActiveSlide(i);
  };

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / showcaseItems.length;
    setActiveSlide(Math.max(0, Math.min(showcaseItems.length - 1, Math.round(el.scrollLeft / cardWidth))));
  };

  return (
    <div className="min-h-screen text-gray-900 antialiased bg-white flex flex-col">
      {/* HEADER */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/90 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-5 md:px-10 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={BRAND_LOGO_BASE64} alt="neevv" className="h-8" />
            <div className="h-6 w-px bg-gray-200 hidden sm:block" />
            <span className="text-xs tracking-wide uppercase hidden sm:inline" style={{ color: BRAND }}>
              Architecture • Structure • MEP • Interiors
            </span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-500">
              <a href="#showcase" className="hover:text-gray-900 transition-colors">Showcase</a>
              <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How it works</a>
              <a href="#deliverables" className="hover:text-gray-900 transition-colors">Deliverables</a>
            </nav>
            <button onClick={onDashboardClick} className="text-sm font-semibold px-4 py-2 rounded-lg border transition-all hover:-translate-y-0.5" style={{ borderColor: BRAND, color: BRAND, background: 'transparent' }}>
              My Projects
            </button>
            <button onClick={onGetStarted} className="text-sm font-semibold px-5 py-2 rounded-lg text-white shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5" style={{ backgroundColor: ACCENT }}>
              Start Designing — Free
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <section ref={heroRef} className="relative overflow-hidden pt-14 pb-14 md:pt-20 md:pb-16 bg-white">
          <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.04] blur-[100px]" style={{ backgroundColor: BRAND }} />
          <div className="absolute top-48 -left-40 w-[400px] h-[400px] rounded-full opacity-[0.03] blur-[100px]" style={{ backgroundColor: ACCENT }} />
          <div className="relative max-w-6xl mx-auto px-5 md:px-10">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <Reveal>
                <div className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-1.5 rounded-full mb-5 border" style={{ borderColor: `${BRAND}30`, color: BRAND, backgroundColor: `${BRAND}08` }}>
                  <Sparkles className="w-3.5 h-3.5" /> Architecture • Structure • MEP • Interiors
                </div>
              </Reveal>
              <Reveal delay={60}>
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.1] tracking-tight">
                  Your vision. Your home.<br className="hidden md:block" />
                  <span style={{ color: ACCENT }}> Designed by you</span>
                </h1>
              </Reveal>
              <Reveal delay={120}>
                <p className="mt-5 text-base md:text-lg text-gray-500 leading-relaxed max-w-xl mx-auto">
                  Enter your plot size. Choose your layout. Get 17+ execution-ready drawings, 3D renders, and cost estimates — all in minutes.
                </p>
              </Reveal>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {heroCards.map((c, i) => (
                <Reveal key={c.title} delay={200 + i * 80} className="h-full">
                  <button onClick={c.onClick} className="group w-full text-left rounded-2xl p-6 flex flex-col h-full bg-white border border-gray-200 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-gray-300">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${BRAND}12`, color: BRAND }}>{c.icon}</div>
                      <div>
                        <h3 className="text-base font-bold text-gray-900">{c.title}</h3>
                        <p className="text-xs text-gray-400">{c.subtitle}</p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed flex-1">{c.desc}</p>
                    <div className="mt-5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold group-hover:gap-3 transition-all" style={{ color: ACCENT }}>
                        Start Designing <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                      </span>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${BRAND}10`, color: BRAND }}>Free in beta</span>
                    </div>
                  </button>
                </Reveal>
              ))}
            </div>
            <Reveal delay={480}>
              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button onClick={onUploadClick} className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
                  <Upload className="w-4 h-4" /> Already have a drawing? Upload it here <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <span className="hidden sm:inline text-gray-300">|</span>
                <button onClick={onRoomDesignClick} className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
                  🎨 Design a single room <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FEATURES STRIP */}
        <section className="py-8 md:py-10 border-y border-gray-100 bg-white">
          <div className="max-w-6xl mx-auto px-5 md:px-10">
            <Reveal><h3 className="text-center text-sm font-bold uppercase tracking-widest mb-6" style={{ color: BRAND }}>Features</h3></Reveal>
            <div className="hidden md:flex justify-center gap-8">
              {featureItems.map((f, i) => (
                <Reveal key={f.label} delay={i * 50}>
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${BRAND}10`, color: BRAND }}>{f.icon}</div>
                    <div><div className="text-lg font-extrabold text-gray-900">{f.value}</div><div className="text-xs text-gray-500 mt-0.5">{f.label}</div></div>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="grid md:hidden grid-cols-2 gap-4">
              {featureItems.map((f, i) => (
                <Reveal key={f.label} delay={i * 50} className={i === featureItems.length - 1 ? 'col-span-2 flex justify-center' : ''}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${BRAND}10`, color: BRAND }}>{f.icon}</div>
                    <div><span className="text-base font-extrabold text-gray-900">{f.value}</span><span className="ml-1.5 text-[11px] text-gray-500">{f.label}</span></div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* TRUST BANNER */}
        <section className="py-10 md:py-12" style={{ backgroundColor: '#f9faf9' }}>
          <div className="max-w-5xl mx-auto px-5 md:px-10">
            <Reveal>
              <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
                <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${BRAND}, ${ACCENT})` }} />
                <div className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-10 bg-white">
                  <div className="flex items-center gap-5 flex-shrink-0">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center shadow-md" style={{ backgroundColor: BRAND }}>
                      <HardHat className="w-8 h-8 md:w-10 md:h-10 text-white" />
                    </div>
                    <div>
                      <div className="text-4xl md:text-5xl font-black text-gray-900 leading-none">25<span style={{ color: ACCENT }}>+</span></div>
                      <div className="text-sm font-bold uppercase tracking-wider text-gray-500 mt-1">Years of Trust</div>
                    </div>
                  </div>
                  <div className="hidden md:block w-px h-20 bg-gray-200" />
                  <div className="block md:hidden w-full h-px bg-gray-200" />
                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2">Built by industry veterans, not just engineers</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Our founders bring <strong>25+ years of hands-on experience in construction and building materials</strong>.
                      We&apos;ve been on construction sites, managed projects, sourced materials, and supervised contractors.
                      neevv isn&apos;t just another tech tool — it&apos;s built by people who understand what your contractor needs, because we&apos;ve stood where they stand.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-3">
                      {['Construction Management', 'Building Materials', 'Project Supervision', 'NBC Compliance'].map(tag => (
                        <span key={tag} className="text-[11px] font-semibold px-3 py-1 rounded-full border" style={{ borderColor: `${BRAND}30`, color: BRAND, backgroundColor: `${BRAND}06` }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* SHOWCASE */}
        <section id="showcase" className="py-14 md:py-18" style={{ backgroundColor: '#f5f5f5' }}>
          <div className="max-w-6xl mx-auto px-5 md:px-10">
            <Reveal>
              <div className="text-center mb-8">
                <h2 className="text-2xl md:text-4xl font-extrabold text-gray-900 tracking-tight">See what you can create</h2>
                <p className="mt-2 text-gray-500 text-sm md:text-base">Sample drawings from an actual 30×40 ft plot</p>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="relative">
                <div ref={scrollerRef} onScroll={handleScroll} className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {showcaseItems.map((item) => (
                    <div key={item.title} className="snap-center flex-shrink-0 w-[280px] md:w-[340px]">
                      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white aspect-[4/3] transition-all duration-300 hover:shadow-lg">
                        <img src={item.src} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                        <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 backdrop-blur-sm text-gray-600 border border-gray-200/50">{item.category}</span>
                      </div>
                      <p className="mt-2.5 text-center text-sm font-semibold text-gray-800">{item.title}</p>
                    </div>
                  ))}
                </div>
                <button aria-label="Previous" onClick={() => scrollToIndex(Math.max(0, activeSlide - 1))} className="hidden md:flex absolute -left-4 top-[40%] -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center hover:shadow-lg">
                  <ChevronLeft className="w-4 h-4" style={{ color: BRAND }} />
                </button>
                <button aria-label="Next" onClick={() => scrollToIndex(Math.min(showcaseItems.length - 1, activeSlide + 1))} className="hidden md:flex absolute -right-4 top-[40%] -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center hover:shadow-lg">
                  <ChevronRight className="w-4 h-4" style={{ color: BRAND }} />
                </button>
              </div>
            </Reveal>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {showcaseItems.map((item, i) => (
                <button key={item.title} aria-label={`Go to ${item.title}`} onClick={() => scrollToIndex(i)} className="h-2 rounded-full transition-all" style={{ width: activeSlide === i ? '20px' : '8px', backgroundColor: activeSlide === i ? BRAND : '#d1d5db' }} />
              ))}
            </div>
            <Reveal delay={120}><p className="mt-4 text-center text-[11px] text-gray-400">All drawings above are AI-generated samples • Actual project drawings include programmatic data overlays</p></Reveal>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-14 md:py-18 bg-white">
          <div className="max-w-5xl mx-auto px-5 md:px-10">
            <Reveal><div className="text-center mb-10"><h2 className="text-2xl md:text-4xl font-extrabold text-gray-900 tracking-tight">How it works</h2><p className="mt-2 text-gray-500 text-sm md:text-base">Four simple steps. That&apos;s it.</p></div></Reveal>
            <div className="hidden md:grid grid-cols-4 gap-3">
              {howSteps.map((s, i) => (
                <Reveal key={s.title} delay={i * 80}>
                  <div className="relative bg-[#f9faf9] rounded-2xl p-5 border border-gray-100 text-center h-full">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow" style={{ backgroundColor: ACCENT }}>{i + 1}</div>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mt-2 mb-3" style={{ backgroundColor: `${BRAND}12`, color: BRAND }}>{s.icon}</div>
                    <h3 className="text-sm font-bold text-gray-900 mb-1">{s.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="flex md:hidden flex-col gap-3">
              {howSteps.map((s, i) => (
                <Reveal key={s.title} delay={i * 60}>
                  <div className="flex items-start gap-4 bg-[#f9faf9] rounded-xl p-4 border border-gray-100">
                    <div className="relative flex-shrink-0">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BRAND}12`, color: BRAND }}>{s.icon}</div>
                      <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[10px] shadow" style={{ backgroundColor: ACCENT }}>{i + 1}</div>
                    </div>
                    <div><h3 className="text-sm font-bold text-gray-900 mb-0.5">{s.title}</h3><p className="text-xs text-gray-500 leading-relaxed">{s.desc}</p></div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={350}>
              <div className="mt-8 flex justify-center">
                <button onClick={onGetStarted} className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-lg text-white shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5" style={{ backgroundColor: BRAND }}>
                  Try It Now — Free <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </Reveal>
          </div>
        </section>

        {/* DELIVERABLES */}
        <section id="deliverables" className="py-14 md:py-18" style={{ backgroundColor: '#f5f5f5' }}>
          <div className="max-w-4xl mx-auto px-5 md:px-10">
            <Reveal><div className="text-center mb-8"><h2 className="text-2xl md:text-4xl font-extrabold text-gray-900 tracking-tight">Everything you need to start building</h2><p className="mt-2 text-gray-500 text-sm md:text-base">17+ coordinated drawings from one locked layout</p></div></Reveal>
            <Reveal delay={60}>
              <div className="flex justify-center gap-2 mb-6 overflow-x-auto">
                {tabData.map((tab, i) => (
                  <button key={tab.label} onClick={() => setActiveTab(i)} className="text-sm font-semibold px-4 py-2 rounded-full whitespace-nowrap transition-all" style={activeTab === i ? { backgroundColor: BRAND, color: '#fff' } : { backgroundColor: '#fff', color: BRAND, border: '1px solid #e5e7eb' }}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {tabData[activeTab].items.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl p-3.5 border border-gray-200 bg-white">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: BRAND }} />
                  <span className="text-sm font-medium text-gray-800">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHY TRUST */}
        <section className="py-14 md:py-18 bg-white">
          <div className="max-w-4xl mx-auto px-5 md:px-10">
            <Reveal><div className="text-center mb-10"><h2 className="text-2xl md:text-4xl font-extrabold text-gray-900 tracking-tight">Your designs, engineered to perfection</h2><p className="mt-2 text-gray-500 text-sm md:text-base">Every number is calculated, never guessed</p></div></Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {[
                { title: 'Engineered precision', desc: 'Programmatic overlays stamp all computed values — FSI, setbacks, areas. AI draws, code calculates.' },
                { title: 'NBC 2016 & IS standards', desc: 'Setbacks, coverage ratios, line weights, hatching — all built into every drawing automatically.' },
                { title: 'Locked layout consistency', desc: 'Pick one plan — all 17+ drawings, elevations, and BOQ follow it exactly. No drift.' },
              ].map((item, i) => (
                <Reveal key={item.title} delay={i * 80}>
                  <div className="rounded-xl p-5 border border-gray-200 bg-[#f9faf9] h-full">
                    <ShieldCheck className="w-5 h-5 mb-3" style={{ color: BRAND }} />
                    <h3 className="text-sm font-bold text-gray-900 mb-1.5">{item.title}</h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={280}>
              <div className="rounded-xl border-2 border-dashed p-4 text-center flex items-center justify-center gap-2 max-w-2xl mx-auto" style={{ borderColor: `${ACCENT}40` }}>
                <Clock className="w-4 h-4 flex-shrink-0" style={{ color: ACCENT }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: `${ACCENT}bb` }}>
                  Preliminary design — verify with licensed professional before execution
                </p>
              </div>
            </Reveal>
            <Reveal delay={350}>
              <div className="mt-8 flex flex-col items-center gap-3">
                <button onClick={onGetStarted} className="inline-flex items-center gap-2 text-sm font-bold px-7 py-3.5 rounded-lg shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 text-white" style={{ backgroundColor: ACCENT }}>
                  Design Your Dream Home — Free <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-xs text-gray-400">No signup • No commitment • Just start</p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="py-8 border-t border-gray-200 bg-[#f9faf9]">
        <div className="max-w-6xl mx-auto px-5 md:px-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={BRAND_LOGO_BASE64} alt="neevv" className="h-8" />
            <span className="text-xs text-gray-300">|</span>
            <span className="text-xs text-gray-400">Architecture • Structure • MEP • Interiors</span>
          </div>
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} neevv. All rights reserved.</p>
        </div>
      </footer>

      {/* STICKY MOBILE CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden transition-transform duration-300" style={{ transform: heroVisible ? 'translateY(100%)' : 'translateY(0)' }}>
        <div className="backdrop-blur-md bg-white/90 border-t border-gray-200 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <button onClick={onGetStarted} className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3 rounded-lg text-white shadow-sm" style={{ backgroundColor: ACCENT }}>
            Start Designing — Free <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
