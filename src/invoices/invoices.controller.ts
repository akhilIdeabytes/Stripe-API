import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { InvoicesService, MAX_INVOICE_BYTES } from './invoices.service';
import { StorageService } from './storage.service';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { resolveTenantId } from '../common/tenant.util';

@ApiTags('invoices')
@ApiBearerAuth('bearer')
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Uploads an invoice. Can be called before the payment exists - upload
   * first, then reference the returned id as `invoiceId` when creating
   * the payment. Keeping the upload separate means the JSON payment call
   * stays validated and safely retryable with an idempotency key.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        invoiceNumber: { type: 'string' },
        paymentId: { type: 'number' },
        externalUrl: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_INVOICE_BYTES } }),
  )
  async upload(
    @Body() dto: CreateInvoiceDto,
    @CurrentTenant() tenant: Tenant | undefined,
    @CurrentUser() user: User | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.invoices.create(resolveTenantId(tenant), dto, file, user?.id);
  }

  @Get()
  list(
    @CurrentTenant() tenant: Tenant | undefined,
    @Query('paymentId') paymentId?: string,
  ) {
    if (paymentId) return this.invoices.listForPayment(Number(paymentId));
    // Reading does not require a tenant - an admin with no platform
    // selected sees everything, the same as on Payments and Refunds.
    return this.invoices.list(tenant?.id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    return this.invoices.findById(id, tenant?.id);
  }

  /**
   * Streams the file through an authenticated route rather than serving
   * the upload directory statically, so tenant checks actually apply.
   */
  @Get(':id/download')
  async download(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
    @Res() res: Response,
  ) {
    const invoice = await this.invoices.findById(id, tenant?.id);

    if (!invoice.storageKey) {
      return res.status(404).json({
        statusCode: 404,
        message: invoice.externalUrl
          ? 'This invoice is a link, not a stored file.'
          : 'This invoice has no file attached.',
        externalUrl: invoice.externalUrl ?? undefined,
      });
    }

    const stream = this.storage.stream(invoice.storageKey);
    if (!stream) {
      return res
        .status(404)
        .json({ statusCode: 404, message: 'The stored file is missing from disk.' });
    }

    // Strip anything that could break out of the header value.
    const safeName = (invoice.originalFilename ?? 'invoice').replace(/[^\w.\-]/g, '_');
    res.setHeader('Content-Type', invoice.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    stream.pipe(res);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentTenant() tenant: Tenant | undefined,
  ) {
    await this.invoices.remove(id, tenant?.id);
    return { deleted: true };
  }
}
