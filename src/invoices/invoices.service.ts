import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { StorageService } from './storage.service';
import { CreateInvoiceDto } from './dto/invoice.dto';

export const MAX_INVOICE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_INVOICE_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    private readonly storage: StorageService,
  ) {}

  async create(
    tenantId: number,
    dto: CreateInvoiceDto,
    file?: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    uploadedByUserId?: number,
  ): Promise<Invoice> {
    if (!file && !dto.externalUrl) {
      throw new BadRequestException(
        'Provide either an invoice file or an externalUrl pointing at one.',
      );
    }

    let storageKey: string | undefined;
    if (file) {
      if (!ALLOWED_INVOICE_TYPES.includes(file.mimetype)) {
        throw new BadRequestException(
          `Unsupported file type '${file.mimetype}'. Allowed: ${ALLOWED_INVOICE_TYPES.join(', ')}`,
        );
      }
      if (file.size > MAX_INVOICE_BYTES) {
        throw new BadRequestException('Invoice file is larger than the 10 MB limit.');
      }
      storageKey = await this.storage.save(file.buffer, file.originalname);
    }

    const invoice = this.invoices.create({
      tenantId,
      paymentId: dto.paymentId,
      invoiceNumber: dto.invoiceNumber,
      externalUrl: dto.externalUrl,
      originalFilename: file?.originalname,
      mimeType: file?.mimetype,
      sizeBytes: file?.size ?? 0,
      storageKey,
      uploadedByUserId,
    });
    return this.invoices.save(invoice);
  }

  /** Always scoped by tenant - one platform must never read another's paperwork. */
  async findById(id: number, tenantId?: number): Promise<Invoice> {
    const invoice = await this.invoices.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (tenantId !== undefined && invoice.tenantId !== tenantId) {
      throw new ForbiddenException('That invoice belongs to another tenant');
    }
    return invoice;
  }

  listForPayment(paymentId: number) {
    return this.invoices.find({ where: { paymentId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Scoped to one tenant, or across all of them when a console admin has
   * not picked a platform. Mirrors how payments and refunds list.
   */
  list(tenantId?: number) {
    return this.invoices.find({
      where: tenantId !== undefined ? { tenantId } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /** Links an already-uploaded invoice to a payment. */
  async attachToPayment(invoiceId: number, paymentId: number, tenantId?: number) {
    const invoice = await this.findById(invoiceId, tenantId);
    invoice.paymentId = paymentId;
    return this.invoices.save(invoice);
  }

  async remove(id: number, tenantId?: number) {
    const invoice = await this.findById(id, tenantId);
    if (invoice.storageKey) await this.storage.remove(invoice.storageKey);
    await this.invoices.remove(invoice);
  }
}
