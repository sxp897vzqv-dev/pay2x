import React from 'react';

/**
 * Base skeleton component
 */
export function Skeleton({ className = '', style = {} }) {
  return (
    <div 
      className={`bg-slate-200 animate-pulse rounded ${className}`}
      style={style}
    />
  );
}

/**
 * Card skeleton for list items
 */
export function CardSkeleton({ count = 1 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-slate-200" />
          <div className="p-3 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
              <Skeleton className="h-5 w-16 rounded-lg" />
            </div>
            {/* Content grid */}
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-8 flex-1 rounded-lg" />
              <Skeleton className="h-8 flex-1 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Table row skeleton
 */
export function TableRowSkeleton({ columns = 5, rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Stat card skeleton
 */
export function StatCardSkeleton({ count = 4 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-24 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </>
  );
}

/**
 * Stats strip skeleton (gradient header)
 */
export function StatsStripSkeleton() {
  return (
    <div className="bg-gradient-to-r from-slate-300 to-slate-400 rounded-xl p-4 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="h-3 w-16 bg-white/30 rounded mb-2" />
            <div className="h-7 w-24 bg-white/40 rounded mb-1" />
            <div className="h-3 w-12 bg-white/20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Filter pills skeleton
 */
export function FilterPillsSkeleton({ count = 4 }) {
  return (
    <div className="flex gap-2 overflow-x-auto px-1 py-1">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-24 rounded-lg flex-shrink-0" />
      ))}
    </div>
  );
}

/**
 * Full page skeleton for lists
 */
export function PageSkeleton() {
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div>
            <Skeleton className="h-6 w-32 mb-1" />
            <Skeleton className="h-4 w-24 hidden sm:block" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
      
      {/* Stats strip */}
      <StatsStripSkeleton />
      
      {/* Filter pills */}
      <FilterPillsSkeleton />
      
      {/* Search */}
      <Skeleton className="h-11 w-full rounded-xl" />
      
      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CardSkeleton count={6} />
      </div>
    </div>
  );
}

export default Skeleton;
