import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { GymService } from './gym.service';
import { CreateGymDto } from './dto/create-gym.dto';
import { UpdateGymDto } from './dto/update-gym.dto';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRole } from '../staff/entities/staff-user.entity';
import type { StaffJwtPayload } from '../common/interfaces/jwt-payload.interface';

@UseGuards(StaffJwtGuard, RolesGuard)
@Controller('gyms')
export class GymController {
  constructor(private gymService: GymService) {}

  @Post()
  @Roles(StaffRole.ORG_ADMIN)
  create(@Body() dto: CreateGymDto, @CurrentUser() user: StaffJwtPayload) {
    return this.gymService.create(dto, user);
  }

  // no @Roles — all authenticated staff can list (service scopes the result)
  @Get()
  findAll(@CurrentUser() user: StaffJwtPayload) {
    return this.gymService.findAll(user);
  }

  // no @Roles — all authenticated staff can read (service checks access)
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.gymService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(StaffRole.ORG_ADMIN, StaffRole.GYM_MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGymDto,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.gymService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(StaffRole.ORG_ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: StaffJwtPayload,
  ) {
    return this.gymService.remove(id, user);
  }
}
