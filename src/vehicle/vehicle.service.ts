import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../reports/report.entity';
import { Bundle } from '../bundle/bundle.entity';
import { PaymentService } from '../payment/payment.service';
import { VehicleReport } from '../types/report';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class VehicleService {
  constructor(
  @InjectRepository(Report)
  private reportRepo: Repository<Report>,
  @InjectRepository(Bundle)
  private bundleRepo: Repository<Bundle>,
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

  console.log('🔥 RCC FETCH:', reg);

  const apiKey = process.env.RAPID_API_KEY;
  const domain = process.env.RAPID_API_DOMAIN;

  const url =
    `https://www.rapidcarcheck.co.uk/api/` +
    `?key=${apiKey}` +
    `&domain=${encodeURIComponent(domain || '')}` +
    `&plate=${encodeURIComponent(reg)}`;

  const response = await axios.get(url);
  const data = response.data;

  console.log(
    '🔥 RCC RAW FULL:',
    JSON.stringify(data, null, 2)
  );

  const ivcm =
    data?.Results?.InitialVehicleCheckModel;

  const vehicle =
    ivcm?.BasicVehicleDetailsModel;

  console.log(
    '🔥 RCC VEHICLE:',
    JSON.stringify(vehicle, null, 2)
  );

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
    console.error(
      '🔥 RCC STANDARD ERROR:',
      err.response?.data || err.message
    );
    throw new Error(
      'Failed to load standard report'
    );
  }
}
  private async consumeBundle(email: string): Promise<boolean> {

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
    return false;
  }

  if (bundle.remaining <= 0) {

    bundle.active = false;

    await this.bundleRepo.save(bundle);

    return false;
  }

  bundle.remaining -= 1;

  if (bundle.remaining <= 0) {
    bundle.active = false;
  }

  await this.bundleRepo.save(bundle);

  console.log("🔥 BUNDLE CONSUMED:", {
    email,
    remaining: bundle.remaining,
  });

  return true;
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
      console.log(
        '🔥 TOKEN DECODED:',
        decoded
      );

      if (!decoded) {
        throw new Error(
          'Invalid token'
        );
      }

      if (
        decoded.type !== 'report_access'
      ) {

        throw new Error(
          'Invalid access type'
        );
      }

      const tokenReg =
        decoded.reg;
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

      // console.log(
      //   '🔥 STRIPE SESSION:',
      //   session
      // );

      if (
        !session ||
        session.error
      ) {

        throw new Error(
          'Invalid session'
        );
      }

      if (
        session.payment_status !== 'paid'
      ) {

        throw new Error(
          'Payment required'
        );
      }

      isPaid = true;
      email =
        session.customer_details?.email ||
        session.customer_email ||
        null;

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
    }

    // =========================
    // 🎟️ BUNDLE ACCESS
    // =========================
    let hasBundle = false;
    console.log(
      '🔥 ACCESS CHECK:',
      {
        isPaid,
        hasBundle,
        accessTier,
        email,
      }
    );
    // =========================
    // 🔒 ACCESS CONTROL
    // =========================
    if (
      accessTier !== 'free' &&
      !isPaid &&
      !hasBundle
    ) {
      throw new Error(
        'Payment required'
      );
    }
    console.log(
      '🔥 ACCESS GRANTED'
    );
    // =========================
    // 🚦 TIER ROUTING
    // =========================

    let report: any = null;
    /*
    FREE
    --------------------------------
    DVLA ONLY
    */
    if (
      accessTier === 'free'
    ) {
      report =
        await this.getPreview(reg);
    }
    /*
    STANDARD
    --------------------------------
    RCC STANDARD
    */
    else if (accessTier === 'standard') {

  report = await this.getRccStandard(reg);

  console.log(
    '🔥 STANDARD REPORT:',
    JSON.stringify(report, null, 2)
  );
}

    /*
    PREMIUM
    --------------------------------
    RCC + VDG RISK DATA
    */

    else if (
accessTier === 'premium'
) {

  // get standard structure

  const standard =
    await this.getRccStandard(reg);

  // get raw RCC data
  // for premium-only fields

  const {
    vehicle
  } =
    await this.fetchRccData(reg);

  // get VDG risk data

  const vdg =
    await this.getVDGData(reg);

  report = {

    // inherit standard report

    ...standard,

    // override tier

    tier: 'premium',

    // extend vehicle data

    vehicle: {

      // inherit standard vehicle fields

      ...standard.vehicle,

      // premium-only additions

      bodyStyle:
        vehicle?.BodyStyle || null,
      age:
        vehicle?.Age || null,
      taxBand:
        vehicle?.RoadTaxData?.Band || null,
      annualTax:
        vehicle?.RoadTaxData
          ?.TwelveMonthRate || null,
      motDaysLeft:
        vehicle?.DaysLeftUntilMotDue || null,
      taxDaysLeft:
        vehicle?.DaysLeftUntilRoadTaxDue || null,
      averageMileage:
        vehicle?.AverageMileage || null,
    },

    // premium risk data

    finance:
      this.extractFinance(vdg),
    stolen:
      this.extractStolen(vdg),
    writeOff:
      this.extractWriteOff(vdg),
  };
}
// =========================
// VDG RISK DATA
// =========================
    else {

      throw new Error(
        'Invalid access tier'
      );
    }

    // =========================
    // 💾 SAVE REPORT
    // =========================

    await this.reportRepo.save({

      reg,

      userId:
        email || 'guest',
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
    console.error(
      '🔥 FULL REPORT ERROR:',
      err.message
    );

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
}