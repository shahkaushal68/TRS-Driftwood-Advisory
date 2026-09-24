import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const VALID_DOMAINS = ['data_integrity_trust', 'governance_decision_rights'] as const;
const VALID_EVIDENCE_TYPES = ['required', 'optional', 'other'] as const;

export class ClassifyDocumentDto {
  @IsIn(VALID_DOMAINS)
  trsDomain!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  evidenceCategory!: string;

  @IsIn(VALID_EVIDENCE_TYPES)
  evidenceType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
