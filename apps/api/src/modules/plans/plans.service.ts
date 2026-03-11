import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.plan.findMany({ orderBy: { price: 'asc' } });
  }

  async findByTier(tier: string) {
    return this.prisma.plan.findUnique({ where: { tier } });
  }
}
