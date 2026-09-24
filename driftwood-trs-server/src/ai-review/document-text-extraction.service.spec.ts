import { DocumentTextExtractionService } from './document-text-extraction.service';

describe('DocumentTextExtractionService', () => {
  const service = new DocumentTextExtractionService();

  describe('isSupported', () => {
    it('supports text/plain, DOCX, and PDF', () => {
      expect(service.isSupported('text/plain')).toBe(true);
      expect(
        service.isSupported(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBe(true);
      expect(service.isSupported('application/pdf')).toBe(true);
    });

    it('does not support XLSX or other file types Document Intake otherwise accepts', () => {
      expect(
        service.isSupported('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      ).toBe(false);
      expect(service.isSupported('image/png')).toBe(false);
      expect(service.isSupported('application/octet-stream')).toBe(false);
    });
  });

  describe('extractFromBuffer', () => {
    it('decodes text/plain as UTF-8 directly', async () => {
      const result = await service.extractFromBuffer(
        'text/plain',
        Buffer.from('Evidence document body.', 'utf-8'),
      );

      expect(result).toEqual({ ok: true, text: 'Evidence document body.' });
    });

    // Real DOCX/PDF parsing itself (mammoth / pdf-parse against genuine files) is verified
    // manually against the compiled build rather than here — `pdf-parse`'s worker setup uses
    // a dynamic import that Jest's CJS transform can't run, so a real PDFParse call fails in
    // this test environment specifically (not in the actual app, built with `nest build` and
    // run under plain Node). These two cases stick to what Jest *can* verify honestly: a
    // garbage buffer never throws out of `extractFromBuffer` — it always resolves to a clean
    // `{ ok: false, reason }` the caller can surface to the Analyst.
    it('fails cleanly (never throws) when a DOCX buffer is garbage', async () => {
      const result = await service.extractFromBuffer(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        Buffer.from('not a real docx file', 'utf-8'),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Failed to extract text from the document');
      }
    });

    it('fails cleanly (never throws) when a PDF buffer is garbage', async () => {
      const result = await service.extractFromBuffer(
        'application/pdf',
        Buffer.from('not a real pdf file', 'utf-8'),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('Failed to extract text from the document');
      }
    });
  });
});
