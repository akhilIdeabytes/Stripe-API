import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { BootstrapDto } from './dto/bootstrap.dto';
import { Public } from '../common/decorators/public.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @Get('bootstrap-status')
  bootstrapStatus() {
    return this.authService.bootstrapStatus();
  }

  @Public()
  @Post('bootstrap')
  @HttpCode(200)
  bootstrap(@Body() dto: BootstrapDto) {
    return this.authService.bootstrap(dto);
  }
}