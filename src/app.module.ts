import { Module } from '@nestjs/common';
import { VehicleController, HealthController } from './vehicle/vehicle.controller';
import { VehicleService } from './vehicle/vehicle.service';
import { PaymentController } from './payment/payment.controller';
import { PaymentService } from './payment/payment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report } from './reports/report.entity';

@Module({
  imports: [
    // ✅ DATABASE CONNECTION
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [Report],
      synchronize: true,
    }),

    // ✅ REGISTER ENTITY FOR USE IN SERVICES
    TypeOrmModule.forFeature([Report]),
  ],
  controllers: [
    VehicleController,
    PaymentController,
    HealthController,
  ],
  providers: [VehicleService, PaymentService],
})
export class AppModule {}