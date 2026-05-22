'use client';

import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { ToastProvider } from './Toast';
import { Onboarding } from './Onboarding';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {children}
        <Onboarding />
      </ToastProvider>
    </ErrorBoundary>
  );
}
