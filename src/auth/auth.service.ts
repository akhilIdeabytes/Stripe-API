import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import { BootstrapDto } from './dto/bootstrap.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) throw new UnauthorizedException('Invalid email or password');

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: this.usersService.toPublic(user),
    };
  }

  async bootstrapStatus() {
    const count = await this.usersService.count();
    return { hasUsers: count > 0 };
  }

  // Creates the very first user (as admin) and logs them in. Only works
  // while the users table is empty - once any user exists this permanently
  // 403s, so it can never be used as a general signup endpoint.
  async bootstrap(dto: BootstrapDto) {
    const count = await this.usersService.count();
    if (count > 0) {
      throw new ForbiddenException('Setup has already been completed');
    }

    const user = await this.usersService.createUser(
      dto.email,
      dto.password,
      dto.name,
      UserRole.ADMIN,
    );

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { accessToken, user: this.usersService.toPublic(user) };
  }
}