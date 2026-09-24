import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AiProviderConfigurationsService } from './ai-provider-configurations.service';
import { CreateAiProviderConfigurationDto } from './dto/create-ai-provider-configuration.dto';
import { UpdateAiProviderConfigurationDto } from './dto/update-ai-provider-configuration.dto';

@Controller('admin/ai-provider-configurations')
@UseGuards(RolesGuard)
@Roles('admin')
export class AiProviderConfigurationsController {
  constructor(private readonly aiProviderConfigurationsService: AiProviderConfigurationsService) {}

  @Get()
  list() {
    return this.aiProviderConfigurationsService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAiProviderConfigurationDto, @CurrentUser() user: SessionUser) {
    return this.aiProviderConfigurationsService.create(dto, user.id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAiProviderConfigurationDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.aiProviderConfigurationsService.update(id, dto, user.id);
  }

  @Post(':id/test-connection')
  @HttpCode(HttpStatus.OK)
  testConnection(@Param('id') id: string) {
    return this.aiProviderConfigurationsService.testConnection(id);
  }
}
