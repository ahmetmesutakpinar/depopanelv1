import { Fragment, ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'fullscreen';
  closeOnBackdrop?: boolean;
  footer?: ReactNode;
}

/**
 * Corporate Standard Modal Component
 * 
 * Consistent modal styling across the application with:
 * - Standardized sizes (sm, md, lg, xl, 2xl)
 * - Consistent border-radius (24px)
 * - Dark mode support
 * - Keyboard support (ESC to close)
 * - Focus trap
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnBackdrop = true,
  footer,
}: ModalProps) {
  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden'; // Prevent body scroll

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    fullscreen: 'max-w-full w-full h-full max-h-full m-0 rounded-none',
  };

  return (
    <Fragment>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-[1050] animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Modal */}
      <div className={cn(
        'fixed inset-0 z-[1050] pointer-events-none',
        size === 'fullscreen' ? 'p-0' : 'flex items-center justify-center p-4'
      )}>
        <div
          className={cn(
            'bg-white dark:bg-secondary-900 rounded-2xl shadow-2xl w-full pointer-events-auto animate-slide-up',
            'border border-secondary-100 dark:border-secondary-800',
            size === 'fullscreen' ? 'h-full flex flex-col' : 'max-h-[90vh] flex flex-col',
            sizes[size]
          )}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          aria-describedby={description ? 'modal-description' : undefined}
        >
          {/* Header */}
          {(title || description) && (
            <div className="flex items-start justify-between px-6 py-4 border-b border-secondary-100 dark:border-secondary-800 flex-shrink-0">
              <div className="flex-1">
                {title && (
                  <h2
                    id="modal-title"
                    className="text-lg font-semibold text-secondary-900 dark:text-secondary-100"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id="modal-description"
                    className="mt-1 text-sm text-secondary-500 dark:text-secondary-400"
                  >
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="ml-4 p-2 text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300 hover:bg-secondary-100 dark:hover:bg-secondary-800 rounded-lg transition-colors"
                aria-label="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Body */}
          <div className="p-6 overflow-y-auto flex-1 scrollbar-thin">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-4 border-t border-secondary-100 dark:border-secondary-800 flex-shrink-0 bg-secondary-50 dark:bg-secondary-800/50 rounded-b-2xl">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Fragment>
  );
}
