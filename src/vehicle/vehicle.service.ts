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
  const crypto = require('crypto');

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
    // BRAND COLOURS — matched to frontend CSS variables
    // ============================================================
    const C = {
      green:       '#16a34a',
      greenMid:    '#22c55e',
      greenDark:   '#14532d',
      greenPale:   '#f0fdf4',
      greenSoft:   '#dcfce7',
      amber:       '#d97706',
      amberPale:   '#fffbeb',
      amberSoft:   '#fef3c7',
      red:         '#dc2626',
      redPale:     '#fff1f2',
      redSoft:     '#fee2e2',
      blue:        '#1d4ed8',
      bluePale:    '#eff6ff',
      plate:       '#F8D347',
      plateBlue:   '#1a237e',
      bg:          '#f2f2f7',
      card:        '#ffffff',
      surface:     '#f5f5f7',
      grouped:     '#e5e5ea',
      text:        '#1c1c1e',
      sub:         '#6c6c70',
      sub2:        '#aeaeb2',
      border:      '#e5e5ea',
      div:         '#ececec',
      ink:         '#0a0a0a',
      paper:       '#ffffff',
    };

    const PAGE = {
      width: 595.28,
      height: 841.89,
      margin: 40,
      contentWidth: 515.28,
    };

    // ============================================================
    // FONTS — DM Sans + Instrument Serif
    // ============================================================
    const fontDir = path.join(process.cwd(), 'assets', 'fonts');
    const fSansR = path.join(fontDir, 'DMSans-Regular.ttf');
    const fSansM = path.join(fontDir, 'DMSans-Medium.ttf');
    const fSansB = path.join(fontDir, 'DMSans-Bold.ttf');
    const fSerifR = path.join(fontDir, 'InstrumentSerif-Regular.ttf');
    const fSerifI = path.join(fontDir, 'InstrumentSerif-Italic.ttf');

    const hasSans = fs.existsSync(fSansR) && fs.existsSync(fSansM) && fs.existsSync(fSansB);
    const hasSerif = fs.existsSync(fSerifR) && fs.existsSync(fSerifI);

    if (hasSans) {
      doc.registerFont('Sans', fSansR);
      doc.registerFont('SansMed', fSansM);
      doc.registerFont('SansBold', fSansB);
    }
    if (hasSerif) {
      doc.registerFont('Serif', fSerifR);
      doc.registerFont('SerifItalic', fSerifI);
    }

    const F = {
      sans:     hasSans ? 'Sans' : 'Helvetica',
      sansMed:  hasSans ? 'SansMed' : 'Helvetica-Bold',
      sansBold: hasSans ? 'SansBold' : 'Helvetica-Bold',
      serif:    hasSerif ? 'Serif' : 'Times-Roman',
      serifIt:  hasSerif ? 'SerifItalic' : 'Times-Italic',
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

    // === RISK COMPUTATION ===
    let riskScore = 0;
    const issues: string[] = [];
    const positives: string[] = [];

    if (isPremium) {
      if (data?.finance === 'outstanding') { riskScore += 40; issues.push('Outstanding finance recorded'); }
      else if (data?.finance === 'clear') { positives.push('No outstanding finance'); }
      if (data?.stolen === 'yes') { riskScore += 50; issues.push('Vehicle reported stolen'); }
      else if (data?.stolen === 'no') { positives.push('Not reported stolen'); }
      if (data?.writeOff === 'yes') { riskScore += 30; issues.push('Insurance write-off recorded'); }
      else if (data?.writeOff === 'no') { positives.push('No write-off recorded'); }
    }
    if (v.motStatus && !motValid) { riskScore += 15; issues.push('MOT not currently valid'); }
    else if (motValid) { positives.push('MOT valid'); }
    if (v.taxStatus && !taxValid) { riskScore += 10; issues.push('Vehicle not currently taxed'); }
    else if (taxValid) { positives.push('Tax paid'); }

    const yearNow = new Date().getFullYear();
    const vYear = parseInt(String(v.year || 0));
    if (vYear && vYear > 1980) {
      const age = yearNow - vYear;
      if (age >= 15) { riskScore += 12; issues.push(`${age} years old — increased wear likely`); }
      else if (age >= 10) { riskScore += 6; }
      else if (age <= 3) { positives.push(`Only ${age} year${age === 1 ? '' : 's'} old`); }
    }

    const motTests = Array.isArray(data?.motHistory) ? data.motHistory : [];
    if (motTests.length > 0) {
      let failCount = 0;
      let advisoryCount = 0;
      motTests.forEach((mt: any) => {
        const txt = mt?.ResultText || '';
        const isPass = mt?.Result === true || String(txt).toLowerCase().includes('pass');
        if (!isPass) failCount++;
        const advs = mt?.AdvisoryNotices_V2 || mt?.AdvisoryNotices || [];
        if (Array.isArray(advs)) advisoryCount += advs.length;
      });
      const failRate = failCount / motTests.length;
      if (failRate >= 0.5) { riskScore += 18; issues.push(`${failCount} of ${motTests.length} MOTs failed`); }
      else if (failRate >= 0.25) { riskScore += 8; issues.push(`${failCount} MOT failure${failCount === 1 ? '' : 's'} on record`); }
      else if (failCount === 0 && motTests.length >= 3) { positives.push(`Clean MOT record across ${motTests.length} tests`); }
      if (advisoryCount >= 15) { riskScore += 10; issues.push(`${advisoryCount} MOT advisories recorded`); }
      else if (advisoryCount >= 6) { riskScore += 4; }
    }

    if (motTests.length >= 2) {
      const sorted = motTests
        .filter((m: any) => m?.OdometerModel?.OdometerReading)
        .sort((a: any, b: any) => new Date(a.DateOfTest).getTime() - new Date(b.DateOfTest).getTime());
      let rollback = false;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].OdometerModel.OdometerReading < sorted[i - 1].OdometerModel.OdometerReading) { rollback = true; break; }
      }
      if (rollback) { riskScore += 25; issues.push('Possible mileage rollback detected'); }
    }

    if (isPremium) {
      const keepers = Array.isArray(data?.keeperHistory) ? data.keeperHistory : [];
      if (keepers.length >= 6) { riskScore += 8; issues.push(`${keepers.length} previous keepers`); }
      else if (keepers.length <= 2 && keepers.length > 0) { positives.push(`Only ${keepers.length} keeper${keepers.length === 1 ? '' : 's'}`); }
    }
    if (riskScore > 100) riskScore = 100;

    let riskLevel = 'LOW';
    let riskFg = C.green;
    let riskSoft = C.greenSoft;
    let verdict = 'No major issues detected';
    if (riskScore >= 60) { riskLevel = 'HIGH'; riskFg = C.red; riskSoft = C.redSoft; verdict = 'Caution advised — issues found'; }
    else if (riskScore >= 30) { riskLevel = 'MEDIUM'; riskFg = C.amber; riskSoft = C.amberSoft; verdict = 'Some concerns identified'; }

    const tierLabel = isPremium ? 'Premium' : isStandard ? 'Standard' : 'Free';
    const docId = crypto.createHash('sha1').update(`${reg}-${Date.now()}-${tier}`).digest('hex').substring(0, 12).toUpperCase();
    const genDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // ============================================================
    // PRIMITIVES
    // ============================================================
    const text = (str: string, x: number, y: number, opts: any = {}) => {
      doc.font(opts.font || F.sans).fontSize(opts.size || 11).fillColor(opts.color || C.text)
        .text(str, x, y, { width: opts.width || PAGE.contentWidth, align: opts.align || 'left', ...opts });
    };
    const fillRect = (x: number, y: number, w: number, h: number, color: string) => {
      doc.rect(x, y, w, h).fillColor(color).fill();
    };
    const roundedRect = (x: number, y: number, w: number, h: number, r: number, fillColor?: string, strokeColor?: string, sw = 1) => {
      doc.roundedRect(x, y, w, h, r);
      if (fillColor && strokeColor) doc.fillColor(fillColor).strokeColor(strokeColor).lineWidth(sw).fillAndStroke();
      else if (fillColor) doc.fillColor(fillColor).fill();
      else if (strokeColor) doc.strokeColor(strokeColor).lineWidth(sw).stroke();
    };
    const safe = (val: any): string => {
      if (val === null || val === undefined || val === '' || val === 'Unknown') return 'Not available';
      return String(val);
    };
    const fmtDate = (d: any): string => {
      if (!d) return 'Not available';
      try {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return 'Not available';
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch { return 'Not available'; }
    };
    // Strip "cc" suffix if present, for engine capacity
    const cleanCc = (val: any): string => {
      if (!val) return '';
      return String(val).replace(/\s*cc\s*$/i, '').trim();
    };
    // Status label primitive — replaces broken emoji glyphs
    const statusLabel = (state: string): string => {
      if (state === 'ok') return 'OK';
      if (state === 'warn') return 'CHECK';
      if (state === 'fail') return 'FAIL';
      if (state === 'locked') return 'LOCKED';
      return 'N/A';
    };

    // ============================================================
    // PAGE 1 — COVER
    // ============================================================
    fillRect(0, 0, PAGE.width, PAGE.height, C.paper);
    fillRect(0, 480, PAGE.width, PAGE.height - 480, C.bg);

    // Logo
    const logoPath = path.join(process.cwd(), 'assets', 'logo-light.png');
    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, PAGE.width / 2 - 60, 70, { width: 120 }); } catch {}
    } else {
      text('CheapReg', 0, 90, { font: F.serif, size: 36, color: C.text, width: PAGE.width, align: 'center' });
    }

    // Tier pill
    const pillTxt = `${tierLabel} report`;
    const pillBg = isPremium ? C.amberSoft : isStandard ? C.greenSoft : C.grouped;
    const pillFg = isPremium ? C.amber : isStandard ? C.green : C.sub;
    doc.font(F.sansBold).fontSize(10);
    const pillW = doc.widthOfString(pillTxt) + 24;
    const pillX = (PAGE.width - pillW) / 2;
    roundedRect(pillX, 220, pillW, 22, 11, pillBg);
    text(pillTxt, pillX, 226, { font: F.sansBold, size: 10, color: pillFg, width: pillW, align: 'center' });

    // Headline
    text("Your vehicle's", 0, 270, { font: F.serif, size: 38, color: C.text, width: PAGE.width, align: 'center' });
    text('complete history', 0, 312, { font: F.serifIt, size: 44, color: C.green, width: PAGE.width, align: 'center' });

    // Yellow plate graphic
    const plateW = 280;
    const plateH = 64;
    const plateX = (PAGE.width - plateW) / 2;
    const plateY = 380;
    roundedRect(plateX, plateY, plateW, plateH, 10, C.plate, C.text, 2);
    fillRect(plateX, plateY, 36, plateH, C.plateBlue);
    roundedRect(plateX, plateY, 36, plateH, 10, C.plateBlue);
    fillRect(plateX + 18, plateY, 18, plateH, C.plateBlue);
    text('GB', plateX, plateY + 24, { font: F.sansBold, size: 12, color: C.paper, width: 36, align: 'center' });
    text(reg.toUpperCase(), plateX + 36, plateY + 14, { font: F.sansBold, size: 32, color: C.text, width: plateW - 36, align: 'center', characterSpacing: 2 });

    // Vehicle line
    const vehicleHeadline = [v.year, v.make, v.model].filter((x) => x && x !== 'Unknown').join(' ');
    if (vehicleHeadline) {
      text(vehicleHeadline, 0, 470, { font: F.sansMed, size: 18, color: C.sub, width: PAGE.width, align: 'center' });
    }

    // Risk verdict card (white card on grey bg)
    const vCardW = 440;
    const vCardH = 130;
    const vCardX = (PAGE.width - vCardW) / 2;
    const vCardY = 540;
    roundedRect(vCardX, vCardY, vCardW, vCardH, 18, C.card, C.border);

    const badgeW = 100;
    const badgeH = 26;
    const badgeX = vCardX + (vCardW - badgeW) / 2;
    roundedRect(badgeX, vCardY + 20, badgeW, badgeH, 13, riskSoft);
    text(riskLevel + ' RISK', badgeX, vCardY + 27, { font: F.sansBold, size: 10, color: riskFg, width: badgeW, align: 'center', characterSpacing: 1 });
    text(verdict, vCardX, vCardY + 60, { font: F.sansMed, size: 14, color: C.text, width: vCardW, align: 'center' });
    text(`Risk score: ${riskScore} / 100`, vCardX, vCardY + 88, { font: F.sans, size: 11, color: C.sub, width: vCardW, align: 'center' });

    // Cover teaser line — what's inside this report
    const teaserBits: string[] = [];
    teaserBits.push(`${motTests.length} MOT record${motTests.length === 1 ? '' : 's'}`);
    if (isPremium) {
      const keepers = Array.isArray(data?.keeperHistory) ? data.keeperHistory : [];
      if (keepers.length > 0) teaserBits.push(`${keepers.length} keeper${keepers.length === 1 ? '' : 's'}`);
    }
    teaserBits.push('6 pages');
    text(teaserBits.join('  ·  '), 0, 690, { font: F.sans, size: 11, color: C.sub, width: PAGE.width, align: 'center' });

    // Footer
    text(`Generated on ${genDate}`, 0, 760, { font: F.sans, size: 10, color: C.sub2, width: PAGE.width, align: 'center' });
    text('cheapregcheck.com', 0, 778, { font: F.sansMed, size: 11, color: C.green, width: PAGE.width, align: 'center' });

    // ============================================================
    // PAGE HEADER (subsequent pages)
    // ============================================================
    const drawPageHeader = () => {
      fillRect(0, 0, PAGE.width, 50, C.paper);
      doc.strokeColor(C.div).lineWidth(0.5).moveTo(0, 50).lineTo(PAGE.width, 50).stroke();
      if (fs.existsSync(logoPath)) {
        try { doc.image(logoPath, PAGE.margin, 14, { width: 70 }); } catch {}
      } else {
        text('CheapRegCheck', PAGE.margin, 22, { font: F.sansBold, size: 12, color: C.text, width: 200 });
      }
      text(`${reg.toUpperCase()} · ${tierLabel}`, 0, 22, { font: F.sansMed, size: 10, color: C.sub, width: PAGE.width - PAGE.margin, align: 'right' });
    };

    const drawPageFooter = (pageNum: number, totalPages: number) => {
      const y = PAGE.height - 30;
      doc.strokeColor(C.div).lineWidth(0.5).moveTo(PAGE.margin, y - 10).lineTo(PAGE.width - PAGE.margin, y - 10).stroke();
      text('cheapregcheck.com', PAGE.margin, y, { font: F.sansMed, size: 9, color: C.green, width: 200 });
      text(`Page ${pageNum} of ${totalPages}`, PAGE.width - PAGE.margin - 100, y, { font: F.sans, size: 9, color: C.sub, width: 100, align: 'right' });
    };

    // ============================================================
    // PAGE 2 — AT A GLANCE
    // ============================================================
    doc.addPage();
    drawPageHeader();

    let cursorY = 80;
    text('At a glance', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    text('Quick summary of all key checks for this vehicle', PAGE.margin, cursorY + 38, { font: F.sans, size: 11, color: C.sub, width: PAGE.contentWidth });
    cursorY += 80;

    // Risk gauge card — repositioned with hero number on left, gauge full-width on right
    const gCardH = 180;
    roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, gCardH, 18, C.card, C.border);

    text('Overall risk assessment', PAGE.margin + 22, cursorY + 20, { font: F.sansMed, size: 11, color: C.sub });

    // HERO NUMBER on the left
    text(String(riskScore), PAGE.margin + 22, cursorY + 44, { font: F.serif, size: 64, color: riskFg });
    // "/100" and risk level next to it
    text('/ 100', PAGE.margin + 22 + 80, cursorY + 80, { font: F.sansMed, size: 14, color: C.sub });

    // Risk level pill below number
    const lvlBadgeW = 90;
    const lvlBadgeH = 24;
    roundedRect(PAGE.margin + 22, cursorY + 122, lvlBadgeW, lvlBadgeH, 12, riskSoft);
    text(riskLevel + ' RISK', PAGE.margin + 22, cursorY + 128, { font: F.sansBold, size: 10, color: riskFg, width: lvlBadgeW, align: 'center', characterSpacing: 1 });

    // Verdict text
    text(verdict, PAGE.margin + 22, cursorY + 152, { font: F.sansMed, size: 11, color: C.text, width: PAGE.contentWidth - 44 });

    // GAUGE on the right — taller, more visual
    const gX = PAGE.margin + 200;
    const gY = cursorY + 60;
    const gW = PAGE.contentWidth - 220;
    const gH = 22;
    // Background bar
    roundedRect(gX, gY, gW, gH, 11, C.surface);
    // Filled portion with gradient effect (use main risk colour)
    const fillPct = riskScore / 100;
    const fillW = (gW - 4) * fillPct;
    if (fillW > 4) {
      roundedRect(gX + 2, gY + 2, fillW, gH - 4, 9, riskFg);
    }
    // Indicator marker
    const indX = gX + (gW * riskScore) / 100;
    if (riskScore > 0) {
      doc.polygon([indX - 6, gY - 5], [indX + 6, gY - 5], [indX, gY + 3]).fillColor(riskFg).fill();
    }
    // Scale labels below
    text('0', gX, gY + 32, { font: F.sans, size: 9, color: C.sub2, width: 30 });
    text('LOW', gX + gW * 0.15 - 15, gY + 32, { font: F.sansMed, size: 9, color: C.green, width: 30, align: 'center' });
    text('MEDIUM', gX + gW * 0.45 - 25, gY + 32, { font: F.sansMed, size: 9, color: C.amber, width: 50, align: 'center' });
    text('HIGH', gX + gW * 0.8 - 15, gY + 32, { font: F.sansMed, size: 9, color: C.red, width: 30, align: 'center' });
    text('100', gX + gW - 30, gY + 32, { font: F.sans, size: 9, color: C.sub2, width: 30, align: 'right' });

    cursorY += gCardH + 20;

    // Status grid 2x3 with TEXT LABELS instead of broken emoji
    const checks = [
      { label: 'Finance', state: isPremium ? (data?.finance === 'outstanding' ? 'warn' : data?.finance === 'clear' ? 'ok' : 'unknown') : 'locked',
        msg: isPremium ? (data?.finance === 'outstanding' ? 'Outstanding' : data?.finance === 'clear' ? 'Clear' : 'Unknown') : 'Premium only' },
      { label: 'Stolen', state: isPremium ? (data?.stolen === 'yes' ? 'warn' : data?.stolen === 'no' ? 'ok' : 'unknown') : 'locked',
        msg: isPremium ? (data?.stolen === 'yes' ? 'Reported stolen' : data?.stolen === 'no' ? 'Not stolen' : 'Unknown') : 'Premium only' },
      { label: 'Write-off', state: isPremium ? (data?.writeOff === 'yes' ? 'warn' : data?.writeOff === 'no' ? 'ok' : 'unknown') : 'locked',
        msg: isPremium ? (data?.writeOff === 'yes' ? 'Recorded' : data?.writeOff === 'no' ? 'No record' : 'Unknown') : 'Premium only' },
      { label: 'MOT', state: motValid ? 'ok' : v.motStatus ? 'warn' : 'unknown', msg: safe(v.motStatus) },
      { label: 'Tax', state: taxValid ? 'ok' : v.taxStatus ? 'warn' : 'unknown', msg: safe(v.taxStatus) },
      { label: 'Export', state: v.markedForExport ? 'warn' : 'ok', msg: v.markedForExport ? 'Marked' : 'Not exported' },
    ];
    const stateColor = (s: string) =>
      s === 'ok' ? { fg: C.green, bg: C.greenPale }
      : s === 'warn' ? { fg: C.red, bg: C.redPale }
      : s === 'locked' ? { fg: C.sub, bg: C.surface }
      : { fg: C.amber, bg: C.amberPale };

    const cardW = (PAGE.contentWidth - 20) / 3;
    const cardH = 96;
    checks.forEach((c, i) => {
      const col = i % 3;
      const rowI = Math.floor(i / 3);
      const x = PAGE.margin + col * (cardW + 10);
      const y = cursorY + rowI * (cardH + 10);
      const cl = stateColor(c.state);
      roundedRect(x, y, cardW, cardH, 14, C.card, C.border);

      // Status pill (text instead of emoji)
      doc.font(F.sansBold).fontSize(8);
      const sLabel = statusLabel(c.state);
      const sW = doc.widthOfString(sLabel) + 16;
      roundedRect(x + 16, y + 16, sW, 20, 10, cl.bg);
      text(sLabel, x + 16, y + 21, { font: F.sansBold, size: 8, color: cl.fg, width: sW, align: 'center', characterSpacing: 1 });

      text(c.label, x + 16, y + 50, { font: F.sansMed, size: 10, color: C.sub, width: cardW - 32 });
      text(c.msg, x + 16, y + 66, { font: F.sansBold, size: 12, color: C.text, width: cardW - 32 });
    });
    cursorY += cardH * 2 + 30;

    // Issues / positives summary — bullet character replaced with simple text
    if (issues.length > 0 || positives.length > 0) {
      const sumH = Math.max(positives.length, issues.length) * 18 + 50;
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, sumH, 14, C.surface);
      const colW = (PAGE.contentWidth - 32) / 2;

      if (positives.length > 0) {
        text('What looks good', PAGE.margin + 16, cursorY + 16, { font: F.sansMed, size: 11, color: C.green, width: colW });
        positives.forEach((p, i) => {
          // Green dot
          doc.circle(PAGE.margin + 22, cursorY + 44 + i * 18, 3).fillColor(C.green).fill();
          text(p, PAGE.margin + 32, cursorY + 38 + i * 18, { font: F.sans, size: 10, color: C.text, width: colW - 24 });
        });
      }
      if (issues.length > 0) {
        const ix = PAGE.margin + colW + 16;
        text('Things to check', ix, cursorY + 16, { font: F.sansMed, size: 11, color: C.red, width: colW });
        issues.forEach((p, i) => {
          // Red dot
          doc.circle(ix + 6, cursorY + 44 + i * 18, 3).fillColor(C.red).fill();
          text(p, ix + 16, cursorY + 38 + i * 18, { font: F.sans, size: 10, color: C.text, width: colW - 24 });
        });
      }
    }

    drawPageFooter(2, 6);

    // ============================================================
    // PAGE 3 — VEHICLE DETAILS (expanded for both tiers)
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    text('Vehicle details', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    cursorY += 50;

    // Build specs — more useful fields for Standard tier (using only data already present)
    const specs: [string, any][] = [
      ['Registration', v.reg || reg],
      ['Make', v.make],
      ['Model', v.model],
      ['Year', v.year],
      ['Fuel type', v.fuel],
      ['Colour', v.colour],
      ['Engine', v.engineCapacity ? `${cleanCc(v.engineCapacity)} cc` : null],
      ['CO2 emissions', v.co2 ? `${v.co2} g/km` : null],
    ];

    // Add tax/MOT status for ALL tiers (data already there)
    if (v.motStatus) {
      specs.push(['MOT status', v.motStatus]);
    }
    if (v.taxStatus) {
      specs.push(['Tax status', v.taxStatus]);
    }
    if (v.motDaysLeft !== undefined && v.motDaysLeft !== null) {
      specs.push(['MOT days remaining', String(v.motDaysLeft)]);
    }
    if (v.taxDaysLeft !== undefined && v.taxDaysLeft !== null) {
      specs.push(['Tax days remaining', String(v.taxDaysLeft)]);
    }

    if (isPremium) {
      specs.push(
        ['Body style', v.bodyStyle],
        ['Tax band', v.taxBand],
        ['Annual tax', v.annualTax ? `£${v.annualTax}` : null],
        ['Latest odometer', v.averageMileage ? `${Number(v.averageMileage).toLocaleString('en-GB')} mi` : null],
      );
    }

    const specCardW = (PAGE.contentWidth - 16) / 2;
    const specCardH = 56;
    specs.forEach((s, i) => {
      const col = i % 2;
      const rowI = Math.floor(i / 2);
      const x = PAGE.margin + col * (specCardW + 16);
      const y = cursorY + rowI * (specCardH + 8);
      roundedRect(x, y, specCardW, specCardH, 12, C.surface);
      text(String(s[0]), x + 14, y + 10, { font: F.sansMed, size: 9, color: C.sub, width: specCardW - 28 });
      text(safe(s[1]), x + 14, y + 28, { font: F.sansMed, size: 13, color: C.text, width: specCardW - 28 });
    });

    drawPageFooter(3, 6);

    // ============================================================
    // PAGE 4 — MOT HISTORY
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    text('MOT history', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    cursorY += 50;

    const motHistoryRaw = Array.isArray(data?.motHistory) ? data.motHistory : [];
    const motSorted = [...motHistoryRaw].sort((a: any, b: any) => new Date(b.DateOfTest || 0).getTime() - new Date(a.DateOfTest || 0).getTime());
    const motShow = isPremium ? motSorted.slice(0, 10) : motSorted.slice(0, 3);

    if (motShow.length === 0) {
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, 80, 14, C.surface);
      text('No MOT history available for this vehicle.', PAGE.margin + 24, cursorY + 32, { font: F.sansMed, size: 12, color: C.sub, width: PAGE.contentWidth - 48 });
    } else {
      motShow.forEach((mot: any) => {
        const resultText = mot?.ResultText || mot?.TestResult || '';
        const passed = mot?.Result === true || String(resultText).toLowerCase().includes('pass');
        const c = passed ? { fg: C.green, bg: C.greenSoft } : { fg: C.red, bg: C.redSoft };

        const itemH = 64;
        roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, itemH, 14, C.card, C.border);

        roundedRect(PAGE.margin + 16, cursorY + 18, 60, 24, 12, c.bg);
        text(passed ? 'PASS' : 'FAIL', PAGE.margin + 16, cursorY + 25, { font: F.sansBold, size: 10, color: c.fg, width: 60, align: 'center', characterSpacing: 1 });

        text(fmtDate(mot?.DateOfTest), PAGE.margin + 96, cursorY + 14, { font: F.sansMed, size: 12, color: C.text, width: PAGE.contentWidth - 120 });

        const odo = mot?.OdometerModel?.OdometerReading;
        const odoStr = odo ? `${Number(odo).toLocaleString('en-GB')} miles` : 'Not recorded';
        text(odoStr, PAGE.margin + 96, cursorY + 34, { font: F.sans, size: 10, color: C.sub, width: 200 });

        if (mot?.TestExpiryDate && passed) {
          text(`Expires ${fmtDate(mot.TestExpiryDate)}`, PAGE.margin + 96, cursorY + 34, { font: F.sans, size: 10, color: C.sub, width: PAGE.contentWidth - 120 - 16, align: 'right' });
        }

        cursorY += itemH + 8;
      });

      if (!isPremium && motHistoryRaw.length > 3) {
        roundedRect(PAGE.margin, cursorY + 8, PAGE.contentWidth, 50, 14, C.amberPale, C.amberSoft, 1);
        text(`[Locked]   ${motHistoryRaw.length - 3} more MOT records available with Premium`, PAGE.margin + 16, cursorY + 26, { font: F.sansMed, size: 11, color: C.amber, width: PAGE.contentWidth - 32 });
      }
    }

    drawPageFooter(4, 6);

    // ============================================================
    // PAGE 5 — KEEPER HISTORY (Premium) or UPSELL (Standard)
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    if (isPremium) {
      text('Keeper history', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
      cursorY += 50;

      const keepers = Array.isArray(data?.keeperHistory) ? data.keeperHistory : [];
      if (keepers.length === 0) {
        roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, 80, 14, C.surface);
        text('No keeper history available.', PAGE.margin + 24, cursorY + 32, { font: F.sansMed, size: 12, color: C.sub, width: PAGE.contentWidth - 48 });
      } else {
        keepers.forEach((k: any, i: number) => {
          const itemH = 56;
          roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, itemH, 14, C.card, C.border);
          roundedRect(PAGE.margin + 16, cursorY + 12, 32, 32, 16, C.greenSoft);
          text(String(i + 1), PAGE.margin + 16, cursorY + 21, { font: F.sansBold, size: 13, color: C.green, width: 32, align: 'center' });
          text(`Keeper ${i + 1}`, PAGE.margin + 64, cursorY + 14, { font: F.sansMed, size: 12, color: C.text, width: PAGE.contentWidth - 80 });
          const dateStr = fmtDate(k?.DateOfLastKeeperChange || k?.DateOfTransaction || k?.date);
          text(`Transferred: ${dateStr}`, PAGE.margin + 64, cursorY + 32, { font: F.sans, size: 10, color: C.sub, width: PAGE.contentWidth - 80 });
          cursorY += itemH + 8;
        });
      }
    } else {
      text('Get the full picture', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
      cursorY += 50;
      text('Premium reports unlock the most important checks before you buy.', PAGE.margin, cursorY, { font: F.sans, size: 12, color: C.sub, width: PAGE.contentWidth });
      cursorY += 36;

      const benefits = [
        { title: 'Outstanding finance check', desc: 'Find out if money is still owed on this vehicle.' },
        { title: 'Stolen vehicle check', desc: 'Verify against the national stolen vehicle database.' },
        { title: 'Insurance write-off check', desc: 'Reveal Cat A, B, S, or N write-off history.' },
        { title: 'Full MOT & keeper history', desc: 'Up to 10 MOT records and complete ownership trail.' },
        { title: 'Mileage anomaly detection', desc: 'Spot mileage discrepancies and clocked vehicles.' },
      ];
      benefits.forEach((b) => {
        const itemH = 56;
        roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, itemH, 14, C.card, C.border);
        // Green dot (drawn, not glyph)
        doc.circle(PAGE.margin + 30, cursorY + 28, 6).fillColor(C.green).fill();
        text(b.title, PAGE.margin + 56, cursorY + 14, { font: F.sansBold, size: 12, color: C.text, width: PAGE.contentWidth - 72 });
        text(b.desc, PAGE.margin + 56, cursorY + 32, { font: F.sans, size: 10, color: C.sub, width: PAGE.contentWidth - 72 });
        cursorY += itemH + 8;
      });

      cursorY += 16;
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, 80, 18, C.green);
      text('Upgrade for £3 at cheapregcheck.com', PAGE.margin, cursorY + 24, { font: F.sansBold, size: 16, color: C.paper, width: PAGE.contentWidth, align: 'center' });
      text('Same registration  ·  Instant unlock  ·  Secure payment', PAGE.margin, cursorY + 50, { font: F.sans, size: 11, color: C.greenPale, width: PAGE.contentWidth, align: 'center' });
    }

    drawPageFooter(5, 6);

    // ============================================================
    // PAGE 6 — DISCLAIMER
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    text('About this report', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    cursorY += 50;

    const disclaimers = [
      { title: 'Data sources', body: 'This report compiles data from the DVLA, the DVSA MOT history service, and licensed third-party data providers including stolen vehicle databases and finance registries.' },
      { title: 'Accuracy', body: 'CheapRegCheck makes every effort to ensure the data is accurate at the time of generation. We rely on third-party data and cannot guarantee its completeness. This report is for informational purposes only.' },
      { title: 'Liability', body: 'CheapRegCheck and its operators are not liable for any decision made based on this report. We strongly recommend an independent inspection by a qualified mechanic before purchasing any used vehicle.' },
      { title: 'Validity', body: 'The information is accurate as of the generation date shown on the cover. Vehicle status (tax, MOT, finance) can change at any time. For time-sensitive decisions, generate a fresh report.' },
    ];

    disclaimers.forEach((d) => {
      text(d.title, PAGE.margin, cursorY, { font: F.sansBold, size: 13, color: C.text, width: PAGE.contentWidth });
      cursorY += 20;
      text(d.body, PAGE.margin, cursorY, { font: F.sans, size: 10, color: C.text, width: PAGE.contentWidth, lineGap: 3 });
      cursorY += doc.heightOfString(d.body, { width: PAGE.contentWidth, lineGap: 3 }) + 18;
    });

    cursorY += 10;
    roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, 60, 14, C.surface);
    text(`Report ID: ${docId}`, PAGE.margin, cursorY + 14, { font: F.sans, size: 9, color: C.sub, width: PAGE.contentWidth, align: 'center' });
    text('Thank you for using CheapRegCheck', PAGE.margin, cursorY + 32, { font: F.sansMed, size: 11, color: C.green, width: PAGE.contentWidth, align: 'center' });

    drawPageFooter(6, 6);

    doc.end();
  });
}
}