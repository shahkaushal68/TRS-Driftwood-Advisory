import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, SessionUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/permission.decorator';
import { PermissionsGuard } from '../auth/permission.guard';
import { PaginationQueryDto } from '../libs/pagination';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: SessionUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    return this.usersService.updateProfile(user, dto, req.headers);
  }

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('user', 'list')
  listUsers(@CurrentUser() user: SessionUser, @Query() query: PaginationQueryDto) {
    return this.usersService.listUsers(user, query);
  }

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('user', 'read')
  getUserById(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.usersService.getUserById(id, user);
  }
}
