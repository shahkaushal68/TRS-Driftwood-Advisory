import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import MarkdownIt from 'markdown-it';
import puppeteer from 'puppeteer';

import {
  EXECUTIVE_REPORT_STATUS_LABELS,
  EXECUTIVE_REPORT_STATUSES,
} from './constants/executive-report-status';

/** Only what the PDF actually needs to render — never the full `ExecutiveReportRow` (no
 *  prompt ids, source review ids, provider/model, generation error, or any other internal
 *  field ever reaches this service, let alone the rendered document). */
export interface ExecutiveReportPdfInput {
  reportVersion: number;
  reportStatus: string;
  generatedReportMarkdown: string | null;
  publishedAt: Date | null;
}

// `html: false` is the important setting here — the Markdown source is AI-generated content
// this service doesn't control, so raw HTML/script embedded in it is rendered as literal
// text, never executed, when this gets loaded into a real headless Chromium page below.
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false });

/**
 * Renders a stored Executive Report (Markdown) into a branded PDF — Markdown -> HTML (via
 * `markdown-it`) -> PDF (via a headless Chromium page, so table/list/heading layout is
 * handled by a real rendering engine instead of hand-rolled PDF layout code). Does not call
 * OpenRouter, does not touch the AI review pipeline, and takes no dependency on any other
 * Executive Report internals — this is presentation only, over data the caller already
 * fetched and validated.
 */
@Injectable()
export class ExecutiveReportPdfService {
  private readonly logger = new Logger(ExecutiveReportPdfService.name);

  async renderExecutiveReportPdf(
    report: ExecutiveReportPdfInput,
    customerName: string,
  ): Promise<Buffer> {
    const html = this.buildHtml(report, customerName);

    let browser;
    try {
      browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      // No external resources are ever loaded (no remote images/fonts/scripts) — the
      // default 'load' wait is sufficient for a purely inline HTML/CSS document.
      await page.setContent(html);
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="width:100%;font-size:9px;color:#666;text-align:center;font-family:Helvetica,Arial,sans-serif;">' +
          'Driftwood Advisory Group | Transformation Readiness Standard&#8482; | ' +
          'Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      });
      return Buffer.from(pdf);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Executive Report PDF generation failed: ${message}`);
      throw new InternalServerErrorException('Failed to generate the Executive Report PDF');
    } finally {
      if (browser) await browser.close();
    }
  }

  private buildHtml(report: ExecutiveReportPdfInput, customerName: string): string {
    const isPublished = report.reportStatus === EXECUTIVE_REPORT_STATUSES.PUBLISHED;
    const statusLabel = EXECUTIVE_REPORT_STATUS_LABELS[report.reportStatus] ?? report.reportStatus;
    const contentHtml = report.generatedReportMarkdown
      ? markdown.render(report.generatedReportMarkdown)
      : '<p><em>No report content available.</em></p>';

    const publishedDateRow = report.publishedAt
      ? `<tr><th>Published Date</th><td>${escapeHtml(
          new Date(report.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        )}</td></tr>`
      : '';

    const statusBanner = isPublished
      ? '<div class="badge badge-published">Published Report</div>'
      : `<div class="badge badge-internal">${escapeHtml(statusLabel)}</div>` +
        '<div class="warning">NOT APPROVED FOR END USER DISTRIBUTION</div>';

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${CSS}</style>
</head>
<body>
${isPublished ? '' : '<div class="internal-watermark">INTERNAL</div>'}
<div class="header">
  <h1>TRS Master Transformation Readiness Report</h1>
  ${statusBanner}
  <table class="meta-table">
    <tr><th>Customer</th><td>${escapeHtml(customerName)}</td></tr>
    <tr><th>Report Version</th><td>v${String(report.reportVersion)}</td></tr>
    <tr><th>Report Status</th><td>${escapeHtml(statusLabel)}</td></tr>
    ${publishedDateRow}
  </table>
</div>
<hr />
<div class="content">${contentHtml}</div>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
  body { font-family: Helvetica, Arial, sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.5; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 11px; margin-bottom: 6px; }
  .badge-published { background: #dff5e1; color: #1e7a34; }
  .badge-internal { background: #fff3cd; color: #8a6100; }
  .warning { color: #b3261e; font-weight: bold; font-size: 11px; margin-bottom: 10px; }
  .meta-table { border-collapse: collapse; margin: 10px 0 16px; }
  .meta-table th { text-align: left; padding: 2px 12px 2px 0; color: #555; font-weight: 600; white-space: nowrap; }
  .meta-table td { padding: 2px 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 12px 0 20px; }
  .content h1, .content h2, .content h3 { page-break-after: avoid; margin-top: 18px; }
  .content table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  .content table, .content th, .content td { border: 1px solid #ccc; }
  .content th, .content td { padding: 6px 8px; text-align: left; font-size: 11px; }
  .content ul, .content ol { margin: 6px 0 6px 20px; }
  .internal-watermark {
    position: fixed; top: 40%; left: 0; width: 100%; text-align: center;
    font-size: 72px; color: rgba(200, 0, 0, 0.08); font-weight: bold; transform: rotate(-30deg);
    z-index: -1;
  }
`;
