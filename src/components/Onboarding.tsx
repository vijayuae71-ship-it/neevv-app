'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Sparkles, Ruler, Eye, Package } from 'lucide-react';

const ONBOARDING_KEY = 'neevv_onboarding_seen';

const STEPS = [
  {
    title: 'Welcome to neevv! 🏠',
    description: 'Design your dream home in 4 simple steps. Let\'s walk through what you\'ll get.',
    icon: <Sparkles size={24} className="text-blue-600" />,
  },
  {
    title: 'Step 1: Your Requirements',
    description: 'Enter plot size, facing direction, number of rooms, budget and style. We\'ll generate 3 unique layout options for you.',
    icon: <Ruler size={24} className="text-green-600" />,
  },
  {
    title: 'Step 2: 3D Views & Drawings',
    description: 'Get photorealistic 3D renders, 17 professional working drawings (excavation to waterproofing), and AI-enhanced versions.',
    icon: <Eye size={24} className="text-amber-600" />,
  },
  {
    title: 'Step 3: BOQ & Cost',
    description: 'Complete Bill of Quantities with material rates, labour costs, door/window schedules — ready for your contractor.',
    icon: <Package size={24} className="text-purple-600" />,
  },
];

export const Onboarding: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(ONBOARDING_KEY);
    if (!seen) {
      // Show after a short delay for better UX
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(ONBOARDING_KEY, 'true');
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleDismiss();
    }
  };

  if (!visible) return null;

  const step = STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleDismiss}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentStep ? 'bg-blue-600' : i < currentStep ? 'bg-blue-300' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center">
            {step.icon}
          </div>
        </div>

        {/* Content */}
        <div className="text-center space-y-2">
          <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button className="text-sm text-gray-400 hover:text-gray-600" onClick={handleDismiss}>
            Skip
          </button>
          <button className="btn btn-primary btn-sm gap-1" onClick={handleNext}>
            {currentStep < STEPS.length - 1 ? (
              <>Next <ArrowRight size={14} /></>
            ) : (
              'Get Started'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
