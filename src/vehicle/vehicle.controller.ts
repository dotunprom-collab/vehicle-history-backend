import { Controller, Post, Body, Get, Res } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import * as Sentry from '@sentry/node';

@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}
  
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
    @Body() body: { registration: string; paid?: boolean },
    @Res() res: Response
  ) {
    try {
      if (!body.registration) {
        return res.status(400).json({ error: 'Registration required' });
      }

      let data: any;
      let vehicle: any = {};
      

if (body.paid) {
  data = await this.vehicleService.getFullReport(
  body.registration
);
} else {
  data = await this.vehicleService.getPreview(body.registration);
}

vehicle = data.vehicle || {};

      if (!data || data.error) {
  console.error("❌ PDF DATA ERROR:", data);

  // ✅ FALLBACK (CRITICAL FIX)
  data = {
    reg: body.registration,
    make: "Unavailable",
    model: "Unavailable",
    fuel: "Unavailable",
    colour: "Unavailable",
    year: "N/A",
    mileage: "N/A",
    finance: "unknown",
    stolen: "unknown",
    writeOff: "unknown",
    motValid: false,
    taxValid: false,
    riskScore: 0,
    estimatedValue: "N/A",
    insights: ["Unable to load full data — please try again"]
  };
}

      const doc = new PDFDocument();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
      'Content-Disposition',
      `attachment; filename=${body.registration}-report.pdf`
  );

      doc.pipe(res);
      doc.on('error', (err: Error) => {
        console.error('PDF ERROR:', err);
      });

      doc.fontSize(18).text('Vehicle History Report', { align: 'center' });
doc.moveDown();

doc.fontSize(12).text(`Generated: ${new Date().toLocaleDateString()}`);
doc.moveDown();

// ===== VEHICLE =====
if (!body.paid) {
  doc.fontSize(12).text('⚠ This is a limited report');
  doc.text('Upgrade to unlock finance, stolen, and write-off data');
  doc.moveDown();
}
doc.fontSize(14).text('Vehicle Details', { underline: true });
doc.moveDown(0.5);

doc.text(`Registration: ${vehicle.reg || 'N/A'}`);
doc.text(`Make: ${vehicle.make || 'N/A'}`);
doc.text(`Model: ${vehicle.model || 'N/A'}`);
doc.text(`Fuel: ${vehicle.fuel || 'N/A'}`);
doc.text(`Colour: ${vehicle.colour || 'N/A'}`);
doc.text(`Year: ${vehicle.year || 'N/A'}`);
doc.moveDown();

// ===== CHECKS =====
doc.fontSize(14).text('Key Checks', { underline: true });
doc.moveDown(0.5);

if (body.paid) {
  doc.text(`Finance: ${data.finance === 'outstanding' ? '⚠ Outstanding' : '✔ Clear'}`);
  doc.text(`Stolen: ${data.stolen === 'yes' ? '⚠ Yes' : '✔ No'}`);
  doc.text(`Write-off: ${data.writeOff === 'yes' ? '⚠ Yes' : '✔ No'}`);
} else {
  doc.text(`Finance: 🔒 Locked`);
  doc.text(`Stolen: 🔒 Locked`);
  doc.text(`Write-off: 🔒 Locked`);
}
doc.text(`MOT: ${data.motValid ? '✔ Valid' : '⚠ Issue'}`);
doc.text(`Tax: ${data.taxValid ? '✔ Valid' : '⚠ Issue'}`);
doc.moveDown();

// ===== RISK =====
doc.fontSize(14).text('Risk Summary', { underline: true });
doc.moveDown(0.5);

let riskLabel = 'LOW RISK';
if (data.riskScore > 60) riskLabel = 'HIGH RISK';
else if (data.riskScore > 30) riskLabel = 'MEDIUM RISK';

doc.text(`Risk Score: ${data.riskScore || 0}/100`);
doc.text(`Assessment: ${riskLabel}`);
doc.moveDown();

// ===== VALUE =====
doc.fontSize(14).text('Valuation', { underline: true });
doc.moveDown(0.5);

doc.text(`Estimated Value: £${data.estimatedValue || 'N/A'}`);
doc.moveDown();

// ===== INSIGHTS =====
doc.fontSize(14).text('Summary Insights', { underline: true });
doc.moveDown(0.5);

if (Array.isArray(data.insights)) {
  data.insights.slice(0, 5).forEach((i: string) => {
    doc.text(`• ${i}`);
  });
} else {
  doc.text('No insights available');
}

doc.end();

    } catch (error: any) {
  console.error('PDF ROUTE ERROR:', error);

  Sentry.captureException(error, {
    extra: {
      route: 'vehicle/pdf',
      registration: body?.registration,
    },
  });

  return res.status(500).json({
    error: 'Failed to generate PDF',
  });
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