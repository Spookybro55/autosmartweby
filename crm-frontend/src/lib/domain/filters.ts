import type { OutreachStageKey, PriorityKey } from '@/lib/config';

export interface FilterState {
  search: string;
  outreachStage: OutreachStageKey | 'ALL';
  priority: PriorityKey | 'ALL';
  hasFollowUp: 'ALL' | 'OVERDUE' | 'TODAY' | 'THIS_WEEK' | 'NONE';
  sortBy: SortField;
  sortDir: 'asc' | 'desc';
}

export type SortField =
  | 'businessName'
  | 'contactPriority'
  | 'outreachStage'
  | 'lastContactAt'
  | 'nextFollowupAt'
  | 'city';

export const DEFAULT_FILTERS: FilterState = {
  search: '',
  outreachStage: 'ALL',
  priority: 'ALL',
  hasFollowUp: 'ALL',
  sortBy: 'contactPriority',
  sortDir: 'asc',
};
