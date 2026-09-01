import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Public } from '../common/decorators/public.decorator';

const pkg = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf-8'),
);

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