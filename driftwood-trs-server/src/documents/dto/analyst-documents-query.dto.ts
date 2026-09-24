import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../libs/pagination';

export class AnalystDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;
}
