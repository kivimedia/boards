'use client';

import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  handleCopy = () => {
    const { error } = this.state;
    if (!error) return;

    const text = `${error.name}: ${error.message}\n\n${error.stack || ''}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      const { error, copied } = this.state;

      return (
        <div className="min-h-screen bg-cream dark:bg-navy flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-white dark:bg-dark-surface rounded-2xl border-2 border-red-200 dark:border-red-900/50 p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div>
                <h2 className="text-navy dark:text-white font-heading font-bold text-lg">
                  Something went wrong
                </h2>
                <p className="text-navy/50 dark:text-slate-400 text-sm font-body">
                  {error.name}: {error.message}
                </p>
              </div>
            </div>

            {error.stack && (
              <pre className="bg-navy/5 dark:bg-slate-800 rounded-xl p-4 text-xs text-navy/70 dark:text-slate-300 font-mono overflow-x-auto max-h-48 overflow-y-auto mb-4 whitespace-pre-wrap break-words">
                {error.stack}
              </pre>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 rounded-xl bg-electric text-white font-body text-sm font-medium hover:bg-electric/90 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleCopy}
                className="px-4 py-2 rounded-xl bg-navy/10 dark:bg-slate-700 text-navy dark:text-slate-200 font-body text-sm font-medium hover:bg-navy/20 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Error
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
