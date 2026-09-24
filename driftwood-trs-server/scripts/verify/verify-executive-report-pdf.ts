/**
 * Standalone verification for ExecutiveReportPdfService — NOT a Jest test.
 *
 * Jest can exercise the real PDF generation path fine (puppeteer's ESM entry is handled via
 * the `transformIgnorePatterns`/JS-transform addition in package.json's "jest" config), but
 * verifying the *rendered output* here uses `pdf-parse` to extract text back out of the PDF,
 * and `pdf-parse` bundles its own nested `pdfjs-dist` copy whose "legacy" build attempts a
 * dynamic `import()` for a worker fallback that Jest's module system can't satisfy without
 * `--experimental-vm-modules` — and turning that flag on breaks ts-jest's CJS-compiled output
 * elsewhere. That's a test-tooling limitation in a devDependency, not anything in production
 * code, so this runs as a plain script instead of fighting Jest's module system further.
 *
 * Run with:  npm run verify:executive-report-pdf
 */
import * as path from 'path';
import { pathToFileURL } from 'url';

import { PDFParse } from 'pdf-parse';

import { ExecutiveReportPdfService } from '../../src/executive-report/executive-report-pdf.service';

PDFParse.setWorker(
  pathToFileURL(
    path.join(
      __dirname,
      '..',
      '..',
      'node_modules',
      'pdf-parse',
      'dist',
      'pdf-parse',
      'cjs',
      'pdf.worker.mjs',
    ),
  ).href,
);

const SAMPLE_MARKDOWN = `# Executive Transformation Readiness Report

## Overall Readiness Narrative

This report evaluates the organization's transformation readiness across two domains.

### Key Strengths

- Strength one
- Strength two

### Domain Summary

| Domain | Status |
| --- | --- |
| Data Integrity & Trust | Green |
| Governance & Decision Rights | Yellow |
`;

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ ${message}`);
    failures += 1;
  }
}

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const service = new ExecutiveReportPdfService();

  console.log('Draft report:');
  const draftBuffer = await service.renderExecutiveReportPdf(
    {
      reportVersion: 1,
      reportStatus: 'draft',
      generatedReportMarkdown: SAMPLE_MARKDOWN,
      publishedAt: null,
    },
    'CallNest Inc',
  );
  assert(
    draftBuffer.subarray(0, 5).toString() === '%PDF-',
    'produces a real PDF file (starts with %PDF-)',
  );
  const draftText = await extractText(draftBuffer);
  assert(draftText.includes('TRS Master Transformation Readiness Report'), 'title appears');
  assert(draftText.includes('CallNest Inc'), 'customer name appears');
  assert(draftText.includes('v1'), 'report version appears');
  assert(draftText.includes('Draft / Internal Review Required'), 'draft status label appears');
  assert(draftText.includes('NOT APPROVED FOR END USER DISTRIBUTION'), 'draft warning appears');
  assert(!draftText.includes('Published Report'), 'draft is never labeled Published');
  const narrativeIdx = draftText.indexOf('Overall Readiness Narrative');
  const strengthsIdx = draftText.indexOf('Key Strengths');
  const domainIdx = draftText.indexOf('Domain Summary');
  assert(
    narrativeIdx > -1 && strengthsIdx > narrativeIdx && domainIdx > strengthsIdx,
    'headings render in original order',
  );
  assert(
    draftText.includes('Strength one') && draftText.includes('Strength two'),
    'list items render',
  );
  assert(
    draftText.includes('Data Integrity & Trust') &&
      draftText.includes('Governance & Decision Rights'),
    'table cells render',
  );
  assert(draftText.includes('Driftwood Advisory Group'), 'footer branding appears');
  assert(draftText.includes('Transformation Readiness Standard'), 'footer standard name appears');
  assert(/Page 1 of \d+/.test(draftText), 'footer page numbers appear');

  console.log('\nPublished report:');
  const publishedBuffer = await service.renderExecutiveReportPdf(
    {
      reportVersion: 2,
      reportStatus: 'published',
      generatedReportMarkdown: SAMPLE_MARKDOWN,
      publishedAt: new Date(2026, 0, 15),
    },
    'CallNest Inc',
  );
  const publishedText = await extractText(publishedBuffer);
  assert(publishedText.includes('Published Report'), 'published label appears');
  assert(publishedText.includes('Published Date'), 'published date row appears');
  assert(publishedText.includes('January 15, 2026'), 'published date value appears');
  assert(
    !publishedText.includes('NOT APPROVED FOR END USER DISTRIBUTION'),
    'no internal warning on a published PDF',
  );
  assert(
    !publishedText.includes('Draft / Internal Review Required'),
    'no draft label on a published PDF',
  );
  assert(
    !/prompt|openrouter|sourceReviewId|masterPromptId/i.test(publishedText),
    'no internal AI/prompt metadata leaks into the PDF',
  );

  console.log('\nApproved-but-unpublished report:');
  const approvedBuffer = await service.renderExecutiveReportPdf(
    {
      reportVersion: 1,
      reportStatus: 'approved',
      generatedReportMarkdown: SAMPLE_MARKDOWN,
      publishedAt: null,
    },
    'CallNest Inc',
  );
  const approvedText = await extractText(approvedBuffer);
  assert(approvedText.includes('Approved'), 'approved status label appears');
  assert(
    approvedText.includes('NOT APPROVED FOR END USER DISTRIBUTION'),
    'approved-but-unpublished still shows the internal warning',
  );
  assert(
    !approvedText.includes('Published Report'),
    'approved-but-unpublished is never labeled Published',
  );

  console.log(
    `\n${failures === 0 ? 'All checks passed.' : `${String(failures)} check(s) FAILED.`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('Verification script crashed:', error);
  process.exit(1);
});
