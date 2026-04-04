"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  HIGH: {
    label: "Vysoká",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  MEDIUM: {
    label: "Střední",
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  LOW: {
    label: "Nízká",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
};

interface PriorityBadgeProps {
  priority: "HIGH" | "MEDIUM" | "LOW";
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.LOW;

  return (
    <Badge variant="outline" className={cn("border-0", config.className, className)}>
      {config.label}
    </Badge>
  );
}
