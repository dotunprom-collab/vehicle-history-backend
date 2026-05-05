import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../reports/report.entity';
import { Bundle } from '../bundle/bundle.entity';
import { PaymentService } from '../payment/payment.service';
import { VehicleReport } from '../types/report';
import { AuthService } from '../auth/auth.service';
import { ConsumedSession } from '../payment/consumed-session.entity';
import { logger } from '../logger';
import { Inject, forwardRef } from '@nestjs/common';

@Injectable()
export class VehicleService {
  constructor(
  @InjectRepository(Report)
  private reportRepo: Repository<Report>,
  @InjectRepository(ConsumedSession)
  private consumedSessionRepo: Repository<ConsumedSession>,
  @InjectRepository(Bundle)
  private bundleRepo: Repository<Bundle>,
  @Inject(forwardRef(() => PaymentService))
  private paymentService: PaymentService,
  private authService: AuthService,
) {}

  // =========================
  // 🚗 PREVIEW (DVLA ONLY)
  // =========================
  async getPreview(reg: string): Promise<any> {
  try {
    console.log("🔥 DVLA PREVIEW START:", reg);
    console.log(
      "🔥 DVLA API KEY EXISTS:",
      !!process.env.DVLA_API_KEY
    );

    const dvlaRes = await axios.post(
      'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
      {
        registrationNumber: reg
      },
      {
        headers: {
          'x-api-key': process.env.DVLA_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const d = dvlaRes.data;
    console.log("🔥 DVLA RESPONSE:", d);
    // ✅ FREE TIER = DVLA ONLY
    // No RCC
    // No VDG
    // No finance/stolen/risk fields
    return {
      tier: 'free',
      vehicle: {

  reg:
    d.registrationNumber || reg,
  make:
    d.make || "Unknown",
  model:
    "Unknown",
  fuel:
    d.fuelType || "Unknown",
  colour:
    d.colour || "Unknown",
  year:
    d.yearOfManufacture || null,
  engineCapacity:
    d.engineCapacity || null,
  co2:
    d.co2Emissions || null,
  taxStatus:
    d.taxStatus || "Unknown",
  motStatus:
    d.motStatus || "Unknown",
  taxDueDate:
    d.taxDueDate || null,
  artEndDate:
    d.motExpiryDate || null,
  dateOfLastV5CIssued:
    d.dateOfLastV5CIssued || null,
  monthOfFirstRegistration:
    d.monthOfFirstRegistration || null,
  typeApproval:
    d.typeApproval || null,
  revenueWeight:
    d.revenueWeight || null,
  wheelplan:
    d.wheelplan || null,
  markedForExport:
    d.markedForExport ?? false,
},
    };

  } catch (err: any) {

    console.error(
      "🔥 DVLA ERROR:",
      err.message
    );

    return {
      tier: 'free',
      vehicle: {
        reg,
        make:
          "Unavailable",
        model:
          "Unavailable",
      },
    };
  }
}

private async fetchRccData(reg: string) {

   logger.info({
    event: 'RCC_FETCH',
    reg,
  });

  console.log('🔥 RCC FETCH:', reg);
  console.log('🔥 DOMAIN USED:', process.env.RAPID_API_DOMAIN);

  const apiKey = process.env.RAPID_API_KEY;
  const domain = process.env.RAPID_API_DOMAIN;

  const url =
    `https://www.rapidcarcheck.co.uk/api/` +
    `?key=${apiKey}` +
    `&domain=${encodeURIComponent(domain || '')}` +
    `&plate=${encodeURIComponent(reg)}`;

  const response = await axios.get(url);
  const data = response.data;

  if (process.env.NODE_ENV !== 'production') {
   console.log('DEBUG:', data);
  }

  console.log('🔥 RCC SUMMARY:', {
    reg,
    make: data?.Results?.InitialVehicleCheckModel?.BasicVehicleDetailsModel?.Make,
    model: data?.Results?.InitialVehicleCheckModel?.BasicVehicleDetailsModel?.Model,
  });

  const ivcm =
    data?.Results?.InitialVehicleCheckModel;

  const vehicle =
    ivcm?.BasicVehicleDetailsModel;

  logger.info({
  event: 'RCC_VEHICLE_PARSED',
  reg,
  make: vehicle?.Make || 'N/A',
  model: vehicle?.Model || 'N/A',
  year: vehicle?.YearOfManufacture || 'N/A',
});

  return {
    data,
    ivcm,
    vehicle,
  };
}

// =========================
// RCC STANDARD
// =========================

async getRccStandard(
  reg: string
) {
  try {
    const {
      vehicle
    } =
      await this.fetchRccData(reg);
    return {
      tier: 'standard',
      vehicle: {
        reg,
        make:
          vehicle?.Make || 'Unknown',
        model:
          vehicle?.Model || 'Unknown',
        fuel:
          vehicle?.FuelType || null,
        colour:
          vehicle?.Colour || null,
        year:
          vehicle?.YearOfManufacture || null,
        engineCapacity:
          vehicle?.CylinderCapacity || null,
        co2:
          vehicle?.Co2Emissions || null,
        taxStatus:
          vehicle?.RoadTaxStatusDescription || null,
        motStatus:
          vehicle?.MotStatusDescription || null,
      },
      motHistory:
        vehicle
          ?.MotResultsSummary
          ?.MotResults || [],
      keeperHistory:
        vehicle
          ?.KeeperHistory || [],
      writeOff: 'unknown',
    };
 } catch (err: any) {

  logger.error({
    event: 'RCC_STANDARD_ERROR',
    reg,
    error: err.message,
    response: err.response?.data || null,
  });
  throw new Error(
    'Failed to load standard report'
  );
 }
}
private async consumeBundle(email: string): Promise<boolean> {
  try {
    const bundle = await this.bundleRepo.findOne({
      where: {
        email,
        active: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
    if (!bundle) {
      logger.info({
        event: 'BUNDLE_NOT_FOUND',
        email,
      });
      return false;
    }
    if (bundle.remaining <= 0) {
      bundle.active = false;
      await this.bundleRepo.save(bundle);
      logger.warn({
        event: 'BUNDLE_EMPTY',
        email,
      });
      return false;
    }
    bundle.remaining -= 1;
    if (bundle.remaining <= 0) {
      bundle.active = false;
    }
    await this.bundleRepo.save(bundle);
    logger.info({
      event: 'BUNDLE_CONSUMED',
      email,
      remaining: bundle.remaining,
    });
    return true;
  } catch (err: any) {
    logger.error({
      event: 'BUNDLE_CONSUME_ERROR',
      email,
      error: err.message,
    });
    return false; // ❗ do NOT throw here (explained below)
  }
}
  // =========================
  // 🔒 FULL REPORT (PAID / BUNDLE)
  // =========================
async getFullReport(
  reg: string,
  sessionId?: string,
  token?: string
): Promise<VehicleReport | { error: string }> {
  try {
    let email: string | null = null;
    let isPaid = false;
    let accessTier = 'free';

    // =========================
    // 🔐 VERIFY REPORT TOKEN
    // =========================
    if (token) {
      const decoded: any =
        this.authService.verifyToken(token);
      console.log('🔥 TOKEN DECODED:', decoded);
      if (!decoded) {
        throw new Error('Invalid token');
      }
      if (decoded.type !== 'report_access') {
        throw new Error('Invalid access type');
      }
      const tokenReg = decoded.reg;
      if (
        tokenReg &&
        tokenReg.toUpperCase().trim() !==
          reg.toUpperCase().trim()
      ) {
        throw new Error(
          'Token registration mismatch'
        );
      }
      isPaid = true;
      accessTier =
        decoded.tier || 'standard';
    }

    // =========================
    // 💳 VERIFY STRIPE SESSION
    // =========================
    else if (sessionId) {
      const session: any =
        await this.paymentService.getSession(
          sessionId
        );
      if (!session || session.error) {
        throw new Error('Invalid session');
      }
      if (session.payment_status !== 'paid') {
        throw new Error('Payment required');
      }
      // ✅ SET EMAIL FIRST (CRITICAL FIX)
      email =
        session.customer_details?.email ||
        session.customer_email ||
        null;

      logger.info({
        event: 'ACCESS_GRANTED',
        reg,
        email,
        tier: accessTier,
      });

      accessTier =
        session.metadata?.tier ||
        'standard';

      const paidReg =
        session.metadata?.reg;

      if (
        paidReg &&
        paidReg.toUpperCase().trim() !==
          reg.toUpperCase().trim()
      ) {
        throw new Error(
          'Session registration mismatch'
        );
      }

      isPaid = true;

      // =========================
      // 🔐 PREVENT SESSION REUSE
      // =========================
      const alreadyUsed =
        await this.consumedSessionRepo.findOne({
          where: { sessionId },
        });

      if (
        alreadyUsed &&
        alreadyUsed.email !== email
      ) {
        throw new Error(
          'Session already used'
        );
      }

      // ✅ Save only once
      if (!alreadyUsed) {
        await this.consumedSessionRepo.save({
          sessionId,
          email: email || 'guest',
          reg,
        });
      }
    }

    // =========================
    // 🎟️ BUNDLE ACCESS
    // =========================
    let hasBundle = false;

  if (!isPaid) {
  if (!email) {
    logger.warn({ event: 'NO_EMAIL_FOR_BUNDLE', reg });
  } else {
    hasBundle = await this.consumeBundle(email);

    if (hasBundle) {
      accessTier = 'standard'; // or fetch bundle.tier if you support premium bundles
    }
  }
}

    console.log('🔥 ACCESS CHECK:', {
      isPaid,
      hasBundle,
      accessTier,
      email,
    });

    // =========================
    // 🔒 ACCESS CONTROL
    // =========================
    if (
      accessTier !== 'free' &&
      !isPaid &&
      !hasBundle
    ) {
      throw new Error('Payment required');
    }

    logger.info({
      event: 'ACCESS_GRANTED',
      reg,
      email,
      tier: accessTier,
    });

    // =========================
    // 🚦 TIER ROUTING
    // =========================
    let report: any = null;

    // FREE
    if (accessTier === 'free') {
      report = await this.getPreview(reg);
    }

    // STANDARD
    else if (accessTier === 'standard') {
      report =
        await this.getRccStandard(reg);

      logger.info({
  event: 'STANDARD_REPORT_GENERATED',
  reg,
  tier: report?.tier,
  make: report?.vehicle?.make || 'N/A',
  model: report?.vehicle?.model || 'N/A',
});
    }

    // PREMIUM
    else if (accessTier === 'premium') {
      const standard =
        await this.getRccStandard(reg);

      const { vehicle } =
        await this.fetchRccData(reg);

      const vdg =
        await this.getVDGData(reg);

      report = {
        ...standard,
        tier: 'premium',
        vehicle: {
          ...standard.vehicle,
          bodyStyle:
            vehicle?.BodyStyle || null,
          age:
            vehicle?.Age || null,
          taxBand:
            vehicle?.RoadTaxData?.Band ||
            null,
          annualTax:
            vehicle?.RoadTaxData
              ?.TwelveMonthRate || null,
          motDaysLeft:
            vehicle?.DaysLeftUntilMotDue ||
            null,
          taxDaysLeft:
            vehicle
              ?.DaysLeftUntilRoadTaxDue ||
            null,
          averageMileage:
            vehicle?.AverageMileage ||
            null,
        },
        finance:
          this.extractFinance(vdg),
        stolen:
          this.extractStolen(vdg),
        writeOff:
          this.extractWriteOff(vdg),
      };
    }

    else {
      throw new Error('Invalid access tier');
    }

    // =========================
    // 💾 SAVE REPORT
    // =========================
    await this.reportRepo.save({
      reg,
      userId: email || 'guest',
      data: report,
      status: 'paid',
      pkg: accessTier,
    });

    console.log(
      '🔥 RETURNING REPORT — tier:',
      accessTier
    );

    // =========================
    // 🔐 GENERATE ACCESS TOKEN
    // =========================
    if (accessTier === 'free') {
      return report;
    }

    const accessToken =
      this.authService.generateToken({
        reg,
        tier: accessTier,
        type: 'report_access',
      });

    return {
      ...report,
      accessToken,
    };

  } catch (err: any) {
    logger.error({
      event: 'FULL_REPORT_ERROR',
      error: err.message,
      reg,
    });

    return {
      error: err.message,
    };
  }
}
private async getVDGData(
  reg: string
) {

  const apiKey =
    process.env.VDG_API_KEY;
  if (!apiKey) {
    throw new Error(
      'VDG_API_KEY missing'
    );
  }

  const url =
    `https://uk.api.vehicledataglobal.com/r2/lookup` +
    `?packagename=VDICheck` +
    `&apikey=${apiKey}` +
    `&vrm=${encodeURIComponent(reg)}`;
  console.log(
    '🔥 VDG REQUEST:',
    reg
  );
  const response =
    await axios.get(url);
  console.log(
    '🔥 VDG RESPONSE OK'
  );
  return response.data;
}

// =========================
// VDG HELPERS
// =========================

private extractFinance(
  vdg: any
): string {

  const financeRecords =
    vdg?.Results
      ?.FinanceDetails
      ?.FinanceRecordList;

  if (!financeRecords) {
    return 'unknown';
  }

  return financeRecords.length > 0
    ? 'outstanding'
    : 'clear';
}

private extractStolen(
  vdg: any
): string {

  const isStolen =
    vdg?.Results
      ?.PncDetails
      ?.IsStolen;

  if (
    isStolen === undefined
  ) {
    return 'unknown';
  }
  return isStolen
    ? 'yes'
    : 'no';
}
private extractWriteOff(
  vdg: any
): string {
  const writeOffRecords =
    vdg?.Results
      ?.MiaftrDetails
      ?.WriteOffRecordList;
  if (!writeOffRecords) {
    return 'unknown';
  }
  return writeOffRecords.length > 0
    ? 'yes'
    : 'no';
}

async generatePdfBuffer(
  reg: string,
  data: any,
  tier: string,
): Promise<Buffer> {

  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // =========================
    // HELPERS
    // =========================
    const safe = (v: any): string => {
      if (v === null || v === undefined || v === '' || v === 'Unknown') {
        return 'Not available';
      }
      return String(v);
    };

    const statusIcon = (status: string | null | undefined): string => {
      if (!status) return '⚠ Unknown';
      const s = String(status).toLowerCase();
      if (s.includes('valid') || s.includes('taxed') || s.includes('clear')) {
        return `✔ ${status}`;
      }
      return `⚠ ${status}`;
    };

    const sectionHeader = (title: string) => {
      doc.moveDown(0.8);
      doc
        .fontSize(14)
        .fillColor('#1a1a1a')
        .text(title, { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(11).fillColor('#333333');
    };

    const divider = () => {
      doc.moveDown(0.6);
      const y = doc.y;
      doc
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .moveTo(50, y)
        .lineTo(545, y)
        .stroke();
      doc.moveDown(0.6);
    };

    const row = (label: string, value: any) => {
      doc
        .fontSize(11)
        .fillColor('#555555')
        .text(`${label}: `, { continued: true })
        .fillColor('#000000')
        .text(safe(value));
    };

    const v = data?.vehicle || {};

    // =========================
    // HEADER
    // =========================
    doc
      .fontSize(20)
      .fillColor('#0a3d62')
      .text('Vehicle History Report', { align: 'center' });

    doc.moveDown(0.3);

    doc
      .fontSize(11)
      .fillColor('#666666')
      .text(`Registration: ${reg}`, { align: 'center' })
      .text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, {
        align: 'center',
      })
      .text(`Tier: ${tier.toUpperCase()}`, { align: 'center' });

    divider();

    // =========================
    // VEHICLE OVERVIEW
    // =========================
    sectionHeader('Vehicle Overview');

    row('Registration', v.reg || reg);
    row('Make', v.make);
    row('Model', v.model);
    row('Fuel', v.fuel);
    row('Colour', v.colour);
    row('Year', v.year);
    row('Engine Capacity', v.engineCapacity ? `${v.engineCapacity} cc` : null);

    divider();

    // =========================
    // KEY CHECKS
    // =========================
    sectionHeader('Key Checks');

    if (tier === 'premium') {
      row(
        'Finance',
        data?.finance === 'outstanding'
          ? '⚠ Outstanding finance'
          : data?.finance === 'clear'
          ? '✔ Clear'
          : '⚠ Unknown',
      );
      row(
        'Stolen',
        data?.stolen === 'yes'
          ? '⚠ Reported stolen'
          : data?.stolen === 'no'
          ? '✔ Not reported stolen'
          : '⚠ Unknown',
      );
      row(
        'Write-off',
        data?.writeOff === 'yes'
          ? '⚠ Recorded write-off'
          : data?.writeOff === 'no'
          ? '✔ No write-off recorded'
          : '⚠ Unknown',
      );
    } else {
      row('Finance', '🔒 Upgrade required');
      row('Stolen', '🔒 Upgrade required');
      row('Write-off', '🔒 Upgrade required');
    }

    row('MOT', statusIcon(v.motStatus));
    row('Tax', statusIcon(v.taxStatus));

    divider();

    // =========================
    // RISK SUMMARY
    // =========================
    sectionHeader('Risk Summary');

    let riskScore = 0;
    const issues: string[] = [];

    if (tier === 'premium') {
      if (data?.finance === 'outstanding') {
        riskScore += 40;
        issues.push('Outstanding finance recorded');
      }
      if (data?.stolen === 'yes') {
        riskScore += 50;
        issues.push('Vehicle reported stolen');
      }
      if (data?.writeOff === 'yes') {
        riskScore += 30;
        issues.push('Insurance write-off recorded');
      }
    }

    const motLower = String(v.motStatus || '').toLowerCase();
    const taxLower = String(v.taxStatus || '').toLowerCase();

    if (motLower && !motLower.includes('valid')) {
      riskScore += 15;
      issues.push('MOT not valid');
    }
    if (taxLower && !taxLower.includes('taxed')) {
      riskScore += 10;
      issues.push('Vehicle not taxed');
    }

    if (riskScore > 100) riskScore = 100;

    let riskLevel = 'LOW';
    let riskColor = '#2ecc71';
    if (riskScore >= 60) {
      riskLevel = 'HIGH';
      riskColor = '#e74c3c';
    } else if (riskScore >= 30) {
      riskLevel = 'MEDIUM';
      riskColor = '#f39c12';
    }

    row('Risk Score', `${riskScore} / 100`);
    doc
      .fontSize(11)
      .fillColor('#555555')
      .text('Risk Level: ', { continued: true })
      .fillColor(riskColor)
      .text(riskLevel)
      .fillColor('#333333');

    doc.moveDown(0.4);

    if (issues.length === 0) {
      doc
        .fontSize(10)
        .fillColor('#2ecc71')
        .text('✔ No major issues detected');
    } else {
      doc.fontSize(10).fillColor('#c0392b');
      issues.forEach((issue) => doc.text(`• ${issue}`));
    }

    doc.fillColor('#333333');

    if (tier !== 'premium') {
      doc.moveDown(0.3);
      doc
        .fontSize(9)
        .fillColor('#888888')
        .text(
          'Note: Risk score is limited on Standard reports. Upgrade to Premium for finance, stolen, and write-off data.',
          { align: 'left' },
        );
      doc.fillColor('#333333');
    }

    divider();

    // =========================
    // VALUATION
    // =========================
    sectionHeader('Valuation');
    row(
      'Estimated Value',
      v.estimatedValue ? `£${v.estimatedValue}` : null,
    );

    divider();

    // =========================
    // MOT HISTORY (last 3)
    // =========================
    sectionHeader('MOT History');

    const motHistory = Array.isArray(data?.motHistory)
      ? data.motHistory.slice(0, 3)
      : [];

    if (motHistory.length === 0) {
      doc.fontSize(10).fillColor('#888888').text('No MOT history available.');
      doc.fillColor('#333333');
    } else {
      motHistory.forEach((mot: any, i: number) => {
        doc.fontSize(11).fillColor('#000000').text(`Test ${i + 1}`);
        doc.fontSize(10).fillColor('#555555');
        doc.text(`  Date: ${safe(mot?.TestDate || mot?.completedDate)}`);
        doc.text(`  Result: ${safe(mot?.TestResult || mot?.testResult)}`);
        doc.text(`  Mileage: ${safe(mot?.OdometerValue || mot?.odometerValue)}`);
        doc.moveDown(0.3);
      });
      doc.fillColor('#333333');
    }

    divider();

    // =========================
    // KEEPER HISTORY
    // =========================
    sectionHeader('Keeper History');

    const keeperHistory = Array.isArray(data?.keeperHistory)
      ? data.keeperHistory
      : [];

    if (keeperHistory.length === 0) {
      doc
        .fontSize(10)
        .fillColor('#888888')
        .text('No keeper history available.');
      doc.fillColor('#333333');
    } else {
      keeperHistory.forEach((k: any, i: number) => {
        doc.fontSize(10).fillColor('#555555');
        doc.text(
          `  Keeper ${i + 1}: ${safe(k?.DateOfTransaction || k?.date)} — ${safe(
            k?.NumberOfPreviousKeepers ?? k?.previousKeepers,
          )} previous keeper(s)`,
        );
      });
      doc.fillColor('#333333');
    }

    // =========================
    // PREMIUM EXTENSIONS
    // =========================
    if (tier === 'premium') {
      divider();
      sectionHeader('Premium Details');

      row('Body Style', v.bodyStyle);
      row('Age', v.age);
      row('Tax Band', v.taxBand);
      row('Annual Tax', v.annualTax ? `£${v.annualTax}` : null);
      row('MOT Days Left', v.motDaysLeft);
      row('Tax Days Left', v.taxDaysLeft);
      row('Average Mileage', v.averageMileage);
    }

    // =========================
    // UPSELL (STANDARD ONLY)
    // =========================
    if (tier === 'standard') {
      divider();
      doc
        .fontSize(13)
        .fillColor('#0a3d62')
        .text('Upgrade to Premium to unlock:', { align: 'center' });

      doc.moveDown(0.4);
      doc.fontSize(11).fillColor('#333333');
      doc.text('✔ Finance check', { align: 'center' });
      doc.text('✔ Stolen vehicle check', { align: 'center' });
      doc.text('✔ Insurance write-off', { align: 'center' });
      doc.text('✔ Advanced risk data', { align: 'center' });
    }

    // =========================
    // FOOTER
    // =========================
    doc.moveDown(1.5);
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(
        'This report is generated from DVLA, MOT, and partner data sources. CheapRegCheck is not liable for inaccuracies in third-party data.',
        { align: 'center' },
      );
    doc.end();
  });
  }
}