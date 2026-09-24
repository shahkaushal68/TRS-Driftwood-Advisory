import {
  AI_REQUEST_STATUSES,
  ALL_AI_REQUEST_STATUSES,
  ALL_ANALYST_REVIEW_STATUSES,
  ANALYST_REVIEW_STATUSES,
} from './ai-review-status';

describe('ai-review-status constants', () => {
  it('exposes exactly the four AI request statuses the ticket asked for', () => {
    expect(ALL_AI_REQUEST_STATUSES.sort()).toEqual(
      ['processing', 'completed', 'failed', 'needs_retry'].sort(),
    );
  });

  it('exposes exactly the six analyst review statuses the ticket asked for', () => {
    expect(ALL_ANALYST_REVIEW_STATUSES.sort()).toEqual(
      [
        'ai_generated',
        'analyst_review_needed',
        'analyst_edited',
        'analyst_accepted',
        'analyst_rejected',
        'published_to_end_user',
      ].sort(),
    );
  });

  it('defaults a successful AI response to AI Generated', () => {
    expect(ANALYST_REVIEW_STATUSES.AI_GENERATED).toBe('ai_generated');
  });

  it('has a Processing status for a newly created AI request', () => {
    expect(AI_REQUEST_STATUSES.PROCESSING).toBe('processing');
  });
});
