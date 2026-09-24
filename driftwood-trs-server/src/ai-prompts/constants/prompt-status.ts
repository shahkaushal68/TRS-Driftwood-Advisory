export const PROMPT_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
} as const;

export type PromptStatus = (typeof PROMPT_STATUSES)[keyof typeof PROMPT_STATUSES];

export const ALL_PROMPT_STATUSES = Object.values(PROMPT_STATUSES);
