import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class BanUserDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresIn?: number; // seconds until ban expires; omit for permanent ban
}
