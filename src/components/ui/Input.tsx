'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full px-3.5 py-2.5 rounded-xl
            bg-white border-2 border-navy/20
            text-navy placeholder:text-navy/40 placeholder:font-medium
            focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric
            dark:bg-dark-surface dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500
            transition-all duration-200
            font-body text-sm
            ${error ? 'border-danger focus:ring-danger/30 focus:border-danger' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-danger font-body">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
