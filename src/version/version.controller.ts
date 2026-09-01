import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Public } from '../common/decorators/public.decorator';
import { ApiTags } from '@nestjs/swagger';

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
);

@ApiTags('version')
@Controller('version')
export class VersionController {
  @Public()
  @Get()
  getVersion() {
    return {
      version: pkg.version,
      buildTime: process.env.BUILD_TIME ?? null,
    };
  }
}