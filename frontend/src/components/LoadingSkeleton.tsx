/**
 * Loading Skeleton Component
 * Reusable skeleton loader for tables, cards, and lists
 */

interface LoadingSkeletonProps {
  type?: 'table' | 'card' | 'list' | 'custom';
  rows?: number;
  columns?: number;
  className?: string;
}

export default function LoadingSkeleton({
  type = 'table',
  rows = 5,
  columns = 6,
  className = '',
}: LoadingSkeletonProps) {
  if (type === 'table') {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="space-y-3">
          {/* Table header skeleton */}
          <div className="flex gap-4 pb-3 border-b border-secondary-200">
            {Array.from({ length: columns }).map((_, i) => (
              <div
                key={i}
                className="h-4 bg-secondary-200 rounded flex-1"
                style={{ maxWidth: `${100 / columns}%` }}
              />
            ))}
          </div>
          {/* Table rows skeleton */}
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex gap-4 py-3">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <div
                  key={colIndex}
                  className="h-4 bg-secondary-100 rounded flex-1"
                  style={{ maxWidth: `${100 / columns}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className={`animate-pulse space-y-4 ${className}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg p-4 border border-secondary-200">
            <div className="h-4 bg-secondary-200 rounded w-3/4 mb-3" />
            <div className="h-3 bg-secondary-100 rounded w-full mb-2" />
            <div className="h-3 bg-secondary-100 rounded w-5/6" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className={`animate-pulse space-y-3 ${className}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-secondary-200 rounded w-3/4" />
              <div className="h-3 bg-secondary-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Custom - simple spinner
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}

/**
 * Table Skeleton - Pre-configured for tables
 */
export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return <LoadingSkeleton type="table" rows={rows} columns={columns} />;
}

/**
 * Card Skeleton - Pre-configured for cards
 */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return <LoadingSkeleton type="card" rows={count} />;
}

/**
 * List Skeleton - Pre-configured for lists
 */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return <LoadingSkeleton type="list" rows={count} />;
}

