import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const colorVariants = {
  blue: {
    icon: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    value: "text-blue-700 dark:text-blue-300",
  },
  red: {
    icon: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
    value: "text-red-700 dark:text-red-300",
  },
  amber: {
    icon: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-300",
  },
  green: {
    icon: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400",
    value: "text-green-700 dark:text-green-300",
  },
  indigo: {
    icon: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400",
    value: "text-indigo-700 dark:text-indigo-300",
  },
  slate: {
    icon: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    value: "text-slate-700 dark:text-slate-300",
  },
} as const;

export type StatCardColor = keyof typeof colorVariants;

interface StatCardProps {
  title: string;
  value: number | undefined;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  color: StatCardColor;
  compact?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color,
  compact = false,
}: StatCardProps) {
  const variant = colorVariants[color];

  return (
    <Card size={compact ? "sm" : "default"}>
      <CardContent className="flex items-center gap-4">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg",
            compact ? "h-10 w-10" : "h-12 w-12",
            variant.icon
          )}
        >
          <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-muted-foreground">{title}</p>
          {value === undefined ? (
            <Skeleton className={cn(compact ? "mt-1 h-6 w-12" : "mt-1 h-8 w-16")} />
          ) : (
            <p
              className={cn(
                "font-semibold tracking-tight",
                compact ? "text-xl" : "text-2xl",
                variant.value
              )}
            >
              {value.toLocaleString("cs-CZ")}
            </p>
          )}
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          )}
          {trend && (
            <p
              className={cn(
                "mt-0.5 text-xs font-medium",
                trend.value >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}% {trend.label}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <Card size={compact ? "sm" : "default"}>
      <CardContent className="flex items-center gap-4">
        <Skeleton
          className={cn(
            "shrink-0 rounded-lg",
            compact ? "h-10 w-10" : "h-12 w-12"
          )}
        />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className={cn(compact ? "h-6 w-12" : "h-8 w-16")} />
        </div>
      </CardContent>
    </Card>
  );
}
