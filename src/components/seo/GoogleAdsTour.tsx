'use client';

import { useState, useEffect } from 'react';

interface TourStep {
  target: string;
  title: string;
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '#gads-tabs',
    title: 'Dashboard Panels',
    content: 'Navigate between four panels: Campaign overview, keyword intelligence, competitor ads, and SEO efficiency tracking.',
    placement: 'bottom',
  },
  {
    target: '#gads-campaigns',
    title: 'Campaign Overview',
    content: 'See your Google Ads campaigns with 30-day performance metrics. All data is read-only here - safe to explore.',
    placement: 'top',
  },
  {
    target: '#gads-keywords',
    title: 'Keyword Intelligence',
    content: 'Real search queries from your ads. Terms marked "No" for organic content are blog post opportunities. Click "Write Blog Post" to start an SEO pipeline run.',
    placement: 'top',
  },
  {
    target: '#gads-competitors',
    title: 'Competitor Ad Feed',
    content: 'See what your competitors are saying in their ads. Use this to differentiate your content strategy and identify messaging gaps.',
    placement: 'top',
  },
  {
    target: '#gads-efficiency',
    title: 'SEO vs Ads Efficiency',
    content: 'Track how organic content replaces paid ads over time. The monthly sync identifies keywords where your organic ranking is strong enough to reduce ad spend.',
    placement: 'top',
  },
];

interface Props {
  visitCount: number;
}

export default function GoogleAdsTour({ visitCount }: Props) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const toured = localStorage.getItem('gads_tour_completed');
    if (!toured && visitCount <= 1) {
      // Start tour on first visit after a short delay
      const timer = setTimeout(() => setCurrentStep(0), 1000);
      return () => clearTimeout(timer);
    }
  }, [visitCount]);

  if (dismissed || currentStep < 0 || currentStep >= TOUR_STEPS.length) return null;

  const step = TOUR_STEPS[currentStep];

  function handleNext() {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      // Scroll target into view
      const el = document.querySelector(TOUR_STEPS[currentStep + 1].target);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      handleDismiss();
    }
  }

  function handleDismiss() {
    setDismissed(true);
    setCurrentStep(-1);
    localStorage.setItem('gads_tour_completed', 'true');
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm">
      <div className="bg-gray-800 border border-blue-500 rounded-lg shadow-xl p-4">
        <div className="flex justify-between items-start mb-2">
          <h4 className="text-sm font-semibold text-blue-400">{step.title}</h4>
          <button onClick={handleDismiss} className="text-gray-500 hover:text-gray-300 text-xs">
            Skip tour
          </button>
        </div>
        <p className="text-gray-300 text-sm mb-3">{step.content}</p>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500">
            {currentStep + 1} of {TOUR_STEPS.length}
          </span>
          <button
            onClick={handleNext}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {currentStep < TOUR_STEPS.length - 1 ? 'Next' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
