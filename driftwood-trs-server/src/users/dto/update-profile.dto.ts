import { IsEmail, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { IsStrongPassword } from '../../libs/password';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ValidateIf((o: UpdateProfileDto) => !!o.currentPassword)
  @IsStrongPassword()
  @IsString()
  @IsNotEmpty()
  newPassword?: string;
}
