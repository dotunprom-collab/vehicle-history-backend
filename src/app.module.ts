import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleController, HealthController } from './vehicle/vehicle.controller';
import { VehicleService } from './vehicle/vehicle.service';
import { PaymentController } from './payment/payment.controller';
import { PaymentService } from './payment/payment.service';
import { Report } from './reports/report.entity';
import { Bundle } from './bundle/bundle.entity';
import { AuthModule } from './auth/auth.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
 ServeStaticModule.forRoot({
  rootPath: join(__dirname, 'frontend'),
  serveStaticOptions: {
    index: ['index.html'],
  },
  exclude: ['/vehicle*', '/payment*'],
}),

    // ✅ DATABASE (KEEP THIS REAL)
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [Report, Bundle],
      synchronize: true,
    }),

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