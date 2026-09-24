import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * The only field an Admin/Analyst may edit on a draft Executive Report. Every
 * protected/system-owned field — id, customerId, assessmentId, reportVersion, reportStatus,
 * generatedAt, generatedByUserId, approvedByUserId, approvedAt, publishedByUserId,
 * publishedAt, masterPromptId, masterPromptVersionId, sourceReviewIds, lastUpdatedByUserId,
 * lastUpdatedAt, createdAt, updatedAt — is deliberately absent from this DTO, not merely
 * marked read-only, so the global `ValidationPipe({ whitelist: true, forbidNonWhitelisted:
 * true })` in `main.ts` rejects any request body that tries to set one (400 Bad Request)
 * rather than silently stripping or ignoring it. `updatedBy`/`updatedAt` are always sourced
 * from the authenticated session in `ExecutiveReportService.updateReport`, never from the
 * body.
 */
export class UpdateExecutiveReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200_000)
  generatedReportMarkdown!: string;
}
