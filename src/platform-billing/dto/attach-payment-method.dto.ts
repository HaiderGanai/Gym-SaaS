import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class AttachPaymentMethodDto {
  // a Stripe PaymentMethod id — in test mode e.g. 'pm_card_visa'
  @IsString()
  payment_method_id!: string;

  @IsBoolean()
  @IsOptional()
  set_default?: boolean;
}
