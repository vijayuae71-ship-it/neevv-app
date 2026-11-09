'use client';

import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { ToastProvider } from './Toast';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        {children}
      </ToastProvider>
    </ErrorBoundary>
  );
}
