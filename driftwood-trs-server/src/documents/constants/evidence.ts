export const TRS_DOMAINS = {
  DATA_INTEGRITY_TRUST: 'data_integrity_trust',
  GOVERNANCE_DECISION_RIGHTS: 'governance_decision_rights',
} as const;

export const TRS_DOMAIN_LABELS: Record<string, string> = {
  data_integrity_trust: 'Data Integrity & Trust',
  governance_decision_rights: 'Governance & Decision Rights',
};

export const DOCUMENT_STATUSES = {
  UPLOADED: 'uploaded',
  CLASSIFIED: 'classified',
  AI_REVIEW_IN_PROGRESS: 'ai_review_in_progress',
  AI_REVIEWED: 'ai_reviewed',
  ANALYST_REVIEWED: 'analyst_reviewed',
  PUBLISHED_TO_END_USER: 'published_to_end_user',
  INSUFFICIENT_EVIDENCE: 'insufficient_evidence',
  REJECTED_NOT_RELEVANT: 'rejected_not_relevant',
  AI_REVIEW_FAILED: 'ai_review_failed',
  RESET_REQUIRED: 'reset_required',
  RESUBMITTED: 'resubmitted',
} as const;

export const EVIDENCE_TYPES = {
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  OTHER: 'other',
} as const;

export const SUFFICIENCY_RATINGS = {
  STRONG: 'strong',
  PARTIAL: 'partial',
  INSUFFICIENT: 'insufficient',
  NOT_RELEVANT: 'not_relevant',
  NEEDS_HUMAN_FOLLOWUP: 'needs_human_followup',
} as const;

export const ANALYST_VALIDATION_STATUSES = {
  PENDING: 'pending',
  IN_REVIEW: 'in_review',
  VALIDATED: 'validated',
  REJECTED: 'rejected',
} as const;

export const MANUAL_REVIEW_SOURCES = {
  MANUAL: 'manual',
} as const;

export const MANUAL_REVIEW_STATUSES = {
  DRAFT: 'draft',
  COMPLETED: 'completed',
} as const;

export const REVIEWER_CONFIDENCE_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

/** Matches `AiRawOutput.topLevelAssessment.colorIndicator` so Manual Review and AI Review
 *  share the same color-indicator vocabulary. */
export const COLOR_INDICATORS = {
  GREEN: 'Green',
  YELLOW: 'Yellow',
  RED: 'Red',
} as const;

export const RECOMMENDED_ANALYST_ACTIONS = {
  ACCEPT: 'accept',
  EDIT: 'edit',
  ADD_FINDING: 'add_finding',
  REJECT: 'reject',
  REQUEST_EVIDENCE: 'request_evidence',
  MARK_INSUFFICIENT: 'mark_insufficient',
} as const;

export const DATA_INTEGRITY_CATEGORIES = [
  'System of Record Documentation',
  'Data Ownership / Stewardship',
  'Data Definitions / Data Dictionary',
  'Executive Reporting',
  'Report Lineage / Source Mapping',
  'Data Governance Policy',
  'Data Quality Monitoring',
  'Reconciliation Process',
  'Data Issue / Exception Log',
  'Audit Trail / Change History',
  'Analytical Model Inputs',
  'Access Control / Permissions',
  'Data Integration / Interface Documentation',
  'Other Data Evidence',
] as const;

export const GOVERNANCE_CATEGORIES = [
  'Governance Charter',
  'Decision Rights / RACI',
  'Steering Committee Materials',
  'Meeting Minutes',
  'Decision Log',
  'Escalation Process',
  'Transformation Roadmap / Program Charter',
  'Risk Register',
  'Change Control Process',
  'Cross-Functional Sponsorship',
  'Compliance / Legal Oversight',
  'Human Override / Exception Authority',
  'Version-Controlled Governance Documentation',
  'Governance Failure Review',
  'Other Governance Evidence',
] as const;

export const EVIDENCE_CATEGORIES_BY_DOMAIN: Record<string, readonly string[]> = {
  data_integrity_trust: DATA_INTEGRITY_CATEGORIES,
  governance_decision_rights: GOVERNANCE_CATEGORIES,
};

export const REQUIRED_EVIDENCE_BY_DOMAIN: Record<string, readonly string[]> = {
  data_integrity_trust: [
    'System of Record Documentation',
    'Data Ownership / Stewardship',
    'Data Definitions / Data Dictionary',
    'Executive Reporting',
    'Report Lineage / Source Mapping',
  ],
  governance_decision_rights: [
    'Governance Charter',
    'Decision Rights / RACI',
    'Steering Committee Materials',
    'Decision Log',
    'Escalation Process',
  ],
};

export const ALL_DOMAINS = Object.values(TRS_DOMAINS);
