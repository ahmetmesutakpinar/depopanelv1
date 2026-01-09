/**
 * Corporate UI Design System
 * 
 * Centralized theme configuration for consistent design across the application.
 * All spacing, colors, fonts, and border-radius values are defined here.
 */

export const theme = {
  // ==================== SPACING ====================
  spacing: {
    xs: '0.5rem',    // 8px
    sm: '0.75rem',   // 12px
    md: '1rem',      // 16px
    lg: '1.5rem',    // 24px
    xl: '2rem',      // 32px
    '2xl': '3rem',   // 48px
    '3xl': '4rem',   // 64px
  },

  // ==================== BORDER RADIUS ====================
  borderRadius: {
    none: '0',
    sm: '0.375rem',   // 6px
    md: '0.5rem',     // 8px
    lg: '0.75rem',    // 12px
    xl: '1rem',       // 16px
    '2xl': '1.5rem',  // 24px
    full: '9999px',
  },

  // ==================== FONT SIZES ====================
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
  },

  // ==================== FONT WEIGHTS ====================
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  // ==================== LINE HEIGHTS ====================
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },

  // ==================== TRANSITION DURATIONS ====================
  transition: {
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
  },

  // ==================== Z-INDEX SCALE ====================
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },

  // ==================== SHADOWS ====================
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  },
} as const;

/**
 * Component-specific theme tokens
 */
export const componentTheme = {
  // Button
  button: {
    height: {
      sm: '2rem',     // 32px
      md: '2.5rem',   // 40px
      lg: '3rem',     // 48px
    },
    padding: {
      sm: '0.5rem 0.75rem',   // 8px 12px
      md: '0.625rem 1rem',    // 10px 16px
      lg: '0.75rem 1.5rem',   // 12px 24px
    },
    borderRadius: theme.borderRadius.lg, // 12px
    fontSize: {
      sm: theme.fontSize.xs,
      md: theme.fontSize.sm,
      lg: theme.fontSize.base,
    },
  },

  // Input
  input: {
    height: {
      sm: '2rem',     // 32px
      md: '2.5rem',   // 40px
      lg: '3rem',     // 48px
    },
    padding: {
      sm: '0.5rem 0.75rem',
      md: '0.75rem 1rem',
      lg: '0.875rem 1.25rem',
    },
    borderRadius: theme.borderRadius.lg, // 12px
    fontSize: theme.fontSize.sm, // 14px
  },

  // Card
  card: {
    borderRadius: theme.borderRadius['2xl'], // 24px
    padding: theme.spacing.lg, // 24px
    shadow: theme.shadows.lg,
  },

  // Table
  table: {
    cellPadding: {
      x: theme.spacing.md, // 16px
      y: theme.spacing.md, // 16px
    },
    borderRadius: theme.borderRadius.xl, // 16px
    headerFontSize: theme.fontSize.xs, // 12px
    bodyFontSize: theme.fontSize.sm, // 14px
  },

  // Select/Dropdown
  select: {
    borderRadius: theme.borderRadius.lg, // 12px
    minHeight: '2.5rem', // 40px
  },
} as const;

export type Theme = typeof theme;
export type ComponentTheme = typeof componentTheme;

