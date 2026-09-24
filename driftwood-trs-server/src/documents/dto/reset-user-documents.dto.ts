import { IsNotEmpty, IsString } from 'class-validator';

export class ResetUserDocumentsDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
