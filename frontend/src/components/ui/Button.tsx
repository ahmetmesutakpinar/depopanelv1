import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * Corporate Standard Button Component
 * 
 * Consistent button styling across the application with:
 * - Standardized sizes (sm, md, lg)
 * - Consistent spacing and border-radius
 * - Loading states
 * - Icon support
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary: cn(
        'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
        'dark:bg-primary-700 dark:hover:bg-primary-600 dark:active:bg-primary-800',
        'focus:ring-primary-500/50',
        'shadow-md hover:shadow-lg shadow-primary-500/25'
      ),
      secondary: cn(
        'bg-secondary-100 text-secondary-700 hover:bg-secondary-200 active:bg-secondary-300',
        'dark:bg-secondary-800 dark:text-secondary-200 dark:hover:bg-secondary-700 dark:active:bg-secondary-600',
        'focus:ring-secondary-500/50'
      ),
      danger: cn(
        'bg-danger-600 text-white hover:bg-danger-700 active:bg-danger-800',
        'dark:bg-danger-700 dark:hover:bg-danger-600 dark:active:bg-danger-800',
        'focus:ring-danger-500/50',
        'shadow-md hover:shadow-lg shadow-danger-500/25'
      ),
      success: cn(
        'bg-success-600 text-white hover:bg-success-700 active:bg-success-800',
        'dark:bg-success-700 dark:hover:bg-success-600 dark:active:bg-success-800',
        'focus:ring-success-500/50',
        'shadow-md hover:shadow-lg shadow-success-500/25'
      ),
      ghost: cn(
        'bg-transparent text-secondary-600 hover:bg-secondary-100 active:bg-secondary-200',
        'dark:text-secondary-400 dark:hover:bg-secondary-800 dark:active:bg-secondary-700',
        'focus:ring-secondary-500/50'
      ),
      outline: cn(
        'bg-transparent border-2 text-primary-600 hover:bg-primary-50 active:bg-primary-100',
        'dark:text-primary-400 dark:border-primary-700 dark:hover:bg-primary-900/20 dark:active:bg-primary-900/30',
        'border-primary-600 focus:ring-primary-500/50'
      ),
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs rounded',
      md: 'h-10 px-4 text-sm rounded',
      lg: 'h-12 px-6 text-base rounded-md',
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          isLoading && 'cursor-wait',
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Yükleniyor...</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children && <span>{children}</span>}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
