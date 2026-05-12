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
import { computeBuyerVerdict } from './buyer-verdict';

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

    // Helper: coerce API placeholders ('...', '', undefined, null) to null
    const clean = (v: any) => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed === '' || trimmed === '...') return null;
        return trimmed;
      }
      return v;
    };

    const keeperHistoryArr = vehicle?.KeeperHistory || [];
    const latestKeeper = keeperHistoryArr[0] || {};

    return {
      tier: 'standard',
      vehicle: {
        reg,

       // ── Identity ──
        make: clean(vehicle?.Make) || 'Unknown',
        model: clean(vehicle?.Model) || 'Unknown',
        yearOfManufacture: clean(vehicle?.YearOfManufacture),
        colour: clean(vehicle?.Colour),
        originalColour: clean(vehicle?.OriginalColour),
        colourChanges: vehicle?.ColourChangesQuantity ?? null,
        fuelType: clean(vehicle?.FuelType),
        engineCapacity: clean(vehicle?.CylinderCapacity),
        co2: vehicle?.Co2Emissions ?? null,
        bodyStyle: clean(vehicle?.BodyStyle),
        vehicleType: clean(vehicle?.VehicleType),
        euroStatus: clean(vehicle?.EuroStatus),
        insuranceGroup: clean(vehicle?.InsuranceGroup),
        bhp: clean(vehicle?.Bhp),
        powerKw: clean(vehicle?.PowerKw),
        topSpeed: clean(vehicle?.TopSpeed),

       // ── Registration & status ──
        monthOfFirstRegistration: clean(vehicle?.DateOfFirstRegistration),
        dateOfLastV5CIssued: clean(vehicle?.DateOfLastV5CIssued),
        age: clean(vehicle?.Age),
        isImported: vehicle?.IsImported ?? false,
        markedForExport: vehicle?.Exported ?? false,
        isScrapped: vehicle?.IsScrapped ?? false,
        isVehicleSORN: vehicle?.IsVehicleSORN ?? false,

        // ── MOT detail ──
        motStatus: clean(vehicle?.MotStatusDescription),
        motDueDate: clean(vehicle?.DateMotDue),
        motDaysLeft: vehicle?.DaysLeftUntilMotDue ?? null,
        lastMotTestDate: clean(vehicle?.LastMotTestDate),
        motTestNumber: clean(vehicle?.MotTestNumber),
        mileageBetweenLastMotPasses: vehicle?.MileageBetweenLastMotPasses ?? null,
        mileageIssueIdentified: vehicle?.MotResultsSummary?.MileageIssueIdentified ?? false,
        mileageIssueSummary: clean(vehicle?.MotResultsSummary?.MileageIssueSummary),
        isMotDue: vehicle?.IsMOTDue ?? false,
        isMotNearExpiry: vehicle?.IsMOTNearExpiry ?? false,

       // ── Tax detail ──
        taxStatus: clean(vehicle?.RoadTaxStatusDescription),
        taxBand: clean(vehicle?.RoadTaxData?.Band),
        sixMonthRate: vehicle?.RoadTaxData?.SixMonthRate ?? null,
        taxAnnualRate: vehicle?.RoadTaxData?.TwelveMonthRate ?? null,
        taxDueDate: clean(vehicle?.DateRoadTaxDue),
        taxDaysLeft: vehicle?.DaysLeftUntilRoadTaxDue ?? null,
        isRoadTaxDue: vehicle?.IsRoadTaxDue ?? false,
        isRoadTaxNearExpiry: vehicle?.IsRoadTaxNearExpiry ?? false,

        // ── Mileage intelligence ──
        averageMileage: clean(vehicle?.AverageMileage),
        averageMileagePerYear: vehicle?.AverageMileagePerYear ?? null,

        // ── Keepers (derived from history) ──
        numberPreviousKeepers: latestKeeper?.NumberPreviousKeepers ?? null,
        dateOfLastKeeperChange: clean(latestKeeper?.DateOfLastKeeperChange),

        // ── Image ──
        vehicleImageUrl: clean(vehicle?.VehicleImageUrl),

        // ── Fuel economy (whole sub-object, pass-through) ──
        fuelEconomyData: vehicle?.FuelEconomyData ?? null,
      },

      motHistory:
        vehicle?.MotResultsSummary?.MotResults || [],

      keeperHistory:
        keeperHistoryArr,

      // ── Recalls (top-level) ──
      vehicleRecalls: vehicle?.VehicleRecalls ?? null,

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
      report = await this.getRccStandard(reg);

      report.buyerVerdict = computeBuyerVerdict({
        tier: 'standard',
        riskScore: report?.riskScore,
        writeOff: report?.writeOff,
        vehicle: report?.vehicle,
        motHistory: report?.motHistory,
        keeperHistory: report?.keeperHistory,
        vehicleRecalls: report?.vehicleRecalls,
        insights: report?.insights,
      });

      logger.info({
        event: 'STANDARD_REPORT_GENERATED',
        reg,
        tier: report?.tier,
        make: report?.vehicle?.make || 'N/A',
        model: report?.vehicle?.model || 'N/A',
        verdict: report?.buyerVerdict?.verdict,
      });
    }

  // PREMIUM
    else if (accessTier === 'premium') {
      const standard = await this.getRccStandard(reg);
      const { vehicle } = await this.fetchRccData(reg);
      const vdg = await this.getVDGData(reg);

      report = {
        ...standard,
        tier: 'premium',
        vehicle: {
          ...standard.vehicle,
          bodyStyle: vehicle?.BodyStyle || null,
          age: vehicle?.Age || null,
          taxBand: vehicle?.RoadTaxData?.Band || null,
          annualTax: vehicle?.RoadTaxData?.TwelveMonthRate || null,
          motDaysLeft: vehicle?.DaysLeftUntilMotDue || null,
          taxDaysLeft: vehicle?.DaysLeftUntilRoadTaxDue || null,
          averageMileage: vehicle?.AverageMileage || null,
        },
        finance: this.extractFinance(vdg),
        stolen: this.extractStolen(vdg),
        writeOff: this.extractWriteOff(vdg),
      };

      report.buyerVerdict = computeBuyerVerdict({
        tier: 'premium',
        riskScore: report.riskScore,
        writeOff: report.writeOff,
        finance: report.finance,
        stolen: report.stolen,
        vehicle: report.vehicle,
        motHistory: report.motHistory,
        keeperHistory: report.keeperHistory,
        vehicleRecalls: report.vehicleRecalls,
        insights: report.insights,
      });
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
    // BRAND COLOURS
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
      darkBg:      '#0f172a',
      darkMid:     '#1e293b',
      darkAccent:  '#334155',
    };

    const PAGE = {
      width: 595.28,
      height: 841.89,
      margin: 40,
      contentWidth: 515.28,
    };

    // ============================================================
    // FONT LOADING
    // ============================================================
    const fontDir = path.join(process.cwd(), 'assets', 'fonts');
    const fSansR = path.join(fontDir, 'DMSans-Regular.ttf');
    const fSansM = path.join(fontDir, 'DMSans-Medium.ttf');
    const fSansB = path.join(fontDir, 'DMSans-Bold.ttf');
    const fSerifR = path.join(fontDir, 'InstrumentSerif-Regular.ttf');
    const fSerifI = path.join(fontDir, 'InstrumentSerif-Italic.ttf');

    const hasSans = fs.existsSync(fSansR) && fs.existsSync(fSansM) && fs.existsSync(fSansB);
    const hasSerif = fs.existsSync(fSerifR) && fs.existsSync(fSerifI);

    console.log('[PDF] Font check — DM Sans:', hasSans, '| Instrument Serif:', hasSerif);

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

    const motHistory = Array.isArray(data?.motHistory) ? data.motHistory : [];
    const keeperHistory = Array.isArray(data?.keeperHistory) ? data.keeperHistory : [];

    // ============================================================
    // RISK COMPUTATION
    // ============================================================
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
    let vehicleAge = 0;
    if (vYear && vYear > 1980) {
      vehicleAge = yearNow - vYear;
      if (vehicleAge >= 15) { riskScore += 12; issues.push(`${vehicleAge} years old — increased wear likely`); }
      else if (vehicleAge >= 10) { riskScore += 6; }
      else if (vehicleAge <= 3) { positives.push(`Only ${vehicleAge} year${vehicleAge === 1 ? '' : 's'} old`); }
    }

    let motFailCount = 0;
    let motAdvisoryCount = 0;
    let motRollback = false;
    if (motHistory.length > 0) {
      motHistory.forEach((mt: any) => {
        const txt = mt?.ResultText || '';
        const isPass = mt?.Result === true || String(txt).toLowerCase().includes('pass');
        if (!isPass) motFailCount++;
        const advs = mt?.AdvisoryNotices_V2 || mt?.AdvisoryNotices || [];
        if (Array.isArray(advs)) motAdvisoryCount += advs.length;
      });
      const failRate = motFailCount / motHistory.length;
      if (failRate >= 0.5) { riskScore += 18; issues.push(`${motFailCount} of ${motHistory.length} MOTs failed`); }
      else if (failRate >= 0.25) { riskScore += 8; issues.push(`${motFailCount} MOT failure${motFailCount === 1 ? '' : 's'} on record`); }
      else if (motFailCount === 0 && motHistory.length >= 3) { positives.push(`Clean MOT record across ${motHistory.length} tests`); }
      if (motAdvisoryCount >= 15) { riskScore += 10; issues.push(`${motAdvisoryCount} MOT advisories recorded`); }
      else if (motAdvisoryCount >= 6) { riskScore += 4; }
    }

    if (motHistory.length >= 2) {
      const sorted = motHistory
        .filter((m: any) => m?.OdometerModel?.OdometerReading)
        .sort((a: any, b: any) => new Date(a.DateOfTest).getTime() - new Date(b.DateOfTest).getTime());
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].OdometerModel.OdometerReading < sorted[i - 1].OdometerModel.OdometerReading) { motRollback = true; break; }
      }
      if (motRollback) { riskScore += 25; issues.push('Possible mileage rollback detected'); }
    }

    if (isPremium) {
      if (keeperHistory.length >= 6) { riskScore += 8; issues.push(`${keeperHistory.length} previous keepers`); }
      else if (keeperHistory.length <= 2 && keeperHistory.length > 0) { positives.push(`Only ${keeperHistory.length} keeper${keeperHistory.length === 1 ? '' : 's'}`); }
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
    // FINDINGS BUILDER
    // ============================================================
    type Finding = {
      severity: 'critical' | 'high' | 'minor' | 'note';
      title: string;
      description: string;
      category: string;
      evidence?: string;
      cost?: string;
      recco: string;
    };

    const findings: Finding[] = [];

    if (isPremium && data?.writeOff === 'yes') {
      findings.push({
        severity: 'critical',
        title: 'Insurance write-off recorded',
        description: 'This vehicle has been recorded as a write-off. Insurer deemed it uneconomical to repair after damage. Repaired write-offs can be legally driven but typically lose 20–40% of resale value and may have hidden structural damage.',
        category: 'Insurance',
        evidence: 'Recorded in MIAFTR insurance database',
        recco: 'Strongly consider an independent inspection before buying.',
      });
    }
    if (isPremium && data?.stolen === 'yes') {
      findings.push({
        severity: 'critical',
        title: 'Vehicle reported stolen',
        description: 'This registration appears on the Police National Computer as stolen. Buyers have no legal title to stolen property — the vehicle can be seized at any time without compensation.',
        category: 'Theft',
        evidence: 'Police National Computer (PNC)',
        recco: 'Do not purchase. Report to the seller and to police.',
      });
    }
    if (isPremium && data?.finance === 'outstanding') {
      findings.push({
        severity: 'critical',
        title: 'Outstanding finance detected',
        description: 'A finance agreement is still active on this vehicle. The lender retains legal ownership until the balance is settled. Buying without clearing this debt risks the lender repossessing the vehicle from you.',
        category: 'Finance',
        evidence: 'Experian HPI registry',
        recco: 'Insist the seller settles the finance and provides written confirmation before purchase.',
      });
    }

    if (motRollback) {
      findings.push({
        severity: 'critical',
        title: 'Possible mileage rollback',
        description: 'A later MOT recorded fewer miles than an earlier MOT. This is highly unusual and suggests the odometer may have been wound back, which is illegal and significantly affects vehicle value.',
        category: 'Mileage',
        evidence: 'DVSA MOT history cross-check',
        recco: 'Do not purchase without a forensic mileage audit.',
      });
    }

    if (motHistory.length >= 3) {
      const failRate = motFailCount / motHistory.length;
      if (failRate >= 0.5) {
        findings.push({
          severity: 'high',
          title: 'High MOT failure rate',
          description: `${motFailCount} of ${motHistory.length} MOTs failed on first attempt. This suggests recurring mechanical issues or deferred maintenance.`,
          category: 'Maintenance',
          evidence: `${motFailCount}/${motHistory.length} MOT failures`,
          recco: 'Review individual MOT records for patterns. Consider a pre-purchase inspection.',
        });
      }
    }

    const advisoryText = motHistory
      .flatMap((mt: any) => (mt?.AdvisoryNotices_V2 || mt?.AdvisoryNotices || []))
      .map((a: any) => String(a?.Text || a || '').toLowerCase())
      .join(' ');

    const countMatches = (kw: string[]): number =>
      kw.reduce((sum, k) => sum + (advisoryText.match(new RegExp(k, 'g')) || []).length, 0);

    const tyreCount = countMatches(['tyre', 'tire']);
    if (tyreCount >= 2) {
      findings.push({
        severity: tyreCount >= 5 ? 'high' : 'minor',
        title: 'Recurring tyre advisories',
        description: `Tyre wear or condition was flagged ${tyreCount} times across MOT history. Repeated tyre advisories suggest deferred maintenance, an alignment issue, or premature wear from suspension problems.`,
        category: 'Mechanical',
        evidence: `${tyreCount} tyre advisories`,
        cost: 'Typical cost: £80–£200 per tyre',
        recco: 'Check current tread depth and date code on all four tyres.',
      });
    }

    const brakeCount = countMatches(['brake', 'pad', 'disc']);
    if (brakeCount >= 2) {
      findings.push({
        severity: brakeCount >= 5 ? 'high' : 'minor',
        title: 'Recurring brake advisories',
        description: `Brake wear, condition or efficiency was flagged ${brakeCount} times. Brakes are a safety-critical system and recurring advisories suggest aggressive driving, deferred replacement, or hardware fault.`,
        category: 'Safety',
        evidence: `${brakeCount} brake advisories`,
        cost: 'Typical cost: £150–£400 axle replacement',
        recco: 'Have a mechanic verify brake disc and pad condition before purchase.',
      });
    }

    const lightCount = countMatches(['lamp', 'headlamp', 'bulb', 'lighting', 'light']);
    if (lightCount >= 3) {
      findings.push({
        severity: 'minor',
        title: 'Repeated lighting advisories',
        description: `Lighting issues (bulbs, headlamp aim, lamp condition) were flagged ${lightCount} times. These are typically inexpensive fixes but indicate the previous keeper deferred maintenance.`,
        category: 'Maintenance',
        evidence: `${lightCount} lighting advisories`,
        cost: 'Typical cost: £10–£60 per bulb',
        recco: 'Easily checked at viewing — turn all lights on and walk around.',
      });
    }

    const corrosionCount = countMatches(['corrod', 'corrosion', 'rust']);
    if (corrosionCount >= 2) {
      findings.push({
        severity: corrosionCount >= 4 ? 'high' : 'minor',
        title: 'Corrosion flagged',
        description: `Corrosion was noted ${corrosionCount} times. Surface rust is cosmetic but structural corrosion (subframe, sills, mounting points) can be expensive to remediate and is a future MOT risk.`,
        category: 'Bodywork',
        evidence: `${corrosionCount} corrosion advisories`,
        recco: 'Consider an underbody inspection before purchase.',
      });
    }

    const subframeCount = countMatches(['subframe', 'mounting', 'mount']);
    if (subframeCount >= 1) {
      findings.push({
        severity: 'high',
        title: 'Subframe wear detected',
        description: `Subframe issues were flagged ${subframeCount} time${subframeCount === 1 ? '' : 's'}. Subframes are structural components that can be costly to replace and may indicate the vehicle has been driven hard or hit something.`,
        category: 'Structural',
        evidence: `${subframeCount} subframe advisor${subframeCount === 1 ? 'y' : 'ies'}`,
        recco: 'Have a mechanic inspect the subframe mounts.',
      });
    }

    if (isPremium && keeperHistory.length >= 6) {
      findings.push({
        severity: 'minor',
        title: 'High keeper turnover',
        description: `${keeperHistory.length} previous keepers across the vehicle's life. High turnover can indicate persistent issues that successive owners decided to pass on rather than resolve.`,
        category: 'Ownership',
        evidence: `${keeperHistory.length} keepers`,
        recco: 'Ask the seller why the vehicle has changed hands so often.',
      });
    }

    const findingCounts = {
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      minor: findings.filter((f) => f.severity === 'minor').length + findings.filter((f) => f.severity === 'note').length,
      total: findings.length,
    };

    // ============================================================
    // PRIMITIVES
    // ============================================================
    const text = (str: string, x: number, y: number, opts: any = {}) => {
      const textOpts: any = {
        width: opts.width || PAGE.contentWidth,
        align: opts.align || 'left',
        ...opts,
      };
      // remove options that aren't valid for pdfkit text()
      delete textOpts.font;
      delete textOpts.size;
      delete textOpts.color;
      doc.font(opts.font || F.sans).fontSize(opts.size || 11).fillColor(opts.color || C.text)
        .text(str == null ? '' : String(str), x, y, textOpts);
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
    const cleanCc = (val: any): string => {
      if (!val) return '';
      return String(val).replace(/\s*cc\s*$/i, '').trim();
    };
    const statusLabel = (state: string): string => {
      if (state === 'ok') return 'OK';
      if (state === 'warn') return 'CHECK';
      if (state === 'fail') return 'FAIL';
      if (state === 'locked') return 'LOCKED';
      return 'N/A';
    };

    // ============================================================
    // HEADER + FOOTER
    // ============================================================
    const logoPath = path.join(process.cwd(), 'assets', 'logo-light.png');
    const hasLogo = fs.existsSync(logoPath);
    console.log('[PDF] Logo check:', hasLogo, '| path:', logoPath);

    const drawPageHeader = () => {
      fillRect(0, 0, PAGE.width, 50, C.paper);
      doc.strokeColor(C.div).lineWidth(0.5).moveTo(0, 50).lineTo(PAGE.width, 50).stroke();
      if (hasLogo) {
        try { doc.image(logoPath, PAGE.margin, 14, { width: 70 }); } catch (e) {
          text('CheapRegCheck', PAGE.margin, 22, { font: F.sansBold, size: 12, color: C.text, width: 200 });
        }
      } else {
        text('CheapRegCheck', PAGE.margin, 22, { font: F.sansBold, size: 12, color: C.text, width: 200 });
      }
      text(`${reg.toUpperCase()} - ${tierLabel}`, 0, 22, { font: F.sansMed, size: 10, color: C.sub, width: PAGE.width - PAGE.margin, align: 'right' });
    };

    const drawPageFooter = (pageNum: number, totalPages: number) => {
      const y = PAGE.height - 30;
      doc.strokeColor(C.div).lineWidth(0.5).moveTo(PAGE.margin, y - 10).lineTo(PAGE.width - PAGE.margin, y - 10).stroke();
      text('cheapregcheck.com', PAGE.margin, y, { font: F.sansMed, size: 9, color: C.green, width: 200 });
      text(`Page ${pageNum} of ${totalPages}`, PAGE.width - PAGE.margin - 100, y, { font: F.sans, size: 9, color: C.sub, width: 100, align: 'right' });
    };

    // ============================================================
    // PAGE 1 — COVER
    // ============================================================
    fillRect(0, 0, PAGE.width, PAGE.height, C.paper);
    fillRect(0, 480, PAGE.width, PAGE.height - 480, C.bg);

    if (hasLogo) {
      try { doc.image(logoPath, PAGE.width / 2 - 60, 70, { width: 120 }); } catch (e) {
        text('CheapRegCheck', 0, 90, { font: F.serif, size: 36, color: C.text, width: PAGE.width, align: 'center' });
      }
    } else {
      text('CheapRegCheck', 0, 90, { font: F.serif, size: 36, color: C.text, width: PAGE.width, align: 'center' });
    }

    const pillTxt = `${tierLabel} report`;
    const pillBg = isPremium ? C.amberSoft : isStandard ? C.greenSoft : C.grouped;
    const pillFg = isPremium ? C.amber : isStandard ? C.green : C.sub;
    doc.font(F.sansBold).fontSize(10);
    const pillW = doc.widthOfString(pillTxt) + 24;
    const pillX = (PAGE.width - pillW) / 2;
    roundedRect(pillX, 220, pillW, 22, 11, pillBg);
    text(pillTxt, pillX, 226, { font: F.sansBold, size: 10, color: pillFg, width: pillW, align: 'center' });

    text("Your vehicle's", 0, 270, { font: F.serif, size: 38, color: C.text, width: PAGE.width, align: 'center' });
    text('complete history', 0, 312, { font: F.serifIt, size: 44, color: C.green, width: PAGE.width, align: 'center' });

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

    const vehicleHeadline = [v.year, v.make, v.model].filter((x) => x && x !== 'Unknown').join(' ');
    if (vehicleHeadline) {
      text(vehicleHeadline, 0, 470, { font: F.sansMed, size: 18, color: C.sub, width: PAGE.width, align: 'center' });
    }

    const vCardW = 440;
    const vCardH = 130;
    const vCardX = (PAGE.width - vCardW) / 2;
    const vCardY = 540;
    roundedRect(vCardX, vCardY, vCardW, vCardH, 18, C.card, C.border);

    // Buyer verdict badge (SAFE BUY / CAUTION / HIGH RISK)
    const bv = (data as any)?.buyerVerdict;
    const bvLabel = bv?.verdict === 'SAFE_BUY' ? 'SAFE BUY'
                  : bv?.verdict === 'CAUTION' ? 'CAUTION'
                  : bv?.verdict === 'HIGH_RISK' ? 'HIGH RISK'
                  : (riskLevel + ' RISK');
    const bvFg = bv?.verdict === 'SAFE_BUY' ? C.green
               : bv?.verdict === 'CAUTION' ? C.amber
               : bv?.verdict === 'HIGH_RISK' ? C.red
               : riskFg;
    const bvSoft = bv?.verdict === 'SAFE_BUY' ? C.greenPale
                 : bv?.verdict === 'CAUTION' ? C.amberPale
                 : bv?.verdict === 'HIGH_RISK' ? C.redPale
                 : riskSoft;

    doc.font(F.sansBold).fontSize(10);
    const bvBadgeW = Math.max(100, doc.widthOfString(bvLabel) + 28);
    const bvBadgeH = 26;
    const bvBadgeX = vCardX + (vCardW - bvBadgeW) / 2;
    roundedRect(bvBadgeX, vCardY + 20, bvBadgeW, bvBadgeH, 13, bvSoft);
    text(bvLabel, bvBadgeX, vCardY + 27, { font: F.sansBold, size: 10, color: bvFg, width: bvBadgeW, align: 'center', characterSpacing: 1 });

    const bvHeadline = bv?.headline || verdict;
    text(bvHeadline, vCardX + 16, vCardY + 60, { font: F.sansMed, size: 12, color: C.text, width: vCardW - 32, align: 'center' });
    text(`Risk score: ${riskScore} / 100`, vCardX, vCardY + 100, { font: F.sans, size: 10, color: C.sub, width: vCardW, align: 'center' });

    const teaserBits: string[] = [];
    teaserBits.push(`${motHistory.length} MOT record${motHistory.length === 1 ? '' : 's'}`);
    if (isPremium && keeperHistory.length > 0) teaserBits.push(`${keeperHistory.length} keeper${keeperHistory.length === 1 ? '' : 's'}`);
    if (findingCounts.total > 0) teaserBits.push(`${findingCounts.total} finding${findingCounts.total === 1 ? '' : 's'}`);
    teaserBits.push('7 pages');
    text(teaserBits.join('  -  '), 0, 690, { font: F.sans, size: 11, color: C.sub, width: PAGE.width, align: 'center' });

    text(`Generated on ${genDate}`, 0, 760, { font: F.sans, size: 10, color: C.sub2, width: PAGE.width, align: 'center' });
    text('cheapregcheck.com', 0, 778, { font: F.sansMed, size: 11, color: C.green, width: PAGE.width, align: 'center' });

    // ============================================================
    // PAGE 2 — AT A GLANCE
    // ============================================================
    doc.addPage();
    drawPageHeader();

    let cursorY = 80;
    text('At a glance', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    text('Quick summary of all key checks for this vehicle', PAGE.margin, cursorY + 38, { font: F.sans, size: 11, color: C.sub, width: PAGE.contentWidth });
    cursorY += 80;

    // Drive the page-2 risk card off the buyer verdict so it matches the cover
    const bvTop = (data as any)?.buyerVerdict;
    const topLabel = bvTop?.verdict === 'SAFE_BUY' ? 'SAFE BUY'
                   : bvTop?.verdict === 'CAUTION' ? 'CAUTION'
                   : bvTop?.verdict === 'HIGH_RISK' ? 'HIGH RISK'
                   : (riskLevel + ' RISK');
    const topFg = bvTop?.verdict === 'SAFE_BUY' ? C.green
                : bvTop?.verdict === 'CAUTION' ? C.amber
                : bvTop?.verdict === 'HIGH_RISK' ? C.red
                : riskFg;
    const topSoft = bvTop?.verdict === 'SAFE_BUY' ? C.greenPale
                  : bvTop?.verdict === 'CAUTION' ? C.amberPale
                  : bvTop?.verdict === 'HIGH_RISK' ? C.redPale
                  : riskSoft;
    const topHeadline = bvTop?.headline || verdict;

    const gCardH = 180;
    roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, gCardH, 18, C.card, C.border);
    text('Overall risk assessment', PAGE.margin + 22, cursorY + 20, { font: F.sansMed, size: 11, color: C.sub });

    text(String(riskScore), PAGE.margin + 22, cursorY + 44, { font: F.serif, size: 64, color: topFg });
    text('/ 100', PAGE.margin + 22 + 80, cursorY + 80, { font: F.sansMed, size: 14, color: C.sub });

    doc.font(F.sansBold).fontSize(10);
    const lvlBadgeW = Math.max(90, doc.widthOfString(topLabel) + 28);
    const lvlBadgeH = 24;
    roundedRect(PAGE.margin + 22, cursorY + 122, lvlBadgeW, lvlBadgeH, 12, topSoft);
    text(topLabel, PAGE.margin + 22, cursorY + 128, { font: F.sansBold, size: 10, color: topFg, width: lvlBadgeW, align: 'center', characterSpacing: 1 });

    text(topHeadline, PAGE.margin + 22, cursorY + 152, { font: F.sansMed, size: 11, color: C.text, width: PAGE.contentWidth - 44 });

    const gX = PAGE.margin + 200;
    const gY = cursorY + 60;
    const gW = PAGE.contentWidth - 220;
    const gH = 22;
    roundedRect(gX, gY, gW, gH, 11, C.surface);
    // Bar position is driven by buyer verdict tier, not raw score.
    // Centres align with the LOW/MEDIUM/HIGH labels below (0.15 / 0.45 / 0.80).
    const verdictPct = bvTop?.verdict === 'SAFE_BUY' ? 0.15
                     : bvTop?.verdict === 'CAUTION' ? 0.45
                     : bvTop?.verdict === 'HIGH_RISK' ? 0.80
                     : riskScore / 100;
    const fillW = (gW - 4) * verdictPct;
    if (fillW > 4) {
      roundedRect(gX + 2, gY + 2, fillW, gH - 4, 9, topFg);
    }
    const indX = gX + gW * verdictPct;
    if (verdictPct > 0) {
      doc.polygon([indX - 6, gY - 5], [indX + 6, gY - 5], [indX, gY + 3]).fillColor(topFg).fill();
    }
    text('0', gX, gY + 32, { font: F.sans, size: 9, color: C.sub2, width: 30 });
    text('LOW', gX + gW * 0.15 - 15, gY + 32, { font: F.sansMed, size: 9, color: C.green, width: 30, align: 'center' });
    text('MEDIUM', gX + gW * 0.45 - 25, gY + 32, { font: F.sansMed, size: 9, color: C.amber, width: 50, align: 'center' });
    text('HIGH', gX + gW * 0.8 - 15, gY + 32, { font: F.sansMed, size: 9, color: C.red, width: 30, align: 'center' });
    text('100', gX + gW - 30, gY + 32, { font: F.sans, size: 9, color: C.sub2, width: 30, align: 'right' });

    cursorY += gCardH + 20;

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

      doc.font(F.sansBold).fontSize(8);
      const sLabel = statusLabel(c.state);
      const sW = doc.widthOfString(sLabel) + 16;
      roundedRect(x + 16, y + 16, sW, 20, 10, cl.bg);
      text(sLabel, x + 16, y + 21, { font: F.sansBold, size: 8, color: cl.fg, width: sW, align: 'center' });

      text(c.label, x + 16, y + 50, { font: F.sansMed, size: 10, color: C.sub, width: cardW - 32 });
      text(c.msg, x + 16, y + 66, { font: F.sansBold, size: 12, color: C.text, width: cardW - 32 });
    });
    cursorY += cardH * 2 + 30;

  // Buyer Verdict card — replaces "What looks good / Things to check"
    const bvForPage2 = (data as any)?.buyerVerdict;
    const bvPros: string[] = bvForPage2?.pros?.length ? bvForPage2.pros : positives;
    const bvWatch: string[] = bvForPage2?.watchOuts?.length ? bvForPage2.watchOuts : issues;
    const bvAction: string = bvForPage2?.action || '';

    if (bvPros.length > 0 || bvWatch.length > 0 || bvAction) {
      const colW = (PAGE.contentWidth - 32) / 2;
      const textW = colW - 24;
      const rowGap = 6;

      // Pre-measure each row to compute card height
      doc.font(F.sans).fontSize(10);
      const prosHeights = bvPros.map((p) => doc.heightOfString(p, { width: textW }));
      const watchHeights = bvWatch.map((p) => doc.heightOfString(p, { width: textW }));
      const prosTotal = prosHeights.reduce((s, h) => s + h + rowGap, 0);
      const watchTotal = watchHeights.reduce((s, h) => s + h + rowGap, 0);
      const colsTotal = Math.max(prosTotal, watchTotal);
      const sumH = 44 + colsTotal + (bvAction ? 48 : 12);

      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, sumH, 14, C.surface);

      if (bvPros.length > 0) {
        text('What looks good', PAGE.margin + 16, cursorY + 16, { font: F.sansMed, size: 11, color: C.green, width: colW });
        let rowY = cursorY + 40;
        bvPros.forEach((p, i) => {
          doc.circle(PAGE.margin + 22, rowY + 6, 3).fillColor(C.green).fill();
          text(p, PAGE.margin + 32, rowY, { font: F.sans, size: 10, color: C.text, width: textW });
          rowY += prosHeights[i] + rowGap;
        });
      }
      if (bvWatch.length > 0) {
        const ix = PAGE.margin + colW + 16;
        text('Watch-outs', ix, cursorY + 16, { font: F.sansMed, size: 11, color: C.red, width: colW });
        let rowY = cursorY + 40;
        bvWatch.forEach((p, i) => {
          doc.circle(ix + 6, rowY + 6, 3).fillColor(C.red).fill();
          text(p, ix + 16, rowY, { font: F.sans, size: 10, color: C.text, width: textW });
          rowY += watchHeights[i] + rowGap;
        });
      }

      if (bvAction) {
        const actionY = cursorY + 40 + colsTotal + 8;
        text('Recommended action', PAGE.margin + 16, actionY, { font: F.sansMed, size: 10, color: C.sub, width: PAGE.contentWidth - 32 });
        text(bvAction, PAGE.margin + 16, actionY + 14, { font: F.sansMed, size: 11, color: C.text, width: PAGE.contentWidth - 32 });
      }
    }

    drawPageFooter(2, 7);

    // ============================================================
    // PAGE 3 — VEHICLE DETAILS
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    text('Vehicle details', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    text('Official DVLA records and registration data', PAGE.margin, cursorY + 38, { font: F.sans, size: 11, color: C.sub, width: PAGE.contentWidth });
    cursorY += 80;

    // Two columns: Vehicle Details + Tax & Registration
    const detailColW = (PAGE.contentWidth - 16) / 2;

    // ── LEFT: Vehicle Identity
    const leftSpecs: [string, any][] = [
      ['Registration', v.reg || reg],
      ['Make', v.make],
      ['Model', v.model],
      ['Colour', v.colour],
      ['Body style', v.bodyStyle],
      ['Year', v.yearOfManufacture || v.year],
      ['Engine', v.engineCapacity ? `${cleanCc(v.engineCapacity)} cc` : null],
      ['Fuel type', v.fuelType || v.fuel],
      ['CO2 emissions', v.co2 ? `${v.co2} g/km` : null],
      ['Mileage', v.averageMileage ? `${Number(v.averageMileage).toLocaleString('en-GB')} mi` : null],
      ['Avg/year', v.averageMileagePerYear ? `${Number(v.averageMileagePerYear).toLocaleString('en-GB')} mi/yr` : null],
    ];
    if (v.isImported) {
      leftSpecs.push(['Imported', 'Yes']);
    }
    const colourChanges = parseInt(String(v.colourChanges || 0)) || 0;
    if (colourChanges >= 2) {
      leftSpecs.push(['Colour changes', String(colourChanges)]);
    }

    const leftCardH = 50 + leftSpecs.length * 32;
    roundedRect(PAGE.margin, cursorY, detailColW, leftCardH, 14, C.card, C.border);
text('Vehicle Identity', PAGE.margin + 16, cursorY + 16, { font: F.sansBold, size: 13, color: C.text });
    text('Make, model & specification', PAGE.margin + 16, cursorY + 34, { font: F.sans, size: 9, color: C.sub });

    leftSpecs.forEach((s, i) => {
      const ry = cursorY + 60 + i * 32;
      if (i > 0) {
        doc.strokeColor(C.div).lineWidth(0.5).moveTo(PAGE.margin + 16, ry - 4).lineTo(PAGE.margin + detailColW - 16, ry - 4).stroke();
      }
      text(String(s[0]), PAGE.margin + 16, ry + 6, { font: F.sans, size: 11, color: C.sub, width: 140 });
      text(safe(s[1]), PAGE.margin + 16, ry + 6, { font: F.sansBold, size: 11, color: C.text, width: detailColW - 32, align: 'right' });
    });

    // ── RIGHT: Tax & Registration
    const rightX = PAGE.margin + detailColW + 16;
    const rightSpecs: [string, any, string?][] = [];

    if (v.motStatus) {
      rightSpecs.push(['MOT status', v.motStatus, motValid ? 'ok' : 'warn']);
    }
    if (v.motDaysLeft !== undefined && v.motDaysLeft !== null) {
      rightSpecs.push(['MOT days left', `${v.motDaysLeft} days`]);
    }
    if (v.taxStatus) {
      rightSpecs.push(['Tax status', v.taxStatus, taxValid ? 'ok' : 'warn']);
    }
    if (v.taxDaysLeft !== undefined && v.taxDaysLeft !== null) {
      rightSpecs.push(['Tax days left', `${v.taxDaysLeft} days`]);
    }
    if (v.taxBand) {
      const annual = v.taxAnnualRate ? ` — £${v.taxAnnualRate}/yr` : '';
      rightSpecs.push(['Tax band', `Band ${v.taxBand}${annual}`]);
    }
    if (v.monthOfFirstRegistration) {
      rightSpecs.push(['First registered', v.monthOfFirstRegistration]);
    }
    if (v.dateOfLastV5CIssued) {
      rightSpecs.push(['Last V5C', fmtDate(v.dateOfLastV5CIssued)]);
    }
    if (v.lastMotTestDate) {
      rightSpecs.push(['Last MOT', fmtDate(v.lastMotTestDate)]);
    }
    rightSpecs.push(['Exported', v.markedForExport ? 'Yes' : 'No', v.markedForExport ? 'warn' : 'ok']);
    rightSpecs.push(['Scrapped', v.isScrapped ? 'Yes' : 'No', v.isScrapped ? 'warn' : 'ok']);
    if (rightSpecs.length === 0) {
      rightSpecs.push(['Status', 'Not available']);
    }

    const rightCardH = 50 + rightSpecs.length * 32;
    roundedRect(rightX, cursorY, detailColW, rightCardH, 14, C.card, C.border);
    text('Ownership & Status', rightX + 16, cursorY + 16, { font: F.sansBold, size: 13, color: C.text });
    text('Current MOT, tax & registration state', rightX + 16, cursorY + 34, { font: F.sans, size: 9, color: C.sub });

    rightSpecs.forEach((s, i) => {
      const ry = cursorY + 60 + i * 32;
      if (i > 0) {
        doc.strokeColor(C.div).lineWidth(0.5).moveTo(rightX + 16, ry - 4).lineTo(rightX + detailColW - 16, ry - 4).stroke();
      }
      text(String(s[0]), rightX + 16, ry + 6, { font: F.sans, size: 11, color: C.sub, width: 140 });

      // If state pill provided, render coloured pill; else just text
      const stateMaybe = s[2];
      if (stateMaybe) {
        const cl = stateColor(stateMaybe);
        const valStr = String(s[1]);
        doc.font(F.sansBold).fontSize(10);
        const valW = doc.widthOfString(valStr) + 18;
        roundedRect(rightX + detailColW - 16 - valW, ry + 2, valW, 18, 9, cl.bg);
        text(valStr, rightX + detailColW - 16 - valW, ry + 6, { font: F.sansBold, size: 9, color: cl.fg, width: valW, align: 'center' });
      } else {
        text(safe(s[1]), rightX + 16, ry + 6, { font: F.sansBold, size: 11, color: C.text, width: detailColW - 32, align: 'right' });
      }
    });

    drawPageFooter(3, 7);

    // ============================================================
    // [PART 1 ENDS HERE — PART 2 PICKS UP WITH PAGE 4]
    // ============================================================

    // ============================================================
    // PAGE 4 — MOT HISTORY
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    text('MOT history', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    text(`DVSA records · ${motHistory.length} test${motHistory.length === 1 ? '' : 's'} on file`, PAGE.margin, cursorY + 38, { font: F.sans, size: 11, color: C.sub, width: PAGE.contentWidth });
    cursorY += 80;

    // Compute MOT analytics
    const motMileages = motHistory
      .filter((mt: any) => mt?.OdometerModel?.OdometerReading)
      .map((mt: any) => ({
        date: new Date(mt.DateOfTest),
        miles: parseInt(String(mt.OdometerModel.OdometerReading)),
      }))
      .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

    const totalDistance = motMileages.length >= 2
      ? motMileages[motMileages.length - 1].miles - motMileages[0].miles
      : 0;
    const yearsCovered = motMileages.length >= 2
      ? (motMileages[motMileages.length - 1].date.getTime() - motMileages[0].date.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      : 0;
    const avgPerYear = yearsCovered > 0 ? Math.round(totalDistance / yearsCovered) : 0;
    const passRate = motHistory.length > 0 ? Math.round(((motHistory.length - motFailCount) / motHistory.length) * 100) : 0;

    const fmtMiles = (n: number): string => {
      if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
      return String(n);
    };

    // Dark analytics strip — 5 stats
    const stripH = 92;
    fillRect(PAGE.margin, cursorY, PAGE.contentWidth, stripH, C.darkBg);
    doc.roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, stripH, 14).fillColor(C.darkBg).fill();

    const analyticStats = [
      { label: 'TESTS', value: String(motHistory.length), sub: `${motHistory.length - motFailCount} pass / ${motFailCount} fail`, color: '#cbd5e1' },
      { label: 'PASS RATE', value: `${passRate}%`, sub: passRate >= 90 ? 'Strong record' : passRate >= 70 ? 'Average' : 'Weak record', color: passRate >= 90 ? C.greenMid : passRate >= 70 ? '#fbbf24' : '#fca5a5' },
      { label: 'DISTANCE', value: fmtMiles(totalDistance), sub: 'miles tracked', color: '#cbd5e1' },
      { label: 'AVG/YEAR', value: fmtMiles(avgPerYear), sub: avgPerYear < 7000 ? 'Below avg' : avgPerYear < 12000 ? 'Average' : 'Above avg', color: '#cbd5e1' },
      { label: 'ADVISORIES', value: String(motAdvisoryCount), sub: motAdvisoryCount === 0 ? 'None' : motAdvisoryCount < 6 ? 'Low' : motAdvisoryCount < 15 ? 'Moderate' : 'High', color: motAdvisoryCount === 0 ? C.greenMid : motAdvisoryCount < 6 ? '#cbd5e1' : motAdvisoryCount < 15 ? '#fbbf24' : '#fca5a5' },
    ];
    const statColW = PAGE.contentWidth / 5;
    analyticStats.forEach((s, i) => {
      const sx = PAGE.margin + i * statColW;
      text(s.label, sx + 14, cursorY + 16, { font: F.sansBold, size: 8, color: '#94a3b8', width: statColW - 14, characterSpacing: 0.8 });
      text(s.value, sx + 14, cursorY + 32, { font: F.serif, size: 22, color: s.color, width: statColW - 14 });
      text(s.sub, sx + 14, cursorY + 64, { font: F.sans, size: 8, color: '#94a3b8', width: statColW - 14 });
    });
    cursorY += stripH + 16;

    // Mileage chart (only if >= 2 data points)
    if (motMileages.length >= 2) {
      const chartH = 130;
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, chartH, 14, C.card, C.border);
      text('Mileage trend', PAGE.margin + 16, cursorY + 12, { font: F.sansBold, size: 10, color: C.sub, characterSpacing: 0.5 });

      const chartX = PAGE.margin + 30;
      const chartY = cursorY + 32;
      const chartW = PAGE.contentWidth - 60;
      const chartInnerH = chartH - 50;
      const minMiles = Math.min(...motMileages.map((m: any) => m.miles));
      const maxMiles = Math.max(...motMileages.map((m: any) => m.miles));
      const milesRange = maxMiles - minMiles || 1;

      // grid lines (4 horizontal)
      for (let g = 0; g <= 3; g++) {
        const gy = chartY + (chartInnerH / 3) * g;
        doc.strokeColor('#f1f5f9').lineWidth(0.5).moveTo(chartX, gy).lineTo(chartX + chartW, gy).stroke();
        const labelMiles = Math.round(maxMiles - (milesRange / 3) * g);
        text(fmtMiles(labelMiles), PAGE.margin + 4, gy - 5, { font: F.sans, size: 7, color: C.sub2, width: 24 });
      }

      // build polygon for area fill
      const points: [number, number][] = motMileages.map((m: any, i: number) => {
        const px = chartX + (chartW / Math.max(motMileages.length - 1, 1)) * i;
        const py = chartY + chartInnerH - ((m.miles - minMiles) / milesRange) * chartInnerH;
        return [px, py];
      });

      // green area fill
      const areaPath = points.slice();
      doc.moveTo(points[0][0], chartY + chartInnerH);
      points.forEach(([px, py]: [number, number]) => doc.lineTo(px, py));
      doc.lineTo(points[points.length - 1][0], chartY + chartInnerH);
      doc.closePath();
      doc.fillColor(C.greenSoft).fillOpacity(0.6).fill().fillOpacity(1);

      // green line
      doc.moveTo(points[0][0], points[0][1]);
      points.forEach(([px, py]: [number, number], i: number) => { if (i > 0) doc.lineTo(px, py); });
      doc.strokeColor(C.green).lineWidth(2).stroke();

      // dots at each point
      points.forEach(([px, py]: [number, number]) => {
        doc.circle(px, py, 3).fillColor(C.green).fill();
        doc.circle(px, py, 1.5).fillColor(C.paper).fill();
      });

      // x-axis date labels (first and last)
      const firstD = motMileages[0].date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      const lastD = motMileages[motMileages.length - 1].date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
      text(firstD, chartX, chartY + chartInnerH + 6, { font: F.sans, size: 8, color: C.sub, width: 60 });
      text(lastD, chartX + chartW - 60, chartY + chartInnerH + 6, { font: F.sans, size: 8, color: C.sub, width: 60, align: 'right' });

      cursorY += chartH + 16;
    }

    // Test history list — show up to 5 most recent
    const sortedTests = [...motHistory].sort((a: any, b: any) =>
      new Date(b?.DateOfTest || 0).getTime() - new Date(a?.DateOfTest || 0).getTime()
    );
    const testsToShow = sortedTests.slice(0, isPremium ? 6 : 4);

    const remainingHeight = PAGE.height - cursorY - 60;
    const testRowH = Math.min(38, Math.floor(remainingHeight / Math.max(testsToShow.length, 1)));

    if (testsToShow.length > 0) {
      text('Recent tests', PAGE.margin, cursorY, { font: F.sansBold, size: 11, color: C.sub, characterSpacing: 0.5 });
      cursorY += 22;

      testsToShow.forEach((mt: any, idx: number) => {
        const isPass = mt?.Result === true || String(mt?.ResultText || '').toLowerCase().includes('pass');
        const dateStr = fmtDate(mt?.DateOfTest);
        const expiry = fmtDate(mt?.ExpiryDate);
        const miles = mt?.OdometerModel?.OdometerReading;
        const advs = mt?.AdvisoryNotices_V2 || mt?.AdvisoryNotices || [];
        const advCount = Array.isArray(advs) ? advs.length : 0;

        // pill on left
        const pillStr = isPass ? 'PASS' : 'FAIL';
        const pillCol = isPass ? { fg: C.green, bg: C.greenPale } : { fg: C.red, bg: C.redPale };
        roundedRect(PAGE.margin, cursorY, 50, 22, 11, pillCol.bg);
        text(pillStr, PAGE.margin, cursorY + 6, { font: F.sansBold, size: 9, color: pillCol.fg, width: 50, align: 'center', characterSpacing: 0.5 });

        // date and miles
        text(dateStr, PAGE.margin + 60, cursorY + 2, { font: F.sansBold, size: 11, color: C.text, width: 200 });

        const milesStr = miles ? `${Number(miles).toLocaleString('en-GB')} miles` : 'No mileage recorded';
        text(milesStr, PAGE.margin + 60, cursorY + 18, { font: F.sans, size: 9, color: C.sub, width: 200 });

        // expiry on right
        if (mt?.ExpiryDate) {
          text(`Expires ${expiry}`, PAGE.margin + 280, cursorY + 2, { font: F.sans, size: 9, color: C.sub, width: 150 });
        }

        // advisory chip
        if (advCount > 0) {
          doc.font(F.sansBold).fontSize(8);
          const advStr = `${advCount} advisor${advCount === 1 ? 'y' : 'ies'}`;
          const advW = doc.widthOfString(advStr) + 14;
          roundedRect(PAGE.width - PAGE.margin - advW, cursorY + 4, advW, 16, 8, C.amberSoft);
          text(advStr, PAGE.width - PAGE.margin - advW, cursorY + 7, { font: F.sansBold, size: 8, color: C.amber, width: advW, align: 'center' });
        }

        // divider between rows
        if (idx < testsToShow.length - 1) {
          doc.strokeColor(C.div).lineWidth(0.3).moveTo(PAGE.margin, cursorY + testRowH).lineTo(PAGE.width - PAGE.margin, cursorY + testRowH).stroke();
        }
        cursorY += testRowH + 4;
      });

      // "X more tests" footer
      if (sortedTests.length > testsToShow.length) {
        const moreCount = sortedTests.length - testsToShow.length;
        text(`+ ${moreCount} earlier MOT test${moreCount === 1 ? '' : 's'} not shown`, PAGE.margin, cursorY + 4, { font: F.sans, size: 9, color: C.sub2, width: PAGE.contentWidth, align: 'center' });
      }
    }

    drawPageFooter(4, 7);

    // ============================================================
    // PAGE 5 — KEEPER HISTORY (Premium) or UPSELL (Standard)
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    if (isPremium) {
      // Premium: Keeper history
      text('Keeper history', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
      text(`DVLA records · ${keeperHistory.length} keeper${keeperHistory.length === 1 ? '' : 's'} on record`, PAGE.margin, cursorY + 38, { font: F.sans, size: 11, color: C.sub, width: PAGE.contentWidth });
      cursorY += 80;

      // Compute keeper analytics
      const sortedKeepers = [...keeperHistory].sort((a: any, b: any) =>
        new Date(a?.DateOfLastKeeperChange || 0).getTime() - new Date(b?.DateOfLastKeeperChange || 0).getTime()
      );

      const firstKeeperDate = sortedKeepers[0]?.DateOfLastKeeperChange ? new Date(sortedKeepers[0].DateOfLastKeeperChange) : null;
      const yearsOnRoad = firstKeeperDate ? (Date.now() - firstKeeperDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25) : 0;
      const avgTenure = sortedKeepers.length > 0 ? yearsOnRoad / sortedKeepers.length : 0;

      const lastKeeperDate = sortedKeepers[sortedKeepers.length - 1]?.DateOfLastKeeperChange;
      let currentTenureLabel = 'Unknown';
      if (lastKeeperDate) {
        const monthsAsCurrent = (Date.now() - new Date(lastKeeperDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        if (monthsAsCurrent < 1) currentTenureLabel = '< 1 mo';
        else if (monthsAsCurrent < 12) currentTenureLabel = `${Math.round(monthsAsCurrent)} mo`;
        else currentTenureLabel = `${(monthsAsCurrent / 12).toFixed(1)} yrs`;
      }

      // Keeper analytics dark strip
      const kStripH = 92;
      doc.roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, kStripH, 14).fillColor(C.darkBg).fill();

      const kStats = [
        { label: 'TOTAL KEEPERS', value: String(keeperHistory.length), sub: keeperHistory.length <= 2 ? 'Low turnover' : keeperHistory.length <= 4 ? 'Average' : 'High turnover', color: keeperHistory.length <= 2 ? C.greenMid : keeperHistory.length <= 4 ? '#cbd5e1' : '#fca5a5' },
        { label: 'YEARS TRACKED', value: yearsOnRoad.toFixed(1), sub: firstKeeperDate ? `Since ${firstKeeperDate.getFullYear()}` : '-', color: '#cbd5e1' },
        { label: 'AVG TENURE', value: `${avgTenure.toFixed(1)}y`, sub: avgTenure >= 3 ? 'Stable ownership' : avgTenure >= 1.5 ? 'Average' : 'Frequent turnover', color: avgTenure >= 3 ? C.greenMid : avgTenure >= 1.5 ? '#cbd5e1' : '#fbbf24' },
        { label: 'CURRENT KEEPER', value: currentTenureLabel, sub: lastKeeperDate ? `Since ${fmtDate(lastKeeperDate)}` : '-', color: '#cbd5e1' },
      ];
      const kStatColW = PAGE.contentWidth / 4;
      kStats.forEach((s, i) => {
        const sx = PAGE.margin + i * kStatColW;
        text(s.label, sx + 14, cursorY + 16, { font: F.sansBold, size: 8, color: '#94a3b8', width: kStatColW - 14, characterSpacing: 0.8 });
        text(s.value, sx + 14, cursorY + 32, { font: F.serif, size: 22, color: s.color, width: kStatColW - 14 });
        text(s.sub, sx + 14, cursorY + 64, { font: F.sans, size: 8, color: '#94a3b8', width: kStatColW - 14 });
      });
      cursorY += kStripH + 16;

      // Ownership timeline (proportional bars)
      if (sortedKeepers.length >= 1 && firstKeeperDate) {
        text('Ownership timeline', PAGE.margin, cursorY, { font: F.sansBold, size: 11, color: C.sub, characterSpacing: 0.5 });
        cursorY += 22;

        const timelineH = 32;
        const totalSpanMs = Date.now() - firstKeeperDate.getTime();
        let timelineX = PAGE.margin;

        sortedKeepers.forEach((k: any, idx: number) => {
          const start = new Date(k?.DateOfLastKeeperChange || 0).getTime();
          const end = idx < sortedKeepers.length - 1
            ? new Date(sortedKeepers[idx + 1]?.DateOfLastKeeperChange || Date.now()).getTime()
            : Date.now();
          const tenureMs = end - start;
          const tenureYears = tenureMs / (1000 * 60 * 60 * 24 * 365.25);
          const segmentW = (tenureMs / totalSpanMs) * PAGE.contentWidth;

          let segColor = C.green;
          if (tenureYears < 0.5) segColor = C.red;
          else if (tenureYears < 1.5) segColor = C.amber;
          else if (tenureYears < 4) segColor = C.blue;

          fillRect(timelineX, cursorY, Math.max(segmentW, 4), timelineH, segColor);
          // text inside segment if wide enough
          if (segmentW > 40) {
            const labelStr = tenureYears >= 1 ? `${tenureYears.toFixed(1)}y` : `${Math.round(tenureYears * 12)}mo`;
            text(labelStr, timelineX, cursorY + 11, { font: F.sansBold, size: 9, color: C.paper, width: segmentW, align: 'center' });
          }

          timelineX += segmentW;
        });

        cursorY += timelineH + 6;
        text(firstKeeperDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), PAGE.margin, cursorY, { font: F.sans, size: 8, color: C.sub2, width: 100 });
        text('Today', PAGE.width - PAGE.margin - 100, cursorY, { font: F.sans, size: 8, color: C.sub2, width: 100, align: 'right' });
        cursorY += 24;

        // Legend
        const legendItems = [
          { color: C.green, label: '4+ yrs (long-term)' },
          { color: C.blue, label: '1.5-4 yrs (typical)' },
          { color: C.amber, label: '6mo-1.5y (short)' },
          { color: C.red, label: '< 6 mo (red flag)' },
        ];
        const legendW = PAGE.contentWidth / 4;
        legendItems.forEach((li, i) => {
          const lx = PAGE.margin + i * legendW;
          doc.circle(lx + 4, cursorY + 5, 4).fillColor(li.color).fill();
          text(li.label, lx + 12, cursorY, { font: F.sans, size: 8, color: C.sub, width: legendW - 12 });
        });
        cursorY += 22;
      }

      // Keeper rows (most recent first)
      const keepersDescending = [...sortedKeepers].reverse();
      const showKeepers = keepersDescending.slice(0, 5);
      showKeepers.forEach((k: any, idx: number) => {
        const num = sortedKeepers.length - idx;
        const transferDate = fmtDate(k?.DateOfLastKeeperChange);
        const isCurrent = idx === 0;

        const rowH = 30;
        // numbered circle
        doc.circle(PAGE.margin + 12, cursorY + 14, 11).fillColor(isCurrent ? C.green : C.surface).fill();
        text(String(num), PAGE.margin, cursorY + 8, { font: F.sansBold, size: 11, color: isCurrent ? C.paper : C.text, width: 24, align: 'center' });

        text(`Keeper ${num}${isCurrent ? ' (current)' : ''}`, PAGE.margin + 32, cursorY + 4, { font: F.sansBold, size: 11, color: C.text, width: 240 });
        text(`Transferred ${transferDate}`, PAGE.margin + 32, cursorY + 18, { font: F.sans, size: 9, color: C.sub, width: 240 });

        // current pill on right
        if (isCurrent) {
          doc.font(F.sansBold).fontSize(8);
          const cpStr = 'CURRENT';
          const cpW = doc.widthOfString(cpStr) + 14;
          roundedRect(PAGE.width - PAGE.margin - cpW, cursorY + 6, cpW, 16, 8, C.greenPale);
          text(cpStr, PAGE.width - PAGE.margin - cpW, cursorY + 9, { font: F.sansBold, size: 8, color: C.green, width: cpW, align: 'center', characterSpacing: 0.5 });
        }

        cursorY += rowH;
        if (idx < showKeepers.length - 1) {
          doc.strokeColor(C.div).lineWidth(0.3).moveTo(PAGE.margin + 28, cursorY).lineTo(PAGE.width - PAGE.margin, cursorY).stroke();
        }
      });
    } else {
      // Standard tier: Upsell page
      text('Get the full picture', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
      text('Premium reports unlock the most important checks before you buy', PAGE.margin, cursorY + 38, { font: F.sans, size: 11, color: C.sub, width: PAGE.contentWidth });
      cursorY += 80;

      // 5 benefit cards in 2-column layout
      const benefits = [
        { title: 'Outstanding finance check', desc: 'Find out if money is still owed on this vehicle. 1 in 3 UK used cars carries hidden finance.' },
        { title: 'Stolen vehicle check', desc: 'Verify against the Police National Computer (PNC) stolen vehicle database.' },
        { title: 'Insurance write-off check', desc: 'Reveal Cat A, B, S, or N write-off history. 1 in 14 UK used cars is a recorded write-off.' },
        { title: 'Full keeper history', desc: 'Complete DVLA ownership chain with proportional timeline and tenure analysis.' },
        { title: 'Detected findings panel', desc: 'AI-derived risk findings with severity tiers, evidence, and buyer recommendations.' },
      ];

      const benefitColW = (PAGE.contentWidth - 16) / 2;
      benefits.forEach((b, i) => {
        const col = i % 2;
        const rowI = Math.floor(i / 2);
        const bx = PAGE.margin + col * (benefitColW + 16);
        const by = cursorY + rowI * 80;

        roundedRect(bx, by, benefitColW, 70, 12, C.card, C.border);
        // green check circle
        doc.circle(bx + 18, by + 18, 8).fillColor(C.greenPale).fill();
        text('OK', bx + 11, by + 14, { font: F.sansBold, size: 7, color: C.green, width: 16, align: 'center' });

        text(b.title, bx + 36, by + 12, { font: F.sansBold, size: 11, color: C.text, width: benefitColW - 48 });
        text(b.desc, bx + 36, by + 28, { font: F.sans, size: 9, color: C.sub, width: benefitColW - 48, lineGap: 2 });
      });
      cursorY += 80 * 3;

      // Green CTA box
      const ctaH = 110;
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, ctaH, 16, C.greenPale, C.green, 1.5);
      text('Upgrade to Premium for just £3', PAGE.margin, cursorY + 18, { font: F.serif, size: 22, color: C.greenDark, width: PAGE.contentWidth, align: 'center' });
      text('Same registration · Instant unlock · Secure payment', PAGE.margin, cursorY + 50, { font: F.sansMed, size: 11, color: C.green, width: PAGE.contentWidth, align: 'center' });
      text('Visit cheapregcheck.com or check your email for the unlock link', PAGE.margin, cursorY + 72, { font: F.sans, size: 10, color: C.sub, width: PAGE.contentWidth, align: 'center' });
    }

    drawPageFooter(5, 7);

    // ============================================================
    // PAGE 6 — DETECTED FINDINGS
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    text('Detected findings', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    const findingsSubtitle = findings.length === 0
      ? 'No notable findings — this vehicle appears to be in good standing'
      : `${findings.length} finding${findings.length === 1 ? '' : 's'} ${findingCounts.critical > 0 ? '· Critical issues found — review carefully' : '· Buyer notes for consideration'}`;
    text(findingsSubtitle, PAGE.margin, cursorY + 38, { font: F.sans, size: 11, color: C.sub, width: PAGE.contentWidth });
    cursorY += 80;

    // 4-cell summary strip (always show, even if zero findings)
    const fStripH = 80;
    doc.roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, fStripH, 14).fillColor(C.darkBg).fill();
    // top border accent
    fillRect(PAGE.margin, cursorY, PAGE.contentWidth, 3, C.red);
    fillRect(PAGE.margin + PAGE.contentWidth * 0.33, cursorY, 3, fStripH, C.darkAccent);
    fillRect(PAGE.margin + PAGE.contentWidth * 0.66, cursorY, 3, fStripH, C.darkAccent);

    const fSummary = [
      { label: 'CRITICAL', value: String(findingCounts.critical), sub: findingCounts.critical > 0 ? 'Take seriously' : 'None', color: '#fca5a5' },
      { label: 'HIGH', value: String(findingCounts.high), sub: findingCounts.high > 0 ? 'Inspect carefully' : 'None', color: '#fbbf24' },
      { label: 'MINOR', value: String(findingCounts.minor), sub: findingCounts.minor > 0 ? 'Worth noting' : 'None', color: '#fde68a' },
      { label: 'TOTAL', value: String(findingCounts.total), sub: findingCounts.total > 0 ? `Across ${findings.length} categor${findings.length === 1 ? 'y' : 'ies'}` : 'No findings', color: '#cbd5e1' },
    ];
    const fStatColW = PAGE.contentWidth / 4;
    fSummary.forEach((s, i) => {
      const sx = PAGE.margin + i * fStatColW;
      text(s.label, sx + 14, cursorY + 14, { font: F.sansBold, size: 8, color: '#94a3b8', width: fStatColW - 14, characterSpacing: 0.8 });
      text(s.value, sx + 14, cursorY + 28, { font: F.serif, size: 24, color: s.color, width: fStatColW - 14 });
      text(s.sub, sx + 14, cursorY + 60, { font: F.sans, size: 8, color: '#94a3b8', width: fStatColW - 14 });
    });
    cursorY += fStripH + 20;

    // Severity-coloured finding cards
    const sevStyle = (sev: string) => {
      if (sev === 'critical') return { bg: C.redPale, border: C.red, fg: C.red, label: 'CRITICAL' };
      if (sev === 'high') return { bg: C.amberPale, border: C.amber, fg: C.amber, label: 'HIGH' };
      if (sev === 'minor') return { bg: C.amberSoft, border: '#fde68a', fg: C.amber, label: 'MINOR' };
      return { bg: C.bluePale, border: '#bfdbfe', fg: C.blue, label: 'NOTE' };
    };

    if (findings.length === 0) {
      // Empty state card
      const emptyH = 100;
      roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, emptyH, 14, C.greenPale, C.green, 1);
      text('No findings detected', PAGE.margin, cursorY + 28, { font: F.sansBold, size: 14, color: C.greenDark, width: PAGE.contentWidth, align: 'center' });
      text('This vehicle has no major issues based on the data we checked. Always inspect the vehicle in person before purchase.', PAGE.margin + 40, cursorY + 56, { font: F.sans, size: 10, color: C.greenDark, width: PAGE.contentWidth - 80, align: 'center', lineGap: 2 });
    } else {
      // Sort: critical → high → minor → note
      // Sort: critical → high → minor → note
      const order: Record<string, number> = { critical: 0, high: 1, minor: 2, note: 3 };
      const sortedFindings = [...findings].sort((a: Finding, b: Finding) => order[a.severity] - order[b.severity]);
      // Show up to 4 findings on this page
      const findingsToShow = sortedFindings.slice(0, 4);

      findingsToShow.forEach((f) => {
        const style = sevStyle(f.severity);

        // Estimate height: title + desc lines + chips row
        const descLines = Math.ceil(f.description.length / 80);
        const cardFH = 24 + 22 + (descLines * 14) + 8 + 28 + 18;

        // Don't overflow the page
        if (cursorY + cardFH > PAGE.height - 80) {
          return;
        }

        // Card background
        roundedRect(PAGE.margin, cursorY, PAGE.contentWidth, cardFH, 12, style.bg, style.border, 1);

        // Severity ribbon on left
        fillRect(PAGE.margin, cursorY, 4, cardFH, style.fg);

        // Severity pill top-right
        doc.font(F.sansBold).fontSize(8);
        const sevPillW = doc.widthOfString(style.label) + 16;
        roundedRect(PAGE.width - PAGE.margin - sevPillW - 12, cursorY + 12, sevPillW, 16, 8, style.fg);
        text(style.label, PAGE.width - PAGE.margin - sevPillW - 12, cursorY + 15, { font: F.sansBold, size: 8, color: C.paper, width: sevPillW, align: 'center', characterSpacing: 0.5 });

        // Title
        text(f.title, PAGE.margin + 16, cursorY + 12, { font: F.sansBold, size: 13, color: style.fg, width: PAGE.contentWidth - sevPillW - 32 });

        // Description
        text(f.description, PAGE.margin + 16, cursorY + 36, { font: F.sans, size: 10, color: C.text, width: PAGE.contentWidth - 32, lineGap: 2 });

        // Chips row
        const chipY = cursorY + 36 + descLines * 14 + 12;

        // Category chip
        doc.font(F.sansMed).fontSize(8);
        const catW = doc.widthOfString(f.category) + 14;
        roundedRect(PAGE.margin + 16, chipY, catW, 16, 8, C.bluePale);
        text(f.category, PAGE.margin + 16, chipY + 3, { font: F.sansMed, size: 8, color: C.blue, width: catW, align: 'center' });

        let chipX = PAGE.margin + 16 + catW + 6;

        // Evidence chip
        if (f.evidence) {
          doc.font(F.sans).fontSize(8);
          const evW = doc.widthOfString(f.evidence) + 14;
          if (chipX + evW < PAGE.width - PAGE.margin) {
            roundedRect(chipX, chipY, evW, 16, 8, C.surface, C.border, 0.5);
            text(f.evidence, chipX, chipY + 3, { font: F.sans, size: 8, color: C.sub, width: evW, align: 'center' });
            chipX += evW + 6;
          }
        }

        // Cost chip
        if (f.cost) {
          doc.font(F.sansMed).fontSize(8);
          const costW = doc.widthOfString(f.cost) + 14;
          if (chipX + costW < PAGE.width - PAGE.margin) {
            roundedRect(chipX, chipY, costW, 16, 8, C.greenPale);
            text(f.cost, chipX, chipY + 3, { font: F.sansMed, size: 8, color: C.green, width: costW, align: 'center' });
          }
        }

        // Recco line below chips
        text(`Tip: ${f.recco}`, PAGE.margin + 16, chipY + 24, { font: F.sansMed, size: 9, color: style.fg, width: PAGE.contentWidth - 32, lineGap: 1 });

        cursorY += cardFH + 10;
      });

      if (sortedFindings.length > findingsToShow.length) {
        const moreCount = sortedFindings.length - findingsToShow.length;
        text(`+ ${moreCount} additional finding${moreCount === 1 ? '' : 's'} not shown`, PAGE.margin, cursorY + 4, { font: F.sans, size: 9, color: C.sub2, width: PAGE.contentWidth, align: 'center' });
      }
    }

    drawPageFooter(6, 7);

    // ============================================================
    // PAGE 7 — ABOUT THIS REPORT (DISCLAIMER)
    // ============================================================
    doc.addPage();
    drawPageHeader();
    cursorY = 80;

    text('About this report', PAGE.margin, cursorY, { font: F.serif, size: 32, color: C.text, width: PAGE.contentWidth });
    text('Data sources, accuracy, and validity', PAGE.margin, cursorY + 38, { font: F.sans, size: 11, color: C.sub, width: PAGE.contentWidth });
    cursorY += 80;

    const sections = [
      {
        title: 'Data sources',
        body: 'This report compiles data from the DVLA (Driver and Vehicle Licensing Agency), the DVSA MOT history service, and licensed third-party data providers including stolen vehicle databases (Police PNC), insurance write-off registries (MIAFTR), and finance registries (Experian HPI).',
      },
      {
        title: 'Accuracy',
        body: 'CheapRegCheck makes every effort to ensure the data is accurate at the time of generation. We rely on third-party data and cannot guarantee its completeness. This report is for informational purposes only and should not be the sole basis for purchasing decisions.',
      },
      {
        title: 'Liability',
        body: 'CheapRegCheck and its operators are not liable for any decision made based on this report. We strongly recommend an independent inspection by a qualified mechanic before purchasing any used vehicle. Findings derived from MOT advisories are heuristic and based on text pattern matching; they are not professional mechanical assessments.',
      },
      {
        title: 'Validity',
        body: 'The information is accurate as of the generation date shown on the cover. Vehicle status (tax, MOT, finance, ownership) can change at any time. For time-sensitive decisions, generate a fresh report. CheapRegCheck is not affiliated with DVLA or DVSA.',
      },
    ];

    sections.forEach((sec) => {
      text(sec.title, PAGE.margin, cursorY, { font: F.sansBold, size: 13, color: C.text, width: PAGE.contentWidth });
      cursorY += 20;
      text(sec.body, PAGE.margin, cursorY, { font: F.sans, size: 10, color: C.sub, width: PAGE.contentWidth, lineGap: 3 });
      // approximate height: ~14px per line, ~80 chars per line
      const lines = Math.ceil(sec.body.length / 80);
      cursorY += lines * 14 + 18;
    });

    // Report ID box at bottom
    const idBoxY = PAGE.height - 130;
    roundedRect(PAGE.margin, idBoxY, PAGE.contentWidth, 60, 12, C.surface, C.border);
    text('REPORT ID', PAGE.margin + 16, idBoxY + 12, { font: F.sansBold, size: 9, color: C.sub2, width: 200, characterSpacing: 1 });
    text(docId, PAGE.margin + 16, idBoxY + 26, { font: F.sansBold, size: 18, color: C.text, width: PAGE.contentWidth - 32, characterSpacing: 1 });
    text(`Generated ${genDate} · ${tierLabel} tier`, PAGE.margin + 16, idBoxY + 46, { font: F.sans, size: 9, color: C.sub });

    // Closing line
    text('Thank you for using CheapRegCheck', PAGE.margin, idBoxY + 70, { font: F.serifIt, size: 14, color: C.green, width: PAGE.contentWidth, align: 'center' });

    drawPageFooter(7, 7);

    doc.end();
    });
  }
}