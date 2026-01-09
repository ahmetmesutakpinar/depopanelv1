import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Responsive Grid Utilities for WMS Layout
 * 
 * Provides consistent grid classes for modern warehouse management layouts
 */

/**
 * Grid container - responsive grid system
 */
export const gridContainer = cn(
  'grid',
  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  'gap-4 lg:gap-6'
);

/**
 * Grid item - spans full width
 */
export const gridItemFull = cn('col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4');

/**
 * Grid item - spans half width (2 columns)
 */
export const gridItemHalf = cn('col-span-1 sm:col-span-2 lg:col-span-2 xl:col-span-2');

/**
 * Grid item - spans one third (3 columns)
 */
export const gridItemThird = cn('col-span-1 sm:col-span-2 lg:col-span-3');

/**
 * Grid item - spans two thirds (2 columns on lg+)
 */
export const gridItemTwoThirds = cn('col-span-1 sm:col-span-2 lg:col-span-2 xl:col-span-3');

/**
 * Dashboard stats grid - optimized for stat cards
 */
export const statsGrid = cn(
  'grid',
  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  'gap-4 lg:gap-6'
);

/**
 * Dashboard charts grid - optimized for chart containers
 */
export const chartsGrid = cn(
  'grid',
  'grid-cols-1 lg:grid-cols-2',
  'gap-4 lg:gap-6'
);

/**
 * Form grid - optimized for form layouts
 */
export const formGrid = cn(
  'grid',
  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  'gap-4 lg:gap-6'
);

/**
 * Table grid - optimized for data tables
 */
export const tableGrid = cn(
  'grid',
  'grid-cols-1',
  'gap-4'
);

/**
 * Card grid - optimized for card layouts
 */
export const cardGrid = cn(
  'grid',
  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  'gap-4 lg:gap-6'
);

/**
 * Responsive spacing utilities
 */
export const spacing = {
  xs: 'gap-2',
  sm: 'gap-4',
  md: 'gap-6',
  lg: 'gap-8',
  xl: 'gap-12',
} as const;

/**
 * Create custom grid class
 */
export function createGrid(cols: {
  default?: number;
  sm?: number;
  lg?: number;
  xl?: number;
  gap?: keyof typeof spacing;
}): string {
  const classes: string[] = ['grid'];
  
  if (cols.default) {
    classes.push(`grid-cols-${cols.default}`);
  }
  if (cols.sm) {
    classes.push(`sm:grid-cols-${cols.sm}`);
  }
  if (cols.lg) {
    classes.push(`lg:grid-cols-${cols.lg}`);
  }
  if (cols.xl) {
    classes.push(`xl:grid-cols-${cols.xl}`);
  }
  if (cols.gap) {
    classes.push(spacing[cols.gap]);
  }
  
  return cn(...classes);
}

