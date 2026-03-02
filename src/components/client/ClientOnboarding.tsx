'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';

interface ClientOnboardingProps {
  userId: string;
  displayName: string;
  onComplete: () => void;
}

export default function ClientOnboarding({ userId, displayName, onComplete }: ClientOnboardingProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const handleComplete = async () => {
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ needs_onboarding: false })
      .eq('id', userId);
    setSaving(false);
    onComplete();
  };

  const steps = [
    {
      title: `Welcome, ${displayName || 'there'}!`,
      description: 'Your project dashboard is ready. Here is a quick overview of what you can do.',
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-electric/20 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
            <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </div>
      ),
    },
    {
      title: 'Your Project Board',
      description: 'Track all tasks and deliverables on your kanban board. Drag cards between columns to update their status.',
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
        </div>
      ),
    },
    {
      title: 'Submit Tickets',
      description: 'Need something? Submit a support ticket directly from your board. Your team will be notified immediately.',
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
      ),
    },
    {
      title: 'Settings & Security',
      description: 'Update your password and manage team contacts in Settings. We recommend changing your password now.',
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      ),
    },
  ];

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0f1225]">
      <div className="max-w-md w-full mx-4">
        <div className="bg-surface rounded-2xl p-8 text-center">
          {currentStep.icon}
          <h1 className="text-xl font-heading font-semibold text-white mb-3">
            {currentStep.title}
          </h1>
          <p className="text-sm text-muted leading-relaxed mb-8">
            {currentStep.description}
          </p>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-electric' : i < step ? 'bg-electric/40' : 'bg-white/10'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
              >
                Back
              </button>
            )}
            {isLastStep ? (
              <Button onClick={handleComplete} loading={saving}>
                Get Started
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
          </div>

          {/* Skip link */}
          {!isLastStep && (
            <button
              type="button"
              onClick={handleComplete}
              className="mt-4 text-xs text-muted/60 hover:text-muted transition-colors"
            >
              Skip introduction
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
