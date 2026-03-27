import { Module } from '@nestjs/common';
import { VehicleController, HealthController } from './vehicle/vehicle.controller';
import { VehicleService } from './vehicle/vehicle.service';
import { PaymentController } from './payment/payment.controller';
import { PaymentService } from './payment/payment.service';

@Module({
  controllers: [
    VehicleController,
    PaymentController,
    HealthController,
  ],
  providers: [VehicleService, PaymentService],
})
export class AppModule {}