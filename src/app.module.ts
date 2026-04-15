import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleController, HealthController } from './vehicle/vehicle.controller';
import { VehicleService } from './vehicle/vehicle.service';
import { PaymentController } from './payment/payment.controller';
import { PaymentService } from './payment/payment.service';
import { Report } from './reports/report.entity';
import { Bundle } from './bundle/bundle.entity';
import { AuthModule } from './auth/auth.module';

// ✅ ADD THESE
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    // ✅ SERVE FRONTEND
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend'),
    }),

    // ✅ DATABASE
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [Report, Bundle],
      synchronize: true,
    }),

    // ✅ REGISTER ENTITY
    TypeOrmModule.forFeature([Report, Bundle]),

    AuthModule,
  ],

  controllers: [
    VehicleController,
    PaymentController,
    HealthController,
  ],

  providers: [
    VehicleService,
    PaymentService,
  ],
})
export class AppModule {}