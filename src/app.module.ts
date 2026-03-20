import { Module } from '@nestjs/common';
import { VehicleController } from './vehicle/vehicle.controller';
import { VehicleService } from './vehicle/vehicle.service';
import { PaymentWebhookController } from './payment/payment.webhook';
import { PaymentController } from './payment/payment.controller';
import { PaymentService } from './payment/payment.service';

@Module({
  controllers: [
    VehicleController,
    PaymentController,
    PaymentWebhookController, // ✅ THIS WAS MISSING
  ],
  providers: [VehicleService, PaymentService],
})
export class AppModule {}