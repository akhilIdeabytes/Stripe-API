import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.usersRepo.findOne({ where: { email } });
  }

  async findById(id: number) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  findAll() {
    return this.usersRepo.find({ order: { createdAt: 'ASC' } });
  }

  count() {
    return this.usersRepo.count();
  }

  async createUser(email: string, password: string, name?: string, role: UserRole = UserRole.STAFF) {
    const existing = await this.findByEmail(email);
    if (existing) throw new ConflictException('A user with that email already exists');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = this.usersRepo.create({ email, passwordHash, name, role });
    return this.usersRepo.save(user);
  }

  async updateSelf(id: number, dto: UpdateUserDto) {
    const user = await this.findById(id);

    if (dto.newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException('currentPassword is required to set a new password');
      }
      const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!matches) throw new BadRequestException('Current password is incorrect');
      user.passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.findByEmail(dto.email);
      if (existing) throw new ConflictException('A user with that email already exists');
      user.email = dto.email;
    }

    if (dto.name !== undefined) user.name = dto.name;

    return this.usersRepo.save(user);
  }

  // Strips passwordHash before returning a user over the API.
  toPublic(user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}