import { Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export type ExtractedTextResult = { ok: true; text: string } | { ok: false; reason: string };

const PLAIN_TEXT_TYPE = 'text/plain';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PDF_TYPE = 'application/pdf';

const SUPPORTED_FILE_TYPES = new Set([PLAIN_TEXT_TYPE, DOCX_TYPE, PDF_TYPE]);

/**
 * Extracts plain text from a document's raw bytes so AI Review has something to send to the
 * AI provider. Document Intake accepts PDF/DOCX/XLSX/TXT, but only `text/plain`, `.docx`,
 * and `.pdf` have a text-extraction path here — XLSX is intentionally not supported yet
 * (no spreadsheet-to-text convention has been decided). Anything unsupported fails cleanly
 * via `isSupported` before any bytes are read, rather than guessing.
 */
@Injectable()
export class DocumentTextExtractionService {
  private readonly logger = new Logger(DocumentTextExtractionService.name);

  isSupported(fileType: string): boolean {
    return SUPPORTED_FILE_TYPES.has(fileType);
  }

  async extractFromBuffer(fileType: string, buffer: Buffer): Promise<ExtractedTextResult> {
    try {
      if (fileType === DOCX_TYPE) {
        const result = await mammoth.extractRawText({ buffer });
        return { ok: true, text: result.value };
      }

      if (fileType === PDF_TYPE) {
        const parser = new PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          return { ok: true, text: result.text };
        } finally {
          await parser.destroy();
        }
      }

      // `text/plain` (the only other supported type) — decode as UTF-8 directly.
      return { ok: true, text: buffer.toString('utf-8') };
    } catch (error) {
      // Malformed/corrupt/password-protected files land here — logged with just the message,
      // same convention as every other failure path in this feature (never log a raw
      // error/SDK object verbatim).
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to extract text from a "${fileType}" document: ${message}`);
      return { ok: false, reason: `Failed to extract text from the document: ${message}` };
    }
  }
}
