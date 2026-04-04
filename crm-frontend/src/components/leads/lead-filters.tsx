"use client";

import { Search, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const OUTREACH_STAGES = {
  NOT_CONTACTED: "Neosloveno",
  DRAFT_READY: "Připraveno",
  CONTACTED: "Osloveno",
  RESPONDED: "Reagoval",
  WON: "Zájem",
  LOST: "Nezájem",
};

const PRIORITIES: Record<string, string> = {
  HIGH: "Vysoká",
  MEDIUM: "Střední",
  LOW: "Nízká",
};

const FOLLOWUP_OPTIONS: Record<string, string> = {
  ALL: "Vše",
  OVERDUE: "Po termínu",
  TODAY: "Dnes",
  THIS_WEEK: "Tento týden",
  NONE: "Bez follow-upu",
};

export interface FilterState {
  search: string;
  outreachStage: string;
  priority: string;
  hasFollowUp: string;
  sortBy: string;
  sortDir: "asc" | "desc";
}

interface LeadFiltersProps {
  filterState: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

const DEFAULT_FILTERS: FilterState = {
  search: "",
  outreachStage: "ALL",
  priority: "ALL",
  hasFollowUp: "ALL",
  sortBy: "rowNumber",
  sortDir: "asc",
};

export function LeadFilters({ filterState, onFilterChange }: LeadFiltersProps) {
  function update(patch: Partial<FilterState>) {
    onFilterChange({ ...filterState, ...patch });
  }

  function resetFilters() {
    onFilterChange(DEFAULT_FILTERS);
  }

  const hasActiveFilters =
    filterState.search !== "" ||
    filterState.outreachStage !== "ALL" ||
    filterState.priority !== "ALL" ||
    filterState.hasFollowUp !== "ALL";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <InputGroup className="w-64">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <Search className="size-4 text-muted-foreground" />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Hledat firmu, město, e-mail..."
          value={filterState.search}
          onChange={(e) => update({ search: e.target.value })}
        />
      </InputGroup>

      <Select
        value={filterState.outreachStage}
        onValueChange={(val) => val != null && update({ outreachStage: val })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Stav" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Všechny stavy</SelectItem>
          {Object.entries(OUTREACH_STAGES).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filterState.priority}
        onValueChange={(val) => val != null && update({ priority: val })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Priorita" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Všechny priority</SelectItem>
          {Object.entries(PRIORITIES).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filterState.hasFollowUp}
        onValueChange={(val) => val != null && update({ hasFollowUp: val })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Follow-up" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(FOLLOWUP_OPTIONS).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="size-3.5 mr-1" />
          Resetovat
        </Button>
      )}
    </div>
  );
}

export { DEFAULT_FILTERS };
