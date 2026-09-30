import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Tracker ids are Prisma cuids (e.g. "cmuo2ttqi0000..."), not UUIDs, so
 * ParseUUIDPipe cannot be used. This only rejects obviously malformed input
 * and lets the service layer own the real 404.
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(value)) {
      throw new BadRequestException('Invalid id');
    }
    return value;
  }
}
