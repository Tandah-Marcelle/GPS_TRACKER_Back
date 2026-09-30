import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { mapPrismaError } from './prisma-exception.filter';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Prisma errors are translated first (P2002 -> 409, P2003 -> 409, P2025 -> 404).
    const prismaError = mapPrismaError(exception);
    const httpException = prismaError ?? (exception instanceof HttpException ? exception : null);

    if (httpException) {
      const status = httpException.getStatus();
      const exceptionResponse = httpException.getResponse() as any;
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : exceptionResponse.message || httpException.message;
      const error =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : exceptionResponse.error || httpException.name;

      return response.status(status).json({
        statusCode: status,
        message,
        error,
      });
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    return response.status(status).json({
      statusCode: status,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }
}
