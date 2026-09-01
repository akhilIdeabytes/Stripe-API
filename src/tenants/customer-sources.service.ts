import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerSource } from './entities/customer-source.entity';
import {
  CreateCustomerSourceDto,
  UpdateCustomerSourceDto,
} from './dto/customer-source.dto';

@Injectable()
export class CustomerSourcesService {
  constructor(
    @InjectRepository(CustomerSource)
    private readonly sources: Repository<CustomerSource>,
  ) {}

  listForTenant(tenantId: number) {
    return this.sources.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async findById(id: number, tenantId?: number) {
    const source = await this.sources.findOne({ where: { id } });
    if (!source) throw new NotFoundException('Customer source not found');
    if (tenantId !== undefined && source.tenantId !== tenantId) {
      throw new ForbiddenException('That source belongs to another platform');
    }
    return source;
  }

  async create(tenantId: number, dto: CreateCustomerSourceDto) {
    const existing = await this.sources.findOne({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`This platform already has a source named '${dto.name}'`);
    }
    return this.sources.save(this.sources.create({ tenantId, ...dto }));
  }

  async update(id: number, dto: UpdateCustomerSourceDto, tenantId?: number) {
    const source = await this.findById(id, tenantId);
    if (dto.name !== undefined) source.name = dto.name;
    if (dto.url !== undefined) source.url = dto.url;
    if (dto.description !== undefined) source.description = dto.description;
    if (dto.active !== undefined) source.active = dto.active;
    // Blank means "keep the stored token" rather than "erase it".
    if (dto.token) source.token = dto.token;
    return this.sources.save(source);
  }

  async remove(id: number, tenantId?: number) {
    const source = await this.findById(id, tenantId);
    await this.sources.remove(source);
    return { deleted: true };
  }

  /** Never leaks the bearer token over the API. */
  toPublic(source: CustomerSource) {
    const { token, ...rest } = source;
    return { ...rest, hasToken: !!token };
  }
}
