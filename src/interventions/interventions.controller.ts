import {
  Body,
  Controller,
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { InterventionsService } from './interventions.service';
import { CompleteInterventionDto } from './dto/complete-intervention.dto';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { QueryInterventionsDto } from './dto/query-interventions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParseIdPipe } from '../common/pipes/parse-id.pipe';

interface AuthedRequest extends Request {
  user: { id: string; role: Role };
}

@ApiTags('interventions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('interventions')
export class InterventionsController {
  constructor(private interventionsService: InterventionsService) {}

  /** Planning is a manager action. */
  @Post()
  @Roles(Role.STOCK_MANAGER)
  create(@Body() dto: CreateInterventionDto) {
    return this.interventionsService.create(dto);
  }

  /**
   * Open to both roles: the service narrows a technician to their own rows,
   * so the controller does not need to branch.
   */
  @Get()
  @Roles(Role.STOCK_MANAGER, Role.TECHNICIAN)
  findAll(@Query() query: QueryInterventionsDto, @CurrentUser() user: AuthedRequest['user']) {
    return this.interventionsService.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.STOCK_MANAGER, Role.TECHNICIAN)
  findOne(@Param('id', ParseIdPipe) id: string, @CurrentUser() user: AuthedRequest['user']) {
    return this.interventionsService.findOne(id, user);
  }

  /** Cancellation is a manager action, and PLANNED -> CANCELLED only. */
  @Patch(':id/cancel')
  @Roles(Role.STOCK_MANAGER)
  cancel(@Param('id', ParseIdPipe) id: string) {
    return this.interventionsService.cancel(id);
  }

  /** Completion is done by the technician who owns the intervention. */
  @Post(':id/complete')
  @Roles(Role.TECHNICIAN)
  @HttpCode(HttpStatus.OK)
  complete(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: CompleteInterventionDto,
    @CurrentUser() user: AuthedRequest['user'],
  ) {
    return this.interventionsService.complete(id, dto.trackerId, user);
  }
}
