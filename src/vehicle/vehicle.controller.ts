import { Controller, Post, Body, Get, Res } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { Response } from 'express';
import { Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import * as Sentry from '@sentry/node';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsumedSession } from '../payment/consumed-session.entity';

@Controller('vehicle')
export class VehicleController {
  constructor(
    private readonly vehicleService: VehicleService,
    @InjectRepository(ConsumedSession)
    private readonly consumedSessionRepo: Repository<ConsumedSession>,
  ) {}
  
@Throttle({
  default: {
    limit: 10,
    ttl: 60000,
  },

})
  @Post('preview')
  async preview(@Body() body: { registration: string }) {
    return this.vehicleService.getPreview(body.registration);
  }

@Get('preview-test')
async previewTest(@Query('reg') reg: string) {
  return this.vehicleService.getPreview(reg);
}

@Post('full')
async full(@Body() body: any) {

  console.log('🔥 /vehicle/full HIT');

  return this.vehicleService.getFullReport(
    body.registration || body.reg,
    body.sessionId,
    body.token
  );
}

@Post('pdf')
  async generatePdf(
    @Body() body: { registration: string; sessionId?: string },
    @Res() res: Response
  ) {
    const reg = body?.registration;
    const sessionId = body?.sessionId;

    try {
      if (!reg) {
        return res.status(400).json({ error: 'Registration required' });
      }

      // Resolve tier from trusted source (DB), never from request body.
      // No sessionId = free preview tier. Mismatched sessionId = free preview tier.
      let tier: 'free' | 'standard' | 'premium' = 'free';
      if (sessionId) {
        const consumed = await this.consumedSessionRepo.findOne({
          where: { sessionId },
        });
        if (consumed && consumed.reg?.toUpperCase() === reg.toUpperCase()) {
          const t = (consumed.tier || 'standard').toLowerCase();
          if (t === 'premium') tier = 'premium';
          else if (t === 'standard') tier = 'standard';
        }
      }

      // Fetch the same data shape the email flow uses
      const data =
        tier === 'free'
          ? await this.vehicleService.getPreview(reg)
          : await this.vehicleService.getFullReport(reg, sessionId);

      if (!data || (data as any).error) {
        console.error('❌ PDF DATA ERROR:', data);
        return res.status(502).json({ error: 'Failed to load vehicle data' });
      }

console.log('🔥 DOWNLOAD PATH BUYER VERDICT:', JSON.stringify((data as any)?.buyerVerdict, null, 2));
      console.log('🔥 DOWNLOAD PATH DATA KEYS:', Object.keys(data || {}));
      console.log('🔥 DOWNLOAD PATH TIER:', tier);

      const pdfBuffer = await this.vehicleService.generatePdfBuffer(
        reg,
        data,
        tier,
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=${reg}-report.pdf`,
      );
      res.setHeader('Content-Length', String(pdfBuffer.length));
      return res.send(pdfBuffer);
    } catch (error: any) {
      console.error('PDF ROUTE ERROR:', error);
      Sentry.captureException(error, {
        extra: { route: 'vehicle/pdf', registration: reg },
      });
      return res.status(500).json({ error: 'Failed to generate PDF' });
    }
  }
}

// ✅ HEALTH CHECK (KEEP THIS)
@Controller('health')
export class HealthController {
  @Get()
health() {
  return {
    status: 'ok',
    timestamp:
      new Date().toISOString(),
  };
  }
}