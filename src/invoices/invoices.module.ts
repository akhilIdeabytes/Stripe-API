import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice])],
  providers: [InvoicesService, StorageService],
  controllers: [InvoicesController],
  exports: [InvoicesService, StorageService],
})
export class InvoicesModule {}
