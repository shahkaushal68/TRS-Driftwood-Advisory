import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AiPromptsService } from './ai-prompts.service';
import { CreatePromptTemplateDto } from './dto/create-prompt-template.dto';
import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import { GetActivePromptQueryDto } from './dto/get-active-prompt-query.dto';
import { ListPromptTemplatesQueryDto } from './dto/list-prompt-templates-query.dto';
import { UpdatePromptTemplateDto } from './dto/update-prompt-template.dto';

// Class-level @Roles('admin') gates every write route. Read routes below relax this to
// also allow 'analyst' — RolesGuard uses Reflector#getAllAndOverride, so a handler-level
// @Roles() wins over the class-level one.
@Controller('admin/ai-prompts')
@UseGuards(RolesGuard)
@Roles('admin')
export class AiPromptsController {
  constructor(private readonly aiPromptsService: AiPromptsService) {}

  @Get()
  @Roles('admin', 'analyst')
  listTemplates(@Query() query: ListPromptTemplatesQueryDto) {
    return this.aiPromptsService.listTemplates(query);
  }

  // Declared before ':promptTemplateId' so the literal 'active' segment matches first.
  @Get('active')
  @Roles('admin', 'analyst')
  getActivePrompt(@Query() query: GetActivePromptQueryDto) {
    return this.aiPromptsService.getActivePrompt(query.trsDomainId, query.evidenceCategoryId);
  }

  // Declared before ':promptTemplateId' for the same reason as 'active' above. Wrapped in
  // `{ detail }` rather than returned bare — Nest sends a completely empty response body
  // (not the JSON text "null") for a controller handler that resolves to `null`, which a
  // JSON client can't distinguish from "no body at all". Wrapping in an object guarantees a
  // real, always-parseable JSON body even when there's nothing to report — same reasoning
  // as `getLatestReport` below.
  @Get('master-report')
  @Roles('admin', 'analyst')
  async getMasterReportPrompt() {
    const detail = await this.aiPromptsService.getMasterReportPromptDetail();
    return { detail };
  }

  @Get(':promptTemplateId')
  @Roles('admin', 'analyst')
  getTemplateById(@Param('promptTemplateId') promptTemplateId: string) {
    return this.aiPromptsService.getTemplateById(promptTemplateId);
  }

  @Get(':promptTemplateId/versions/:promptVersionId')
  @Roles('admin', 'analyst')
  getVersion(
    @Param('promptTemplateId') promptTemplateId: string,
    @Param('promptVersionId') promptVersionId: string,
  ) {
    return this.aiPromptsService.getVersion(promptTemplateId, promptVersionId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createTemplate(@Body() dto: CreatePromptTemplateDto, @CurrentUser() user: SessionUser) {
    return this.aiPromptsService.createTemplate(dto, user.id);
  }

  @Put(':promptTemplateId')
  updateTemplate(
    @Param('promptTemplateId') promptTemplateId: string,
    @Body() dto: UpdatePromptTemplateDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.aiPromptsService.updateTemplate(promptTemplateId, dto, user.id);
  }

  @Post(':promptTemplateId/versions')
  @HttpCode(HttpStatus.CREATED)
  createVersion(
    @Param('promptTemplateId') promptTemplateId: string,
    @Body() dto: CreatePromptVersionDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.aiPromptsService.createVersion(promptTemplateId, dto, user.id);
  }

  @Patch(':promptTemplateId/versions/:promptVersionId/activate')
  activateVersion(
    @Param('promptTemplateId') promptTemplateId: string,
    @Param('promptVersionId') promptVersionId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.aiPromptsService.activateVersion(promptTemplateId, promptVersionId, user.id);
  }

  @Patch(':promptTemplateId/archive')
  archiveTemplate(
    @Param('promptTemplateId') promptTemplateId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.aiPromptsService.archiveTemplate(promptTemplateId, user.id);
  }
}
