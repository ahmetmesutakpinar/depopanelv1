import { forwardRef, SelectHTMLAttributes } from 'react';
import { cn } from '@/utils';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Corporate Standard Select Component
 * 
 * Consistent select/dropdown styling across the application with:
 * - Standardized sizes (sm, md, lg)
 * - Consistent spacing and border-radius
 * - Error and hint states
 * - Dark mode support
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, options, placeholder, size = 'md', id, ...props }, ref) => {
    const selectId = id || props.name;

    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-4 text-base',
    };

    const baseStyles = cn(
      'w-full rounded-md border appearance-none cursor-pointer',
      'bg-white dark:bg-secondary-800',
      'text-secondary-900 dark:text-secondary-100',
      'focus:outline-none focus:ring-2 focus:ring-offset-0',
      'transition-all duration-200',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      'pr-10',
      sizes[size]
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
            htmlFor={selectId}
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
          <select
            ref={ref}
            id={selectId}
            className={cn(baseStyles, stateStyles, className)}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400 dark:text-secondary-500 pointer-events-none" />
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

Select.displayName = 'Select';

export default Select;
