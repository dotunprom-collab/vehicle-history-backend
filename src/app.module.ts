import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';

import { VehicleController, HealthController } from './vehicle/vehicle.controller';
import { PaymentController } from './payment/payment.controller';
import { ContactController } from './contact/contact.controller';

import { VehicleService } from './vehicle/vehicle.service';
import { PaymentService } from './payment/payment.service';
import { RiskService } from './vehicle/risk.service';
import { EmailService } from './common/email.service';

import { Report } from './reports/report.entity';
import { Bundle } from './bundle/bundle.entity';
import { ConsumedSession } from './payment/consumed-session.entity';

import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // 🔐 RATE LIMITING
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),

    // 🌐 FRONTEND
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public/frontend'),
      serveRoot: '/',
      exclude: ['/api*'],
    }),

    // 🗄 DATABASE
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [Report, Bundle, ConsumedSession],
      synchronize: true,
    }),

    TypeOrmModule.forFeature([
      Report,
      Bundle,
      ConsumedSession,
    ]),

    // ⚠️ IMPORTANT: wrap in forwardRef because services depend on each other
    forwardRef(() => AuthModule),
  ],

  controllers: [
    VehicleController,
    PaymentController,
    HealthController,
    ContactController,
  ],

  providers: [
    VehicleService,
    PaymentService,
    RiskService,
    EmailService,
  ],
})
export class AppModule {}