import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionsGuard } from '../auth/permission.guard';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presign')
  @UseGuards(PermissionsGuard)
  @RequirePermission('document', 'upload')
  presign(
    @Body() dto: PresignUploadDto,
    @Query('folder') folder?: string,
  ): Promise<{ url: string; key: string }> {
    return this.uploadService.getPresignedUploadUrl(dto.fileName, dto.contentType, folder);
  }
}
