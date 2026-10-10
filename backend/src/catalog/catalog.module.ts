import { Controller, Get, Injectable, Module, NotFoundException, Param } from '@nestjs/common';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  tree(includeInactive = false) {
    const active = includeInactive ? {} : { active: true };
    return this.prisma.category.findMany({
      where: active,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        subCategories: {
          where: active,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: { services: { where: active, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
        },
      },
    });
  }

  async service(idOrSlug: string) {
    const s = await this.prisma.service.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], active: true },
      include: { subCategory: { include: { category: true } } },
    });
    if (!s) throw new NotFoundException('Service not found');
    return s;
  }
}

@Controller('catalog')
class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  tree() {
    return this.catalog.tree();
  }

  @Public()
  @Get('services/:id')
  service(@Param('id') id: string) {
    return this.catalog.service(id);
  }
}

@Module({ controllers: [CatalogController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}
