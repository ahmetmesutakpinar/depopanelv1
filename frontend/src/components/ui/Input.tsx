import { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Corporate Standard Input Component
 * 
 * Consistent input styling across the application with:
 * - Standardized sizes (sm, md, lg)
 * - Consistent spacing and border-radius
 * - Error and hint states
 * - Icon support
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, size = 'md', id, ...props }, ref) => {
    const inputId = id || props.name;

    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-4 text-base',
    };

    const baseStyles = cn(
      'w-full rounded-md border bg-white dark:bg-secondary-800',
      'placeholder:text-secondary-400 dark:placeholder:text-secondary-500',
      'text-secondary-900 dark:text-secondary-100',
      'focus:outline-none focus:ring-2 focus:ring-offset-0',
      'transition-all duration-200',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      sizes[size],
      leftIcon && 'pl-10',
      rightIcon && 'pr-10'
    );

    const stateStyles = error
      ? cn(
          'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500',
          'dark:border-danger-600 dark:focus:border-danger-500'
        )
      : cn(
          'border-secondary-200 dark:border-secondary-700',
          'focus:ring-primary-500/20 focus:border-primary-500',
          'dark:focus:border-primary-400'
        );

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'block mb-1.5 text-sm font-medium',
              'text-secondary-700 dark:text-secondary-300',
              error && 'text-danger-600 dark:text-danger-400'
            )}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 dark:text-secondary-500 pointer-events-none">
              {typeof leftIcon === 'string' ? (
                <span className="text-sm">{leftIcon}</span>
              ) : (
                <div className="w-5 h-5">{leftIcon}</div>
              )}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(baseStyles, stateStyles, className)}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary-400 dark:text-secondary-500 pointer-events-none">
              {typeof rightIcon === 'string' ? (
                <span className="text-sm">{rightIcon}</span>
              ) : (
                <div className="w-5 h-5">{rightIcon}</div>
              )}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-danger-600 dark:text-danger-400">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-secondary-500 dark:text-secondary-400">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
