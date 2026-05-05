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
import { RiskService } from './vehicle/risk.service';
import { ConsumedSession } from './payment/consumed-session.entity';
import { EmailService } from './common/email.service';

import {
  ThrottlerModule,
} from '@nestjs/throttler';

@Module({

  imports: [

    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),

    // ✅ SERVE FRONTEND
    ServeStaticModule.forRoot({
      rootPath: join(
        process.cwd(),
        'public/frontend'
      ),
      serveRoot: '/',
      exclude: ['/api*'],
    }),

    // ✅ DATABASE
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',

      entities: [
        Report,
        Bundle,
        ConsumedSession,
      ],

      synchronize: true,
    }),

    TypeOrmModule.forFeature([
      Report,
      Bundle,
      ConsumedSession,
    ]),

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
    RiskService,
  ],
})

export class AppModule {}