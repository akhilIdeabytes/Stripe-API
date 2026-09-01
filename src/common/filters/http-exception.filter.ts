import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import Stripe from 'stripe';

/**
 * Global error handler so every failure - validation, not-found, or a raw
 * Stripe API error - comes back to the client in the same JSON shape:
 *   { statusCode, message, error? }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
      return;
    }

    if (exception instanceof Stripe.errors.StripeError) {
      // Map common Stripe error types to sensible HTTP statuses.
      const status =
        exception.type === 'StripeCardError' ||
        exception.type === 'StripeInvalidRequestError'
          ? HttpStatus.BAD_REQUEST
          : exception.type === 'StripeAuthenticationError'
            ? HttpStatus.UNAUTHORIZED
            : exception.type === 'StripeRateLimitError'
              ? HttpStatus.TOO_MANY_REQUESTS
              : HttpStatus.BAD_GATEWAY;

      this.logger.error(`Stripe error: ${exception.message}`);
      response.status(status).json({
        statusCode: status,
        message: exception.message,
        error: exception.type,
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
