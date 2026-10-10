import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/** Validates and strips request input. Unknown keys are dropped by the schemas (z.object strips by default). */
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        message: 'Some details are missing or invalid',
        issues: r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}

export const Z = <T>(schema: ZodSchema<T>) => new ZodPipe(schema);
