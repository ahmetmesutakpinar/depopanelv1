import { ReactNode } from 'react';
import { cn } from '@/utils';

interface TableProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'bordered' | 'striped';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Corporate Standard Table Component
 * 
 * Consistent table styling across the application with:
 * - Standardized spacing and border-radius
 * - Multiple variants (default, bordered, striped)
 * - Size options (sm, md, lg)
 * - Dark mode support
 */
export function Table({ children, className, variant = 'default', size = 'md' }: TableProps) {
  const variants = {
    default: 'border border-secondary-200 dark:border-secondary-800',
    bordered: 'border-2 border-secondary-300 dark:border-secondary-700',
    striped: 'border border-secondary-200 dark:border-secondary-800',
  };

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl',
        variants[variant],
        className
      )}
    >
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children, className }: TableProps) {
  return <thead className={className}>{children}</thead>;
}

export function TableBody({ children, className }: TableProps) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({ children, className }: TableProps) {
  return <tr className={className}>{children}</tr>;
}

interface TableCellProps extends TableProps {
  colSpan?: number;
  align?: 'left' | 'center' | 'right';
}

export function TableHeader({ children, className, colSpan, align = 'left' }: TableCellProps) {
  const alignments = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-semibold uppercase tracking-wider',
        'bg-secondary-50 dark:bg-secondary-800',
        'border-b border-secondary-200 dark:border-secondary-700',
        'text-secondary-500 dark:text-secondary-400',
        alignments[align],
        className
      )}
      colSpan={colSpan}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className, colSpan, align = 'left' }: TableCellProps) {
  const alignments = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <td
      className={cn(
        'px-4 py-3 border-b border-secondary-100 dark:border-secondary-800',
        'text-secondary-700 dark:text-secondary-300',
        alignments[align],
        className
      )}
      colSpan={colSpan}
    >
      {children}
    </td>
  );
}
