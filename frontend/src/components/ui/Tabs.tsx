import { ReactNode } from 'react';
import { cn } from '@/utils';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: number | string;
}

interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  tabs: Tab[];
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Corporate Standard Tabs Component
 * 
 * Consistent tab styling across the application with:
 * - Multiple variants (default, pills, underline)
 * - Standardized sizes (sm, md, lg)
 * - Icon and badge support
 * - Dark mode support
 */
export default function Tabs({
  value,
  onChange,
  tabs,
  variant = 'default',
  size = 'md',
  className,
}: TabsProps) {
  const sizes = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-3 text-sm',
    lg: 'px-6 py-4 text-base',
  };

  if (variant === 'pills') {
    return (
      <div className={cn('flex gap-2 flex-wrap', className)}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 font-medium rounded-lg transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/50',
              sizes[size],
              value === tab.id
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300 hover:bg-secondary-200 dark:hover:bg-secondary-700'
            )}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  value === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-secondary-200 dark:bg-secondary-700 text-secondary-700 dark:text-secondary-300'
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (variant === 'underline') {
    return (
      <div className={cn('border-b border-secondary-200 dark:border-secondary-800', className)}>
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                'flex items-center gap-2 font-medium transition-colors whitespace-nowrap border-b-2 -mb-px',
                'focus:outline-none focus:ring-2 focus:ring-primary-500/50 rounded-t-lg',
                sizes[size],
                value === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-200 hover:border-secondary-300 dark:hover:border-secondary-600'
              )}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    'px-2 py-0.5 text-xs font-medium rounded-full',
                    value === tab.id
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div className={cn('border-b border-secondary-200 dark:border-secondary-800', className)}>
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 font-medium transition-colors whitespace-nowrap border-b-2 -mb-px',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/50 rounded-t-lg',
              sizes[size],
              value === tab.id
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-secondary-200 hover:border-secondary-300 dark:hover:border-secondary-600'
            )}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  value === tab.id
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'bg-secondary-100 dark:bg-secondary-800 text-secondary-700 dark:text-secondary-300'
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
