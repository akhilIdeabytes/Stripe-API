import { IsInt } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsInt()
  orderId: number;
}
