import { ReactNode } from 'react';
import { cn } from '@/utils';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'outlined' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

/**
 * Corporate Standard Card Component
 * 
 * Consistent card styling across the application with:
 * - Standardized border-radius (24px)
 * - Consistent spacing system
 * - Multiple variants (default, outlined, elevated)
 * - Dark mode support
 */
export function Card({ children, className, variant = 'default', padding = 'md' }: CardProps) {
  const variants = {
    default: cn(
      'bg-white dark:bg-secondary-900',
      'border border-secondary-100 dark:border-secondary-800',
      'shadow-sm'
    ),
    outlined: cn(
      'bg-white dark:bg-secondary-900',
      'border-2 border-secondary-200 dark:border-secondary-700',
      'shadow-none'
    ),
    elevated: cn(
      'bg-white dark:bg-secondary-900',
      'border border-secondary-100 dark:border-secondary-800',
      'shadow-lg hover:shadow-xl transition-shadow duration-200'
    ),
  };

  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden transition-colors duration-200',
        variants[variant],
        paddings[padding],
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'px-6 py-4 border-b border-secondary-100 dark:border-secondary-800',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className, padding = 'md' }: CardProps & { padding?: 'sm' | 'md' | 'lg' }) {
  const paddings = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div className={cn(paddings[padding], className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h3
      className={cn(
        'text-lg font-semibold',
        'text-secondary-900 dark:text-secondary-100',
        className
      )}
    >
      {children}
    </h3>
  );
}

export function CardDescription({ children, className }: CardProps) {
  return (
    <p
      className={cn(
        'text-sm',
        'text-secondary-500 dark:text-secondary-400',
        'mt-1',
        className
      )}
    >
      {children}
    </p>
  );
}

export function CardFooter({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'px-6 py-4 border-t border-secondary-100 dark:border-secondary-800',
        'bg-secondary-50 dark:bg-secondary-800/50',
        className
      )}
    >
      {children}
    </div>
  );
}
