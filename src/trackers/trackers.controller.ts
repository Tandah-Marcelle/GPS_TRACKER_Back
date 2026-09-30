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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { TrackersService } from './trackers.service';
import { CreateTrackerDto } from './dto/create-tracker.dto';
import { UpdateTrackerDto } from './dto/update-tracker.dto';
import { UpdateTrackerStatusDto } from './dto/update-tracker-status.dto';
import { QueryTrackersDto } from './dto/query-trackers.dto';
import { AvailableTrackersDto } from './dto/available-trackers.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';

@ApiTags('trackers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trackers')
export class TrackersController {
  constructor(private trackersService: TrackersService) {}

  @Post()
  @Roles(Role.STOCK_MANAGER)
  create(@Body() dto: CreateTrackerDto, @CurrentUser() user: any) {
    return this.trackersService.create(dto, user.id);
  }

  /**
   * Declared before `:id` so the static path always wins over the parameter route.
   * Open to technicians: it is the pool they pick from when completing a job.
   */
  @Get('available')
  @Roles(Role.STOCK_MANAGER, Role.TECHNICIAN)
  findAvailable(@Query() query: AvailableTrackersDto) {
    return this.trackersService.findAvailable(query.search);
  }

  @Get()
  @Roles(Role.STOCK_MANAGER)
  findAll(@Query() query: QueryTrackersDto) {
    return this.trackersService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.STOCK_MANAGER)
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.trackersService.findOne(id);
  }

  @Get(':id/history')
  @Roles(Role.STOCK_MANAGER)
  history(@Param('id', ParseIdPipe) id: string) {
    return this.trackersService.history(id);
  }

  @Patch(':id')
  @Roles(Role.STOCK_MANAGER)
  update(@Param('id', ParseIdPipe) id: string, @Body() dto: UpdateTrackerDto) {
    return this.trackersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.STOCK_MANAGER)
  updateStatus(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateTrackerStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.trackersService.updateStatus(id, dto.status, dto.comment, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.STOCK_MANAGER)
  remove(@Param('id', ParseIdPipe) id: string) {
    return this.trackersService.remove(id);
  }
}

