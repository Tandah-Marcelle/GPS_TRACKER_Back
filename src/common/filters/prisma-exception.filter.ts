import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Maps the Prisma errors that are part of the API contract onto HTTP errors.
 * Returns null when the error is not one we translate.
 */
export function mapPrismaError(exception: unknown): HttpException | null {
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (exception.code) {
    // Unique constraint (IMEI, SIM, plate, username...).
    case 'P2002': {
      const target = (exception.meta as any)?.target;
      const fields = Array.isArray(target) ? target : target ? [target] : [];
      return new ConflictException(
        fields.length
          ? `A record with this ${fields.join(', ')} already exists`
          : 'Unique constraint failed',
      );
    }
    // Foreign key constraint: the row is referenced elsewhere.
    case 'P2003':
      return new ConflictException(
        'This record is referenced by other data and cannot be modified or deleted',
      );
    // Record used in a relation that requires it to exist.
    case 'P2025':
      return new NotFoundException('Record not found');
    default:
      return null;
  }
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const mapped = mapPrismaError(exception) ?? new ConflictException('Database error');
    const status = mapped.getStatus();
    const body = mapped.getResponse() as any;

    return response.status(status).json({
      statusCode: status,
      message: body.message,
      error: 'Conflict',
    });
  }
}
