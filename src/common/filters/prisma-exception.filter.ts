import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception.code === 'P2002') {
      const target = (exception.meta as any)?.target;
      const message = target
        ? `Unique constraint failed on ${Array.isArray(target) ? target.join(', ') : target}`
        : 'Unique constraint failed';
      const conflict = new ConflictException(message);
      const status = conflict.getStatus();
      const body = conflict.getResponse() as any;
      return response.status(status).json({
        statusCode: status,
        message: body.message,
        error: 'Conflict',
      });
    }

    // fallback for other Prisma errors
    const status = 500;
    return response.status(status).json({
      statusCode: status,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }
}
