import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../db';
import {
  EVIDENCE_CATEGORIES_BY_DOMAIN,
  REQUIRED_EVIDENCE_BY_DOMAIN,
} from '../documents/constants/evidence';
import { PROMPT_STATUSES } from './constants/prompt-status';
import { PROMPT_TYPES } from './constants/prompt-type';
import {
  AiPromptsRepository,
  type PromptTemplateRow,
  type PromptVersionRow,
} from './ai-prompts.repository';
import type { CreatePromptTemplateDto } from './dto/create-prompt-template.dto';
import type { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import type { ListPromptTemplatesQueryDto } from './dto/list-prompt-templates-query.dto';
import type { UpdatePromptTemplateDto } from './dto/update-prompt-template.dto';

export interface PromptTemplateWithActiveVersion extends PromptTemplateRow {
  activeVersion: PromptVersionRow | null;
}

export interface CategoryPromptEntry {
  trsDomainId: string;
  evidenceCategoryId: string;
  template: PromptTemplateWithActiveVersion | null;
}

export interface PromptTemplateDetail {
  template: PromptTemplateRow;
  versions: PromptVersionRow[];
}

export interface ActivePromptResult {
  template: PromptTemplateRow;
  activeVersion: PromptVersionRow;
}

@Injectable()
export class AiPromptsService {
  constructor(private readonly repository: AiPromptsRepository) {}

  async listTemplates(
    query: ListPromptTemplatesQueryDto,
  ): Promise<Record<string, CategoryPromptEntry[]>> {
    const templates = await this.repository.listTemplates({
      trsDomainId: query.trsDomainId,
      evidenceCategoryId: query.evidenceCategoryId,
    });

    const activeVersionIds = templates
      .map((template) => template.activeVersionId)
      .filter((id): id is string => id !== null);
    const activeVersions = await Promise.all(
      activeVersionIds.map((id) => this.repository.findVersionById(id)),
    );
    const activeVersionById = new Map(
      activeVersions
        .filter((version): version is PromptVersionRow => version !== null)
        .map((version) => [version.id, version]),
    );

    const templateByDomainCategory = new Map(
      templates.map((template) => [
        `${template.trsDomainId}::${template.evidenceCategoryId}`,
        template,
      ]),
    );

    const result: Record<string, CategoryPromptEntry[]> = {};
    for (const [domain, categories] of Object.entries(REQUIRED_EVIDENCE_BY_DOMAIN)) {
      if (query.trsDomainId && query.trsDomainId !== domain) continue;

      result[domain] = categories
        .filter((category) => !query.evidenceCategoryId || query.evidenceCategoryId === category)
        .map((category) => {
          const template = templateByDomainCategory.get(`${domain}::${category}`) ?? null;
          return {
            trsDomainId: domain,
            evidenceCategoryId: category,
            template: template
              ? {
                  ...template,
                  activeVersion: activeVersionById.get(template.activeVersionId ?? '') ?? null,
                }
              : null,
          };
        });
    }

    return result;
  }

  async getTemplateById(id: string): Promise<PromptTemplateDetail> {
    const template = await this.repository.findTemplateById(id);
    if (!template) {
      throw new NotFoundException(`Prompt template ${id} not found`);
    }

    const versions = await this.repository.findVersionsByTemplateId(id);
    return { template, versions };
  }

  async createTemplate(
    dto: CreatePromptTemplateDto,
    userId: string,
  ): Promise<PromptTemplateDetail> {
    const isMasterReportPrompt = dto.promptType === PROMPT_TYPES.MASTER_TRANSFORMATION_READINESS_REPORT;

    if (isMasterReportPrompt) {
      // The Master Report prompt is customer-level, not scoped to any one TRS domain /
      // evidence category — see the `promptTemplate` schema doc comment.
      if (dto.trsDomainId || dto.evidenceCategoryId) {
        throw new BadRequestException(
          'The Master Transformation Readiness Report prompt must not specify a TRS domain or evidence category',
        );
      }
      const existing = await this.repository.findTemplateByPromptType(dto.promptType);
      if (existing) {
        throw new ConflictException(
          'A Master Transformation Readiness Report prompt template already exists',
        );
      }
    } else {
      if (!dto.trsDomainId || !dto.evidenceCategoryId) {
        throw new BadRequestException(
          'trsDomainId and evidenceCategoryId are required for this prompt type',
        );
      }
      this.assertValidCategory(dto.trsDomainId, dto.evidenceCategoryId);

      const existing = await this.repository.findTemplateByDomainCategory(
        dto.trsDomainId,
        dto.evidenceCategoryId,
      );
      if (existing) {
        throw new ConflictException(
          `A prompt template already exists for ${dto.trsDomainId} / ${dto.evidenceCategoryId}`,
        );
      }
    }

    const now = new Date();
    return db.transaction(async (tx) => {
      const template = await this.repository.insertTemplate(
        {
          id: randomUUID(),
          promptName: dto.promptName,
          promptDescription: dto.promptDescription ?? null,
          trsDomainId: dto.trsDomainId ?? null,
          evidenceCategoryId: dto.evidenceCategoryId ?? null,
          promptType: dto.promptType,
          status: PROMPT_STATUSES.DRAFT,
          activeVersionId: null,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        },
        tx,
      );

      const versions: PromptVersionRow[] = [];
      if (dto.initialVersion) {
        const version = await this.repository.insertVersion(
          {
            id: randomUUID(),
            promptTemplateId: template.id,
            versionNumber: 1,
            versionLabel: dto.initialVersion.versionLabel ?? 'v1',
            promptContent: dto.initialVersion.promptContent,
            outputFormat: dto.initialVersion.outputFormat ?? 'markdown',
            status: PROMPT_STATUSES.DRAFT,
            isActive: false,
            changeSummary: dto.initialVersion.changeSummary ?? null,
            createdByUserId: userId,
            createdAt: now,
          },
          tx,
        );
        versions.push(version);
      }

      return { template, versions };
    });
  }

  async updateTemplate(
    id: string,
    dto: UpdatePromptTemplateDto,
    userId: string,
  ): Promise<PromptTemplateRow> {
    const existing = await this.repository.findTemplateById(id);
    if (!existing) {
      throw new NotFoundException(`Prompt template ${id} not found`);
    }

    return this.repository.updateTemplate(id, {
      ...(dto.promptName !== undefined ? { promptName: dto.promptName } : {}),
      ...(dto.promptDescription !== undefined ? { promptDescription: dto.promptDescription } : {}),
      ...(dto.promptType !== undefined ? { promptType: dto.promptType } : {}),
      updatedByUserId: userId,
      updatedAt: new Date(),
    });
  }

  async createVersion(
    templateId: string,
    dto: CreatePromptVersionDto,
    userId: string,
  ): Promise<PromptVersionRow> {
    return db.transaction(async (tx) => {
      const template = await this.repository.findTemplateById(templateId, tx);
      if (!template) {
        throw new NotFoundException(`Prompt template ${templateId} not found`);
      }

      const nextVersionNumber = (await this.repository.findMaxVersionNumber(templateId, tx)) + 1;

      return this.repository.insertVersion(
        {
          id: randomUUID(),
          promptTemplateId: templateId,
          versionNumber: nextVersionNumber,
          versionLabel: dto.versionLabel ?? `v${String(nextVersionNumber)}`,
          promptContent: dto.promptContent,
          outputFormat: dto.outputFormat ?? 'markdown',
          status: PROMPT_STATUSES.DRAFT,
          isActive: false,
          changeSummary: dto.changeSummary ?? null,
          createdByUserId: userId,
          createdAt: new Date(),
        },
        tx,
      );
    });
  }

  async activateVersion(
    templateId: string,
    versionId: string,
    userId: string,
  ): Promise<PromptTemplateDetail> {
    return db.transaction(async (tx) => {
      const template = await this.repository.findTemplateById(templateId, tx);
      if (!template) {
        throw new NotFoundException(`Prompt template ${templateId} not found`);
      }

      const version = await this.repository.findVersionById(versionId, tx);
      if (!version) {
        throw new NotFoundException(`Prompt version ${versionId} not found`);
      }
      if (version.promptTemplateId !== templateId) {
        throw new BadRequestException('Prompt version does not belong to this prompt template');
      }

      const now = new Date();
      await this.repository.deactivateOtherVersions(templateId, versionId, tx);
      await this.repository.updateVersion(
        versionId,
        {
          isActive: true,
          status: PROMPT_STATUSES.ACTIVE,
          activatedByUserId: userId,
          activatedAt: now,
        },
        tx,
      );
      await this.repository.updateTemplate(
        templateId,
        {
          activeVersionId: versionId,
          status: PROMPT_STATUSES.ACTIVE,
          updatedByUserId: userId,
          updatedAt: now,
        },
        tx,
      );

      const versions = await this.repository.findVersionsByTemplateId(templateId, tx);
      const updatedTemplate = await this.repository.findTemplateById(templateId, tx);
      if (!updatedTemplate) {
        throw new NotFoundException(`Prompt template ${templateId} not found`);
      }

      return { template: updatedTemplate, versions };
    });
  }

  async archiveTemplate(templateId: string, userId: string): Promise<PromptTemplateRow> {
    return db.transaction(async (tx) => {
      const template = await this.repository.findTemplateById(templateId, tx);
      if (!template) {
        throw new NotFoundException(`Prompt template ${templateId} not found`);
      }

      const now = new Date();
      if (template.activeVersionId) {
        await this.repository.updateVersion(
          template.activeVersionId,
          {
            isActive: false,
            status: PROMPT_STATUSES.ARCHIVED,
            archivedByUserId: userId,
            archivedAt: now,
          },
          tx,
        );
      }

      return this.repository.updateTemplate(
        templateId,
        {
          activeVersionId: null,
          status: PROMPT_STATUSES.ARCHIVED,
          updatedByUserId: userId,
          updatedAt: now,
        },
        tx,
      );
    });
  }

  async getVersion(templateId: string, versionId: string): Promise<PromptVersionRow> {
    const version = await this.repository.findVersionById(versionId);
    if (version?.promptTemplateId !== templateId) {
      throw new NotFoundException(
        `Prompt version ${versionId} not found for template ${templateId}`,
      );
    }
    return version;
  }

  async getActivePrompt(
    trsDomainId: string,
    evidenceCategoryId: string,
  ): Promise<ActivePromptResult> {
    const template = await this.repository.findTemplateByDomainCategory(
      trsDomainId,
      evidenceCategoryId,
    );
    if (!template || template.status === PROMPT_STATUSES.ARCHIVED || !template.activeVersionId) {
      throw new NotFoundException(
        `No active prompt found for ${trsDomainId} / ${evidenceCategoryId}`,
      );
    }

    const activeVersion = await this.repository.findVersionById(template.activeVersionId);
    if (!activeVersion) {
      throw new NotFoundException(
        `No active prompt found for ${trsDomainId} / ${evidenceCategoryId}`,
      );
    }

    return { template, activeVersion };
  }

  /**
   * The active Master Transformation Readiness Report prompt — the customer-level prompt
   * used by the Executive Report generation flow. Same active/archived/missing-version
   * checks as `getActivePrompt`, just keyed by `promptType` instead of a domain/category
   * pair since this template is never scoped to one.
   */
  /**
   * The Master Transformation Readiness Report template and its full version history, or
   * `null` if it has never been created — used by the admin UI to render "Not Created" vs
   * an editable detail view (same shape `getTemplateById` returns, just looked up by
   * `promptType` instead of an id, since this template has no id to look up by until it
   * exists). Deliberately does not throw when missing — this is a normal, expected state
   * for a fresh environment, not an error.
   */
  async getMasterReportPromptDetail(): Promise<PromptTemplateDetail | null> {
    const template = await this.repository.findTemplateByPromptType(
      PROMPT_TYPES.MASTER_TRANSFORMATION_READINESS_REPORT,
    );
    if (!template) return null;

    const versions = await this.repository.findVersionsByTemplateId(template.id);
    return { template, versions };
  }

  async getActiveMasterReportPrompt(): Promise<ActivePromptResult> {
    const template = await this.repository.findActiveTemplateByPromptType(
      PROMPT_TYPES.MASTER_TRANSFORMATION_READINESS_REPORT,
    );
    if (!template || template.status === PROMPT_STATUSES.ARCHIVED || !template.activeVersionId) {
      throw new NotFoundException('No active Master Transformation Readiness Report prompt found');
    }

    const activeVersion = await this.repository.findVersionById(template.activeVersionId);
    if (!activeVersion) {
      throw new NotFoundException('No active Master Transformation Readiness Report prompt found');
    }

    return { template, activeVersion };
  }

  private assertValidCategory(trsDomainId: string, evidenceCategoryId: string): void {
    const categories = EVIDENCE_CATEGORIES_BY_DOMAIN[trsDomainId] ?? [];
    if (!categories.includes(evidenceCategoryId)) {
      throw new BadRequestException(
        `"${evidenceCategoryId}" is not a valid evidence category for domain "${trsDomainId}"`,
      );
    }
  }
}
