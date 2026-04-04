"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STAGE_CONFIG: Record<string, { label: string; className: string }> = {
  NOT_CONTACTED: {
    label: "Neosloveno",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  DRAFT_READY: {
    label: "Připraveno",
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  CONTACTED: {
    label: "Osloveno",
    className:
      "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  RESPONDED: {
    label: "Reagoval",
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  WON: {
    label: "Zájem",
    className:
      "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  LOST: {
    label: "Nezájem",
    className: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
};

interface StatusBadgeProps {
  stage: string;
  className?: string;
}

export function StatusBadge({ stage, className }: StatusBadgeProps) {
  const config = STAGE_CONFIG[stage] ?? {
    label: stage,
    className: "bg-gray-100 text-gray-700",
  };

  return (
    <Badge variant="outline" className={cn("border-0", config.className, className)}>
      {config.label}
    </Badge>
  );
}
