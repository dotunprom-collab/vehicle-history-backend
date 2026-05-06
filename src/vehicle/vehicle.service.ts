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

  const vehicle =
  data?.Results?.InitialVehicleCheckModel?.BasicVehicleDetailsModel || null;

  logger.info({
  event: 'RCC_VEHICLE_PARSED',
  reg,
  make: vehicle?.Make || 'N/A',
  model: vehicle?.Model || 'N/A',
  year: vehicle?.YearOfManufacture || 'N/A',
});

  return {
    data,
    vehicle,
  };
}

// =========================
// RCC STANDARD
// =========================

async getRccStandard(reg: string) {
  try {

    const { vehicle, data } =
      await this.fetchRccData(reg);

    if (!vehicle) {
      throw new Error('RCC vehicle data missing');
    }

    if (!vehicle) {
      logger.error({
        event: 'RCC_EMPTY_RESPONSE',
        reg,
        data,
      });

      throw new Error('RCC returned no vehicle data');
    }

    return {
      tier: 'standard',
      vehicle: {
        reg,
        make: vehicle?.Make || 'Unknown',
        model: vehicle?.Model || 'Unknown',
        fuel: vehicle?.FuelType || null,
        colour: vehicle?.Colour || null,
        year: vehicle?.YearOfManufacture || null,
        engineCapacity: vehicle?.CylinderCapacity || null,
        co2: vehicle?.Co2Emissions || null,
        taxStatus: vehicle?.RoadTaxStatusDescription || null,
        motStatus: vehicle?.MotStatusDescription || null,
      },

      motHistory:
        vehicle?.MotResultsSummary?.MotResults || [],

      keeperHistory:
        vehicle?.KeeperHistory || [],

      writeOff: 'unknown',
    };

  } catch (err: any) {

    logger.error({
      event: 'RCC_STANDARD_ERROR',
      reg,
      error: err.message,
      response: err.response?.data || null,
    });

    throw new Error('Failed to load standard report');
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
  const path = require('path');
  const fs = require('fs');

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true,
    info: {
      Title: `Vehicle Report ${reg}`,
      Author: 'CheapRegCheck',
      Subject: `${tier.toUpperCase()} Vehicle History Report`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ============================================================
    // DESIGN SYSTEM
    // ============================================================
    const COLORS = {
      ink: '#0f172a',
      text: '#334155',
      muted: '#64748b',
      subtle: '#94a3b8',
      border: '#e2e8f0',
      bg: '#f8fafc',
      cardBg: '#ffffff',
      brand: '#0a3d62',
      brandLight: '#3c6382',
      brandSoft: '#dbeafe',
      premium: '#b45309',
      premiumSoft: '#fef3c7',
      success: '#059669',
      successSoft: '#d1fae5',
      warning: '#d97706',
      warningSoft: '#fef3c7',
      danger: '#dc2626',
      dangerSoft: '#fee2e2',
      white: '#ffffff',
    };

    const PAGE = {
      width: 595.28,
      height: 841.89,
      margin: 40,
      contentWidth: 515.28,
    };

    // ============================================================
    // FONTS
    // ============================================================
    const fontDir = path.join(process.cwd(), 'assets', 'fonts');
    const fontRegular = path.join(fontDir, 'Inter-Regular.ttf');
    const fontBold = path.join(fontDir, 'Inter-Bold.ttf');
    const fontSemi = path.join(fontDir, 'Inter-SemiBold.ttf');

    const hasFonts =
      fs.existsSync(fontRegular) &&
      fs.existsSync(fontBold) &&
      fs.existsSync(fontSemi);

    if (hasFonts) {
      doc.registerFont('Sans', fontRegular);
      doc.registerFont('SansBold', fontBold);
      doc.registerFont('SansSemi', fontSemi);
    }

    const F = {
      regular: hasFonts ? 'Sans' : 'Helvetica',
      bold: hasFonts ? 'SansBold' : 'Helvetica-Bold',
      semi: hasFonts ? 'SansSemi' : 'Helvetica-Bold',
    };

    // ============================================================
    // STATE
    // ============================================================
    const isPremium = tier === 'premium';
    const isStandard = tier === 'standard';
    const isFree = tier === 'free';
    const v = data?.vehicle || {};

    const motValid = String(v.motStatus || '').toLowerCase().includes('valid');
    const taxValid = String(v.taxStatus || '').toLowerCase().includes('taxed');

    // Compute risk
    let riskScore = 0;
    const issues: string[] = [];
    const positives: string[] = [];

    if (isPremium) {
      if (data?.finance === 'outstanding') {
        riskScore += 40;
        issues.push('Outstanding finance recorded');
      } else if (data?.finance === 'clear') {
        positives.push('No outstanding finance');
      }
      if (data?.stolen === 'yes') {
        riskScore += 50;
        issues.push('Vehicle reported stolen');
      } else if (data?.stolen === 'no') {
        positives.push('Not reported stolen');
      }
      if (data?.writeOff === 'yes') {
        riskScore += 30;
        issues.push('Insurance write-off recorded');
      } else if (data?.writeOff === 'no') {
        positives.push('No write-off recorded');
      }
    }

    if (v.motStatus && !motValid) {
      riskScore += 15;
      issues.push('MOT not currently valid');
    } else if (motValid) {
      positives.push('MOT valid');
    }
    if (v.taxStatus && !taxValid) {
      riskScore += 10;
      issues.push('Vehicle not currently taxed');
    } else if (taxValid) {
      positives.push('Tax paid');
    }
    if (riskScore > 100) riskScore = 100;

    let riskLevel = 'LOW';
    let riskColor = COLORS.success;
    let riskSoft = COLORS.successSoft;
    let verdict = 'No major issues detected';

    if (riskScore >= 60) {
      riskLevel = 'HIGH';
      riskColor = COLORS.danger;
      riskSoft = COLORS.dangerSoft;
      verdict = 'Caution advised — issues found';
    } else if (riskScore >= 30) {
      riskLevel = 'MEDIUM';
      riskColor = COLORS.warning;
      riskSoft = COLORS.warningSoft;
      verdict = 'Some concerns identified';
    }

    // ============================================================
    // PRIMITIVES
    // ============================================================
    const text = (
      str: string,
      x: number,
      y: number,
      opts: any = {},
    ) => {
      doc
        .font(opts.font || F.regular)
        .fontSize(opts.size || 10)
        .fillColor(opts.color || COLORS.text)
        .text(str, x, y, {
          width: opts.width || PAGE.contentWidth,
          align: opts.align || 'left',
          ...opts,
        });
    };

    const fillRect = (x: number, y: number, w: number, h: number, color: string) => {
      doc.rect(x, y, w, h).fillColor(color).fill();
    };

    const roundedRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      fillColor?: string,
      strokeColor?: string,
    ) => {
      doc.roundedRect(x, y, w, h, r);
      if (fillColor && strokeColor) {
        doc.fillColor(fillColor).strokeColor(strokeColor).lineWidth(1).fillAndStroke();
      } else if (fillColor) {
        doc.fillColor(fillColor).fill();
      } else if (strokeColor) {
        doc.strokeColor(strokeColor).lineWidth(1).stroke();
      }
    };

    const safe = (val: any): string => {
      if (val === null || val === undefined || val === '' || val === 'Unknown') {
        return 'Not available';
      }
      return String(val);
    };

    // Icons drawn as SVG paths
    const icon = (name: string, x: number, y: number, size: number, color: string) => {
      doc.save();
      doc.translate(x, y);
      doc.scale(size / 24);
      doc.fillColor(color).strokeColor(color).lineWidth(2);

      const paths: Record<string, () => void> = {
        check: () => {
          doc.path('M5 12l5 5L20 7').lineWidth(2.5).stroke();
        },
        cross: () => {
          doc.path('M6 6l12 12M18 6L6 18').lineWidth(2.5).stroke();
        },
        lock: () => {
          doc.path('M6 10V8a6 6 0 0112 0v2').stroke();
          doc.rect(5, 10, 14, 11).fillAndStroke();
        },
        warning: () => {
          doc.path('M12 3L2 21h20L12 3zM12 10v5M12 17v.5').lineWidth(2).stroke();
        },
        car: () => {
          doc.path('M3 13l2-6h14l2 6M3 13v6h2v-2h14v2h2v-6M3 13h18M7 17a1 1 0 100-2 1 1 0 000 2zM17 17a1 1 0 100-2 1 1 0 000 2z').stroke();
        },
        shield: () => {
          doc.path('M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z').stroke();
        },
        history: () => {
          doc.circle(12, 12, 9).stroke();
          doc.path('M12 7v5l3 2').lineWidth(2).stroke();
        },
        gauge: () => {
          doc.path('M3 12a9 9 0 1118 0').stroke();
          doc.path('M12 12l4-4').lineWidth(2).stroke();
        },
        info: () => {
          doc.circle(12, 12, 9).stroke();
          doc.path('M12 8v.5M12 11v5').lineWidth(2).stroke();
        },
      };

      (paths[name] || paths.info)();
      doc.restore();
    };

    // ============================================================
    // PAGE 1 — COVER
    // ============================================================
    // Full-bleed brand background
    fillRect(0, 0, PAGE.width, PAGE.height, COLORS.brand);

    // Decorative gradient band (faked with overlapping rects)
    fillRect(0, 0, PAGE.width, 280, COLORS.brand);
    fillRect(0, 0, PAGE.width, 4, isPremium ? COLORS.premium : COLORS.brandLight);

    // Logo
    const logoPath = path.join(process.cwd(), 'assets', 'logo-light.png');
    if (fs.existsSync(logoPath)) {
      try {
        doc.image(logoPath, PAGE.width / 2 - 60, 70, { width: 120 });
      } catch {}
    }

    // Tier pill
    const pillLabel = isPremium
      ? 'PREMIUM REPORT'
      : isStandard
      ? 'STANDARD REPORT'
      : 'FREE PREVIEW';
    const pillColor = isPremium
      ? COLORS.premium
      : isStandard
      ? COLORS.brandLight
      : COLORS.muted;

    doc
      .font(F.bold)
      .fontSize(9)
      .fillColor(COLORS.white);
    const pillTextWidth = doc.widthOfString(pillLabel);
    const pillW = pillTextWidth + 32;
    const pillX = (PAGE.width - pillW) / 2;
    roundedRect(pillX, 200, pillW, 24, 12, pillColor);
    text(pillLabel, pillX, 207, {
      font: F.bold,
      size: 9,
      color: COLORS.white,
      width: pillW,
      align: 'center',
      characterSpacing: 1,
    });

    // Main title
    text('Vehicle History Report', 0, 250, {
      font: F.bold,
      size: 32,
      color: COLORS.white,
      width: PAGE.width,
      align: 'center',
    });

    // Registration plate — big yellow plate graphic
    const plateW = 280;
    const plateH = 70;
    const plateX = (PAGE.width - plateW) / 2;
    const plateY = 320;

    fillRect(plateX, plateY, plateW, plateH, '#fbbf24');
    doc
      .strokeColor('#1f2937')
      .lineWidth(3)
      .rect(plateX, plateY, plateW, plateH)
      .stroke();

    // GB strip on the plate
    fillRect(plateX, plateY, 36, plateH, COLORS.brand);
    text('GB', plateX, plateY + 28, {
      font: F.bold,
      size: 12,
      color: COLORS.white,
      width: 36,
      align: 'center',
    });

    text(reg.toUpperCase(), plateX + 36, plateY + 16, {
      font: F.bold,
      size: 38,
      color: '#1f2937',
      width: plateW - 36,
      align: 'center',
      characterSpacing: 2,
    });

    // Vehicle headline
    const vehicleHeadline = [v.year, v.make, v.model]
      .filter((x) => x && x !== 'Unknown')
      .join(' ');

    if (vehicleHeadline) {
      text(vehicleHeadline, 0, 410, {
        font: F.semi,
        size: 18,
        color: COLORS.white,
        width: PAGE.width,
        align: 'center',
      });
    }

    // Verdict card on cover
    const verdictW = 400;
    const verdictH = 130;
    const verdictX = (PAGE.width - verdictW) / 2;
    const verdictY = 480;

    roundedRect(verdictX, verdictY, verdictW, verdictH, 12, COLORS.white);

    // Risk badge inside verdict card
    const badgeW = 100;
    const badgeH = 28;
    const badgeX = verdictX + (verdictW - badgeW) / 2;
    roundedRect(badgeX, verdictY + 20, badgeW, badgeH, 14, riskSoft);
    text(`${riskLevel} RISK`, badgeX, verdictY + 28, {
      font: F.bold,
      size: 10,
      color: riskColor,
      width: badgeW,
      align: 'center',
      characterSpacing: 1,
    });

    text(verdict, verdictX, verdictY + 60, {
      font: F.semi,
      size: 14,
      color: COLORS.ink,
      width: verdictW,
      align: 'center',
    });

    text(`Risk score: ${riskScore} / 100`, verdictX, verdictY + 88, {
      font: F.regular,
      size: 11,
      color: COLORS.muted,
      width: verdictW,
      align: 'center',
    });

    // Footer of cover
    text(
      `Generated on ${new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`,
      0,
      760,
      {
        font: F.regular,
        size: 9,
        color: '#cbd5e1',
        width: PAGE.width,
        align: 'center',
      },
    );

    text('CheapRegCheck.com', 0, 778, {
      font: F.semi,
      size: 10,
      color: COLORS.white,
      width: PAGE.width,
      align: 'center',
    });

    // ============================================================
    // PAGE HEADER (used on subsequent pages)
    // ============================================================
    const drawPageHeader = () => {
      fillRect(0, 0, PAGE.width, 50, COLORS.brand);

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, PAGE.margin, 14, { width: 70 });
        } catch {}
      }

      text(`${reg.toUpperCase()}  •  ${pillLabel}`, 0, 22, {
        font: F.semi,
        size: 9,
        color: COLORS.white,
        width: PAGE.width - PAGE.margin,
        align: 'right',
        characterSpacing: 1,
      });
    };

    const drawPageFooter = (pageNum: number) => {
      const y = PAGE.height - 30;
      doc
        .strokeColor(COLORS.border)
        .lineWidth(0.5)
        .moveTo(PAGE.margin, y - 10)
        .lineTo(PAGE.width - PAGE.margin, y - 10)
        .stroke();

      text('CheapRegCheck.com', PAGE.margin, y, {
        font: F.semi,
        size: 8,
        color: COLORS.muted,
        width: 200,
      });
      text(`Page ${pageNum}`, PAGE.width - PAGE.margin - 100, y, {
        font: F.regular,
        size: 8,
        color: COLORS.muted,
        width: 100,
        align: 'right',
      });
    };

    // ============================================================
    // PAGE 2 — DASHBOARD SUMMARY
    // ============================================================
    doc.addPage();
    drawPageHeader();

    let cursorY = 80;

    text('At a glance', PAGE.margin, cursorY, {
      font: F.bold,
      size: 22,
      color: COLORS.ink,
      width: PAGE.contentWidth,
    });
    cursorY += 8;
    text('Quick summary of all key checks for this vehicle.', PAGE.margin, cursorY + 22, {
      font: F.regular,
      size: 11,
      color: COLORS.muted,
      width: PAGE.contentWidth,
    });
    cursorY += 60;

    // Risk gauge card
    const gaugeCardH = 160;
    roundedRect(
      PAGE.margin,
      cursorY,
      PAGE.contentWidth,
      gaugeCardH,
      12,
      COLORS.cardBg,
      COLORS.border,
    );

    text('Overall Risk Assessment', PAGE.margin + 24, cursorY + 20, {
      font: F.semi,
      size: 12,
      color: COLORS.ink,
    });

    // Gauge bar
    const gaugeY = cursorY + 60;
    const gaugeX = PAGE.margin + 24;
    const gaugeW = PAGE.contentWidth - 48;

    fillRect(gaugeX, gaugeY, gaugeW, 14, COLORS.bg);
    // Risk zones
    fillRect(gaugeX, gaugeY, gaugeW * 0.3, 14, COLORS.successSoft);
    fillRect(gaugeX + gaugeW * 0.3, gaugeY, gaugeW * 0.3, 14, COLORS.warningSoft);
    fillRect(gaugeX + gaugeW * 0.6, gaugeY, gaugeW * 0.4, 14, COLORS.dangerSoft);

    // Score indicator
    const indicatorX = gaugeX + (gaugeW * riskScore) / 100;
    doc
      .polygon(
        [indicatorX - 6, gaugeY - 4],
        [indicatorX + 6, gaugeY - 4],
        [indicatorX, gaugeY + 6],
      )
      .fillColor(riskColor)
      .fill();

    fillRect(indicatorX - 1.5, gaugeY, 3, 14, riskColor);

    // Scale labels
    text('0', gaugeX, gaugeY + 22, {
      font: F.regular,
      size: 9,
      color: COLORS.subtle,
      width: 30,
    });
    text('LOW', gaugeX + gaugeW * 0.15 - 15, gaugeY + 22, {
      font: F.semi,
      size: 9,
      color: COLORS.success,
      width: 30,
      align: 'center',
    });
    text('MED', gaugeX + gaugeW * 0.45 - 15, gaugeY + 22, {
      font: F.semi,
      size: 9,
      color: COLORS.warning,
      width: 30,
      align: 'center',
    });
    text('HIGH', gaugeX + gaugeW * 0.8 - 15, gaugeY + 22, {
      font: F.semi,
      size: 9,
      color: COLORS.danger,
      width: 30,
      align: 'center',
    });
    text('100', gaugeX + gaugeW - 30, gaugeY + 22, {
      font: F.regular,
      size: 9,
      color: COLORS.subtle,
      width: 30,
      align: 'right',
    });

    // Big score
    text(`${riskScore}`, PAGE.margin + 24, cursorY + 110, {
      font: F.bold,
      size: 32,
      color: riskColor,
    });
    text('/ 100', PAGE.margin + 90, cursorY + 124, {
      font: F.regular,
      size: 12,
      color: COLORS.muted,
    });
    text(verdict, PAGE.margin + 200, cursorY + 120, {
      font: F.semi,
      size: 13,
      color: COLORS.ink,
      width: PAGE.contentWidth - 200,
      align: 'right',
    });

    cursorY += gaugeCardH + 20;

    // Status grid — 2x3 cards
    const checks = [
      {
        label: 'Finance',
        status: isPremium
          ? data?.finance === 'outstanding'
            ? 'warn'
            : data?.finance === 'clear'
            ? 'ok'
            : 'unknown'
          : 'locked',
        message: isPremium
          ? data?.finance === 'outstanding'
            ? 'Outstanding'
            : data?.finance === 'clear'
            ? 'Clear'
            : 'Unknown'
          : 'Premium only',
      },
      {
        label: 'Stolen',
        status: isPremium
          ? data?.stolen === 'yes'
            ? 'warn'
            : data?.stolen === 'no'
            ? 'ok'
            : 'unknown'
          : 'locked',
        message: isPremium
          ? data?.stolen === 'yes'
            ? 'Reported stolen'
            : data?.stolen === 'no'
            ? 'Not stolen'
            : 'Unknown'
          : 'Premium only',
      },
      {
        label: 'Write-off',
        status: isPremium
          ? data?.writeOff === 'yes'
            ? 'warn'
            : data?.writeOff === 'no'
            ? 'ok'
            : 'unknown'
          : 'locked',
        message: isPremium
          ? data?.writeOff === 'yes'
            ? 'Recorded'
            : data?.writeOff === 'no'
            ? 'No record'
            : 'Unknown'
          : 'Premium only',
      },
      {
        label: 'MOT',
        status: motValid ? 'ok' : v.motStatus ? 'warn' : 'unknown',
        message: safe(v.motStatus),
      },
      {
        label: 'Tax',
        status: taxValid ? 'ok' : v.taxStatus ? 'warn' : 'unknown',
        message: safe(v.taxStatus),
      },
      {
        label: 'Export',
        status: v.markedForExport ? 'warn' : 'ok',
        message: v.markedForExport ? 'Marked for export' : 'Not exported',
      },
    ];

    const colorFor = (s: string) =>
      s === 'ok'
        ? { fg: COLORS.success, bg: COLORS.successSoft }
        : s === 'warn'
        ? { fg: COLORS.danger, bg: COLORS.dangerSoft }
        : s === 'locked'
        ? { fg: COLORS.muted, bg: COLORS.bg }
        : { fg: COLORS.warning, bg: COLORS.warningSoft };

    const iconFor = (s: string) =>
      s === 'ok' ? 'check' : s === 'warn' ? 'cross' : s === 'locked' ? 'lock' : 'warning';

    const cardW = (PAGE.contentWidth - 20) / 3;
    const cardH = 100;

    checks.forEach((c, i) => {
      const col = i % 3;
      const rowI = Math.floor(i / 3);
      const x = PAGE.margin + col * (cardW + 10);
      const y = cursorY + rowI * (cardH + 10);

      const colors = colorFor(c.status);

      roundedRect(x, y, cardW, cardH, 10, COLORS.cardBg, COLORS.border);

      // Icon circle
      const iconCircleSize = 32;
      roundedRect(
        x + 16,
        y + 16,
        iconCircleSize,
        iconCircleSize,
        16,
        colors.bg,
      );
      icon(iconFor(c.status), x + 16 + 4, y + 16 + 4, 24, colors.fg);

      text(c.label, x + 16, y + 58, {
        font: F.semi,
        size: 11,
        color: COLORS.muted,
        width: cardW - 32,
      });
      text(c.message, x + 16, y + 74, {
        font: F.bold,
        size: 13,
        color: COLORS.ink,
        width: cardW - 32,
      });
    });

    cursorY += cardH * 2 + 30;

    // Issues / positives summary
    if (issues.length > 0 || positives.length > 0) {
      const summaryH = 140;
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, summaryH, 12, COLORS.bg);

      const colW = (PAGE.contentWidth - 32) / 2;

      if (positives.length > 0) {
        text('What looks good', PAGE.margin + 16, cursorY + 16, {
          font: F.semi,
          size: 11,
          color: COLORS.success,
          width: colW,
        });
        positives.forEach((p, i) => {
          icon('check', PAGE.margin + 16, cursorY + 38 + i * 18, 12, COLORS.success);
          text(p, PAGE.margin + 32, cursorY + 38 + i * 18, {
            font: F.regular,
            size: 10,
            color: COLORS.text,
            width: colW - 16,
          });
        });
      }

      if (issues.length > 0) {
        const issueX = PAGE.margin + colW + 16;
        text('Things to check', issueX, cursorY + 16, {
          font: F.semi,
          size: 11,
          color: COLORS.danger,
          width: colW,
        });
        issues.forEach((p, i) => {
          icon('warning', issueX, cursorY + 38 + i * 18, 12, COLORS.danger);
          text(p, issueX + 16, cursorY + 38 + i * 18, {
            font: F.regular,
            size: 10,
            color: COLORS.text,
            width: colW - 16,
          });
        });
      }
    }

    drawPageFooter(2);

    // ============================================================
    // PAGE 3 — VEHICLE DETAILS
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    icon('car', PAGE.margin, cursorY + 4, 28, COLORS.brand);
    text('Vehicle details', PAGE.margin + 40, cursorY, {
      font: F.bold,
      size: 22,
      color: COLORS.ink,
      width: PAGE.contentWidth - 40,
    });
    cursorY += 50;

    // Specs grid as cards
    const specs = [
      ['Registration', v.reg || reg],
      ['Make', v.make],
      ['Model', v.model],
      ['Year', v.year],
      ['Fuel Type', v.fuel],
      ['Colour', v.colour],
      ['Engine', v.engineCapacity ? `${v.engineCapacity} cc` : null],
      ['CO2 Emissions', v.co2 ? `${v.co2} g/km` : null],
    ];

    if (isPremium) {
      specs.push(
        ['Body Style', v.bodyStyle],
        ['Type Approval', v.typeApproval],
        ['Wheelplan', v.wheelplan],
        ['Revenue Weight', v.revenueWeight ? `${v.revenueWeight} kg` : null],
      );
    }

    const specCardW = (PAGE.contentWidth - 16) / 2;
    const specCardH = 60;

    specs.forEach((s, i) => {
      const col = i % 2;
      const rowI = Math.floor(i / 2);
      const x = PAGE.margin + col * (specCardW + 16);
      const y = cursorY + rowI * (specCardH + 8);

      roundedRect(x, y, specCardW, specCardH, 8, COLORS.bg);
      text(String(s[0]), x + 16, y + 12, {
        font: F.semi,
        size: 9,
        color: COLORS.muted,
        characterSpacing: 0.5,
      });
      text(safe(s[1]), x + 16, y + 30, {
        font: F.semi,
        size: 13,
        color: COLORS.ink,
        width: specCardW - 32,
      });
    });

    cursorY += Math.ceil(specs.length / 2) * (specCardH + 8) + 24;

    // Premium-only timeline info
    if (isPremium) {
      icon('history', PAGE.margin, cursorY + 4, 24, COLORS.premium);
      text('Tax & MOT timeline', PAGE.margin + 36, cursorY, {
        font: F.bold,
        size: 16,
        color: COLORS.ink,
        width: PAGE.contentWidth - 36,
      });
      cursorY += 40;

      const timelineItems = [
        ['Tax Band', v.taxBand],
        ['Annual Tax', v.annualTax ? `£${v.annualTax}` : null],
        ['Tax Days Left', v.taxDaysLeft],
        ['MOT Days Left', v.motDaysLeft],
        ['Tax Due', v.taxDueDate],
        ['MOT Expires', v.artEndDate],
        ['Average Mileage', v.averageMileage ? `${v.averageMileage} mi/yr` : null],
        ['First Registered', v.monthOfFirstRegistration],
      ];

      timelineItems.forEach((s, i) => {
        const col = i % 2;
        const rowI = Math.floor(i / 2);
        const x = PAGE.margin + col * (specCardW + 16);
        const y = cursorY + rowI * (specCardH + 8);

        roundedRect(x, y, specCardW, specCardH, 8, COLORS.premiumSoft);
        text(String(s[0]), x + 16, y + 12, {
          font: F.semi,
          size: 9,
          color: COLORS.premium,
          characterSpacing: 0.5,
        });
        text(safe(s[1]), x + 16, y + 30, {
          font: F.semi,
          size: 13,
          color: COLORS.ink,
          width: specCardW - 32,
        });
      });
    }

    drawPageFooter(3);

    // ============================================================
    // PAGE 4 — MOT HISTORY
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    icon('shield', PAGE.margin, cursorY + 4, 28, COLORS.brand);
    text('MOT history', PAGE.margin + 40, cursorY, {
      font: F.bold,
      size: 22,
      color: COLORS.ink,
      width: PAGE.contentWidth - 40,
    });
    cursorY += 50;

    const motHistory = Array.isArray(data?.motHistory) ? data.motHistory : [];
    const motShow = isPremium ? motHistory.slice(0, 10) : motHistory.slice(0, 3);

    if (motShow.length === 0) {
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, 80, 10, COLORS.bg);
      icon('info', PAGE.margin + 24, cursorY + 28, 24, COLORS.muted);
      text('No MOT history available for this vehicle.', PAGE.margin + 60, cursorY + 32, {
        font: F.semi,
        size: 12,
        color: COLORS.muted,
        width: PAGE.contentWidth - 80,
      });
    } else {
      motShow.forEach((mot: any) => {
        const result = String(mot?.TestResult || mot?.testResult || '').toLowerCase();
        const passed = result.includes('pass');
        const c = passed
          ? { fg: COLORS.success, bg: COLORS.successSoft }
          : { fg: COLORS.danger, bg: COLORS.dangerSoft };

        const itemH = 60;
        roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, itemH, 10, COLORS.cardBg, COLORS.border);

        // Status pill on left
        roundedRect(PAGE.margin + 16, cursorY + 18, 60, 24, 12, c.bg);
        text(passed ? 'PASS' : 'FAIL', PAGE.margin + 16, cursorY + 24, {
          font: F.bold,
          size: 10,
          color: c.fg,
          width: 60,
          align: 'center',
          characterSpacing: 1,
        });

        // Date and mileage
        text(safe(mot?.TestDate || mot?.completedDate), PAGE.margin + 96, cursorY + 14, {
          font: F.semi,
          size: 12,
          color: COLORS.ink,
          width: PAGE.contentWidth - 120,
        });
        text(
          `Mileage: ${safe(mot?.OdometerValue || mot?.odometerValue)}`,
          PAGE.margin + 96,
          cursorY + 34,
          {
            font: F.regular,
            size: 10,
            color: COLORS.muted,
            width: PAGE.contentWidth - 120,
          },
        );

        cursorY += itemH + 8;
      });

      if (!isPremium && motHistory.length > 3) {
        roundedRect(PAGE.margin, cursorY + 8, PAGE.contentWidth, 50, 10, COLORS.brandSoft);
        icon('lock', PAGE.margin + 16, cursorY + 24, 18, COLORS.brand);
        text(
          `+ ${motHistory.length - 3} more records available in Premium`,
          PAGE.margin + 44,
          cursorY + 26,
          {
            font: F.semi,
            size: 11,
            color: COLORS.brand,
            width: PAGE.contentWidth - 60,
          },
        );
      }
    }

    drawPageFooter(4);

    // ============================================================
    // PAGE 5 — KEEPER HISTORY (PREMIUM) or UPSELL (STANDARD)
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    if (isPremium) {
      icon('history', PAGE.margin, cursorY + 4, 28, COLORS.premium);
      text('Keeper history', PAGE.margin + 40, cursorY, {
        font: F.bold,
        size: 22,
        color: COLORS.ink,
        width: PAGE.contentWidth - 40,
      });
      cursorY += 50;

      const keepers = Array.isArray(data?.keeperHistory) ? data.keeperHistory : [];

      if (keepers.length === 0) {
        roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, 80, 10, COLORS.bg);
        icon('info', PAGE.margin + 24, cursorY + 28, 24, COLORS.muted);
        text(
          'No keeper history available for this vehicle.',
          PAGE.margin + 60,
          cursorY + 32,
          {
            font: F.semi,
            size: 12,
            color: COLORS.muted,
            width: PAGE.contentWidth - 80,
          },
        );
      } else {
        keepers.forEach((k: any, i: number) => {
          const itemH = 56;
          roundedRect(
            PAGE.margin,
            cursorY,
            PAGE.contentWidth,
            itemH,
            10,
            COLORS.cardBg,
            COLORS.border,
          );

          // Number badge
          const badgeSize = 32;
          roundedRect(
            PAGE.margin + 16,
            cursorY + 12,
            badgeSize,
            badgeSize,
            16,
            COLORS.premiumSoft,
          );
          text(String(i + 1), PAGE.margin + 16, cursorY + 21, {
            font: F.bold,
            size: 13,
            color: COLORS.premium,
            width: badgeSize,
            align: 'center',
          });

          text(`Keeper ${i + 1}`, PAGE.margin + 64, cursorY + 12, {
            font: F.semi,
            size: 12,
            color: COLORS.ink,
            width: PAGE.contentWidth - 80,
          });
          text(
            `Acquired: ${safe(k?.DateOfTransaction || k?.date)}  •  ${safe(
              k?.NumberOfPreviousKeepers ?? k?.previousKeepers,
            )} previous keepers`,
            PAGE.margin + 64,
            cursorY + 30,
            {
              font: F.regular,
              size: 10,
              color: COLORS.muted,
              width: PAGE.contentWidth - 80,
            },
          );

          cursorY += itemH + 8;
        });
      }
    } else {
      // UPSELL PAGE
      icon('gauge', PAGE.margin, cursorY + 4, 28, COLORS.premium);
      text('Get the full picture', PAGE.margin + 40, cursorY, {
        font: F.bold,
        size: 22,
        color: COLORS.ink,
        width: PAGE.contentWidth - 40,
      });
      cursorY += 50;

      text(
        'Premium reports unlock the most important checks before you buy.',
        PAGE.margin,
        cursorY,
        {
          font: F.regular,
          size: 12,
          color: COLORS.muted,
          width: PAGE.contentWidth,
        },
      );
      cursorY += 36;

      const benefits = [
        { icon: 'shield', title: 'Outstanding finance check', desc: 'Find out if money is still owed on this vehicle.' },
        { icon: 'warning', title: 'Stolen vehicle check', desc: 'Verify against the national stolen vehicle database.' },
        { icon: 'cross', title: 'Insurance write-off check', desc: 'Reveal Cat A, B, S, or N write-off history.' },
        { icon: 'history', title: 'Full MOT & keeper history', desc: 'Up to 10 MOT records and complete ownership trail.' },
        { icon: 'gauge', title: 'Mileage anomaly detection', desc: 'Spot mileage discrepancies and clocked vehicles.' },
      ];

      benefits.forEach((b) => {
        const itemH = 60;
        roundedRect(
          PAGE.margin,
          cursorY,
          PAGE.contentWidth,
          itemH,
          10,
          COLORS.cardBg,
          COLORS.border,
        );

        roundedRect(PAGE.margin + 16, cursorY + 14, 32, 32, 16, COLORS.premiumSoft);
        icon(b.icon, PAGE.margin + 16 + 4, cursorY + 14 + 4, 24, COLORS.premium);

        text(b.title, PAGE.margin + 64, cursorY + 14, {
          font: F.bold,
          size: 12,
          color: COLORS.ink,
          width: PAGE.contentWidth - 80,
        });
        text(b.desc, PAGE.margin + 64, cursorY + 32, {
          font: F.regular,
          size: 10,
          color: COLORS.muted,
          width: PAGE.contentWidth - 80,
        });

        cursorY += itemH + 8;
      });

      cursorY += 20;
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, 80, 12, COLORS.brand);

      text('Upgrade now at CheapRegCheck.com', PAGE.margin, cursorY + 24, {
        font: F.bold,
        size: 16,
        color: COLORS.white,
        width: PAGE.contentWidth,
        align: 'center',
      });
      text('Get instant access to your complete vehicle report.', PAGE.margin, cursorY + 50, {
        font: F.regular,
        size: 11,
        color: '#cbd5e1',
        width: PAGE.contentWidth,
        align: 'center',
      });
    }

    drawPageFooter(5);

    // ============================================================
    // PAGE 6 — DISCLAIMER
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    icon('info', PAGE.margin, cursorY + 4, 28, COLORS.muted);
    text('About this report', PAGE.margin + 40, cursorY, {
      font: F.bold,
      size: 22,
      color: COLORS.ink,
      width: PAGE.contentWidth - 40,
    });
    cursorY += 50;

    const disclaimers = [
      {
        title: 'Data sources',
        body: 'This report compiles data from the DVLA (Driver and Vehicle Licensing Agency), the DVSA MOT history service, and licensed third-party data providers including stolen vehicle databases and finance registries.',
      },
      {
        title: 'Accuracy',
        body: 'CheapRegCheck makes every effort to ensure the data provided is accurate at the time of generation. However, we rely on third-party data and cannot guarantee its completeness or accuracy. This report is provided for informational purposes only.',
      },
      {
        title: 'Liability',
        body: 'CheapRegCheck and its operators are not liable for any decision made based on this report. We strongly recommend an independent inspection by a qualified mechanic before purchasing any used vehicle.',
      },
      {
        title: 'Report validity',
        body: 'The information in this report is accurate as of the generation date shown on the cover. Vehicle status (tax, MOT, finance) can change at any time. For time-sensitive decisions, generate a fresh report.',
      },
    ];

    disclaimers.forEach((d) => {
      text(d.title, PAGE.margin, cursorY, {
        font: F.semi,
        size: 12,
        color: COLORS.ink,
        width: PAGE.contentWidth,
      });
      cursorY += 18;
      text(d.body, PAGE.margin, cursorY, {
        font: F.regular,
        size: 10,
        color: COLORS.text,
        width: PAGE.contentWidth,
      });
      cursorY += doc.heightOfString(d.body, {
        width: PAGE.contentWidth,
      }) + 18;
    });

    cursorY += 20;
    roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, 60, 10, COLORS.bg);
    text(`Report ID: ${reg}-${Date.now()}`, PAGE.margin, cursorY + 14, {
      font: F.regular,
      size: 9,
      color: COLORS.muted,
      width: PAGE.contentWidth,
      align: 'center',
    });
    text('Thank you for using CheapRegCheck', PAGE.margin, cursorY + 32, {
      font: F.semi,
      size: 11,
      color: COLORS.brand,
      width: PAGE.contentWidth,
      align: 'center',
    });

    drawPageFooter(6);

    doc.end();
  });
}
}