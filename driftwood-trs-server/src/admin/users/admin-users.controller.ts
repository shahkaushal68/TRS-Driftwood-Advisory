import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, SessionUser } from '../../auth/current-user.decorator';
import { RequirePermission } from '../../auth/permission.decorator';
import { PermissionsGuard } from '../../auth/permission.guard';
import { type PaginatedResponse, PaginationQueryDto } from '../../libs/pagination';
import { SafeUser } from '../../users/safe-user';
import { AdminUsersService } from './admin-users.service';
import { BanUserDto } from './dto/ban-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('admin/users')
@UseGuards(PermissionsGuard)
@RequirePermission('user', 'readAll')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('user', 'create')
  createUser(@Body() dto: CreateUserDto, @Req() req: Request): Promise<SafeUser> {
    return this.adminUsersService.createUser(dto, req.headers);
  }

  @Get()
  listUsers(@Query() query: PaginationQueryDto): Promise<PaginatedResponse<SafeUser>> {
    return this.adminUsersService.listUsers(query);
  }

  @Get(':id')
  getUser(@Param('id') id: string): Promise<SafeUser> {
    return this.adminUsersService.getUser(id);
  }

  @Patch(':id')
  @RequirePermission('user', 'update')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ): Promise<SafeUser> {
    return this.adminUsersService.updateUser(id, dto, req.headers);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('user', 'delete')
  deleteUser(@Param('id') id: string, @CurrentUser() currentUser: SessionUser): Promise<void> {
    return this.adminUsersService.deleteUser(id, currentUser);
  }

  @Post(':id/ban')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('user', 'ban')
  banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentUser() currentUser: SessionUser,
    @Req() req: Request,
  ): Promise<SafeUser> {
    return this.adminUsersService.banUser(id, dto, currentUser, req.headers);
  }

  @Post(':id/unban')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('user', 'ban')
  unbanUser(@Param('id') id: string, @Req() req: Request): Promise<SafeUser> {
    return this.adminUsersService.unbanUser(id, req.headers);
  }
}
