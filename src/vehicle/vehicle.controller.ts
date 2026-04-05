import { Controller, Post, Body, Get, Res } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { Response } from 'express';
import PDFDocument from 'pdfkit';

@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post('preview')
  async preview(@Body() body: { registration: string }) {
    return this.vehicleService.getPreview(body.registration);
  }

  @Post('full')
  async full(@Body() body: { registration: string }) {
    return this.vehicleService.getFull(body.registration);
  }

  @Post('pdf')
  async generatePdf(
    @Body() body: { registration: string },
    @Res() res: Response
  ) {
    try {
      if (!body.registration) {
        return res.status(400).json({ error: 'Registration required' });
      }

      let data: any = await this.vehicleService.getFull(body.registration);

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
doc.fontSize(14).text('Vehicle Details', { underline: true });
doc.moveDown(0.5);

doc.text(`Registration: ${data.reg || 'N/A'}`);
doc.text(`Make: ${data.make || 'N/A'}`);
doc.text(`Model: ${data.model || 'N/A'}`);
doc.text(`Fuel: ${data.fuel || 'N/A'}`);
doc.text(`Colour: ${data.colour || 'N/A'}`);
doc.text(`Year: ${data.year || 'N/A'}`);
doc.moveDown();

// ===== CHECKS =====
doc.fontSize(14).text('Key Checks', { underline: true });
doc.moveDown(0.5);

doc.text(`Finance: ${data.finance === 'outstanding' ? '⚠ Outstanding' : '✔ Clear'}`);
doc.text(`Stolen: ${data.stolen === 'yes' ? '⚠ Yes' : '✔ No'}`);
doc.text(`Write-off: ${data.writeOff === 'yes' ? '⚠ Yes' : '✔ No'}`);
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

    } catch (error) {
      console.error('PDF ROUTE ERROR:', error);
    }
  }
  
}

// ✅ HEALTH CHECK (KEEP THIS)
@Controller()
export class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}