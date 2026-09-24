import { EXECUTIVE_REPORT_STATUSES } from './constants/executive-report-status';

/** Strips anything that isn't safe in a downloaded filename — no path separators, no
 *  control characters, no path-traversal sequences. Collapses everything unsafe to a
 *  single underscore so the result is always a plain, predictable filename segment. */
function sanitizeForFilename(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned.length > 0 ? cleaned : 'Customer';
}

/**
 * Matches the ticket's exact examples:
 *   CallNest_TRS_MasterTransformationReadinessReport_v1_Published.pdf
 *   CallNest_TRS_MasterTransformationReadinessReport_v1_Draft_Internal.pdf
 * Any non-`published` status (draft, approved, ...) gets the `Draft_Internal` suffix —
 * this filename is only ever built for Admin/Analyst downloads or a genuinely published
 * End User download (the caller decides which; this function just labels what it's given).
 */
export function buildExecutiveReportPdfFilename(
  customerName: string,
  reportVersion: number,
  reportStatus: string,
): string {
  const namePart = sanitizeForFilename(customerName);
  const statusPart =
    reportStatus === EXECUTIVE_REPORT_STATUSES.PUBLISHED ? 'Published' : 'Draft_Internal';
  return `${namePart}_TRS_MasterTransformationReadinessReport_v${String(reportVersion)}_${statusPart}.pdf`;
}
