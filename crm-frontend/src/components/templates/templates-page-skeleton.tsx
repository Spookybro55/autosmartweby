import { Skeleton } from '@/components/ui/skeleton';

export function TemplatesPageSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="mb-2 h-4 w-3/4" />
          <Skeleton className="mb-3 h-3 w-full" />
          <Skeleton className="mb-3 h-3 w-5/6" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
