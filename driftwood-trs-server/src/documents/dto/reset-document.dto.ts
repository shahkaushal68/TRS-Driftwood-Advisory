import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResetDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  resetReason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  requestedCorrection?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
