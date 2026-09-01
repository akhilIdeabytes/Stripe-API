import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const config = app.get(ConfigService);

  // Several portals will call this, so accept a comma-separated allowlist
  // rather than the single FRONTEND_URL the console-only version assumed.
  const origins = (config.get<string>('CORS_ORIGINS') ?? config.get<string>('FRONTEND_URL') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Stripe API')
    .setDescription(
      'Stripe payment hub. Source platforms (insurance, DG) authenticate with X-API-Key ' +
        'and can charge, capture and refund; console users authenticate with a bearer JWT ' +
        'and pick a tenant with X-Tenant-Slug.',
    )
    .setVersion('1.0')
    // Almost every route is behind the global JwtAuthGuard, so the docs need
    // an Authorize button - without this, every "Try it out" returns 401.
    // Get a token from POST /auth/login (or /auth/bootstrap on a fresh DB).
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    // Source platforms authenticate with this instead of a JWT.
    .addApiKey(
      { type: 'apiKey', name: 'X-API-Key', in: 'header' },
      'api-key',
    )
    .addTag('auth')
    .addTag('users')
    .addTag('tenants')
    .addTag('customers')
    .addTag('payments')
    .addTag('invoices')
    .addTag('refunds')
    .addTag('payouts')
    .addTag('reports')
    .addTag('webhooks')
    .addTag('config')
    .addTag('version')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    // Keeps the entered token across page reloads.
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
}
bootstrap();