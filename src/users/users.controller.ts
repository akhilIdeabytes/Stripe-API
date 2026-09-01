import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: User) {
    return this.usersService.toPublic(await this.usersService.findById(user.id));
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateUserDto) {
    const updated = await this.usersService.updateSelf(user.id, dto);
    return this.usersService.toPublic(updated);
  }

  @Get()
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map((u) => this.usersService.toPublic(u));
  }
}