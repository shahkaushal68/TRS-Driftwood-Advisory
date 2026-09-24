import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
] as const;

export class PresignUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @IsIn(ALLOWED_MIME_TYPES, {
    message: `contentType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`,
  })
  contentType!: string;
}
