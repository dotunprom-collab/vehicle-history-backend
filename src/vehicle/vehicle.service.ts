import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from '../reports/report.entity';

@Injectable()
export class VehicleService {

  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
  ) {}

  // =========================
  // 🟢 FREE PREVIEW (DVLA)
  // =========================
  async getPreview(reg: string) {
    try {
      await axios.post(
        "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
        { registrationNumber: reg },
        {
          headers: {
            "x-api-key": process.env.DVLA_API_KEY,
            "Content-Type": "application/json"
          }
        }
      );

      const rcc = await this.getRccData(reg);

      return this.mapToCleanResponse(rcc);

    } catch (error: any) {
      console.error("🚨 DVLA ERROR:", error.message);

      return {
        reg,
        error: "DVLA data unavailable"
      };
    }
  }

  // =========================
  // 🔵 RCC DATA FETCH
  // =========================
 async getRccData(reg: string) {
  try {
    const apiKey = process.env.RAPID_API_KEY;
const domain = process.env.RAPID_API_DOMAIN?.replace('https://', '').replace('http://', '');

const url = `https://www.rapidcarcheck.co.uk/api/?key=${apiKey}&domain=${domain}&plate=${reg}`;

    const response = await axios.get(url);

    return response.data;

  } catch (error: any) {
    console.error("🔥 RCC ERROR:", error.message);
    return null;
  }
}

  // =========================
  // 🔴 FULL PREMIUM REPORT
  // =========================
  async getFull(reg: string) {
    try {
      

      console.log("🔥 ENV KEY:", process.env.RAPID_API_KEY);
      console.log("🔥 ENV DOMAIN:", process.env.RAPID_API_DOMAIN);
      const apiKey = process.env.RAPID_API_KEY;

const domain = process.env.RAPID_API_DOMAIN
  ?.replace('https://', '')
  ?.replace('http://', '');

const url = `https://www.rapidcarcheck.co.uk/api/?key=${apiKey}&domain=${domain}&plate=${reg}`;

      const response = await axios.get(url);
      const data = response.data;

      console.log("🔥 FULL API RESPONSE START 🔥");
      console.log(JSON.stringify(data, null, 2));
      console.log("🔥 FULL API RESPONSE END 🔥");

      if (data.HasError || !data.Results) {
  console.error("❌ RCC FAILED — USING FALLBACK");

  const fallback = {
    vehicle: {
      reg,
      make: "Unavailable",
      model: "Unavailable",
      year: "N/A",
      fuel: "N/A",
      colour: "N/A"
    },

    mot: {
      status: "Unknown",
      due: "N/A",
      history: []
    },

    mileage: {
      current: 0,
      perYear: 0
    },

    ownership: {
      owners: 0
    },

    finance: "unknown",
    stolen: "unknown",
    writeOff: "unknown",

    flags: {
      imported: false,
      scrapped: false,
      exported: false
    }
  };

  return {
    ...fallback,
    riskScore: 0,
    insights: ["⚠ Data temporarily unavailable — please try again"],
    estimatedValue: "N/A",
    fallback: true // 👈 IMPORTANT FLAG
  };
}

      const vehicle =
        data.Results?.InitialVehicleCheckModel?.BasicVehicleDetailsModel;

      const motResults =
        data.Results?.InitialVehicleCheckModel?.MotResultsSummary?.MotResults || [];

      const mapped = {
        vehicle: {
          reg,
          make: vehicle?.Make,
          model: vehicle?.Model,
          year: vehicle?.DateOfFirstRegistration,
          fuel: vehicle?.FuelType,
          colour: vehicle?.Colour,
          bodyStyle: vehicle?.BodyStyle,
          engineSize: vehicle?.CylinderCapacity,
          image: vehicle?.VehicleImageUrl
        },

        mot: {
          status: vehicle?.MotStatusDescription,
          due: vehicle?.DateMotDue,
          daysLeft: vehicle?.DaysLeftUntilMotDue,
          history: motResults.map((m: any) => ({
            date: m.DateOfTest,
            result: m.ResultText,
            mileage: m.OdometerModel?.OdometerReading,
            advisories: m.AdvisoryNotices || []
          }))
        },

        mileage: {
          current: vehicle?.AverageMileage,
          perYear: vehicle?.AverageMileagePerYear
        },

        ownership: {
          owners: vehicle?.KeeperHistory?.[0]?.NumberPreviousKeepers || 0
        },

        specs: {
          bhp: vehicle?.Bhp,
          engine: vehicle?.CylinderCapacity,
          body: vehicle?.BodyStyle
        },

        tax: {
          status: vehicle?.RoadTaxStatusDescription,
          yearly: vehicle?.TwelveMonthsTaxRate
        },

        environment: {
          co2: vehicle?.Co2Emissions,
          euro: vehicle?.EuroStatus
        },

        flags: {
          imported: vehicle?.IsImported,
          scrapped: vehicle?.IsScrapped,
          exported: vehicle?.Exported
        },

        finance: data.Results?.FinanceModel?.HasFinance ? "outstanding" : "clear",
        stolen: data.Results?.StolenCheckModel?.IsStolen ? "yes" : "no",
        writeOff: data.Results?.InsuranceWriteOffModel?.IsWriteOff ? "yes" : "no"
      };

      const riskScore = this.calculateRisk(mapped);
      const insights = this.generateInsights(mapped);

      return {
        ...mapped,
        riskScore,
        insights,
        estimatedValue: this.estimateValue(mapped)
      };

    } catch (error: any) {
      console.error("🔥 RAPID ERROR:", error.message);

      return {
        reg,
        error: "Premium data failed"
      };
    }
  }

  // =========================
  // 🧠 CLEAN RESPONSE MAPPER
  // =========================
  private mapToCleanResponse(rcc: any, premium?: any) {
    const basic = rcc?.Results?.InitialVehicleCheckModel?.BasicVehicleDetailsModel;

    const mot = basic?.MotResultsSummary;
    const lastMot = mot?.MotResults?.[0];

    return {
      vehicle: {
        title: `${basic?.Make || ''} ${basic?.Model || ''}`.trim(),
        reg: rcc?.Results?.Vrm || null,
        make: basic?.Make || null,
        model: basic?.Model || null,
        fuel: basic?.FuelType || null,
        colour: basic?.Colour || null,
        year: basic?.YearOfManufacture || null
      },

      mot: {
        status: basic?.IsMOTDue ? "Expired" : "Valid",
        due: basic?.DateMotDue || null,
        lastResult: lastMot?.ResultText || null,
        advisories: lastMot?.AdvisoryNotices?.slice(0, 3) || []
      },

      mileage: {
        current: basic?.AverageMileage || null,
        perYear: basic?.AverageMileagePerYear || null,
        status:
          basic?.AverageMileagePerYear > 12000
            ? "Above average"
            : "Normal usage"
      },

      ownership: {
        owners: basic?.KeeperHistory?.[0]?.NumberPreviousKeepers || null,
        lastChange: basic?.KeeperHistory?.[0]?.DateOfLastKeeperChange || null
      },

      tax: {
        status: basic?.RoadTaxStatusDescription || null,
        due: basic?.DateRoadTaxDue || null
      },

      risk: {
        writeOff: premium?.writeOff || "Not checked"
      },

      aiSummary: this.generateSummary(basic, premium?.writeOff),

      upsell: {
        locked: ["Finance check", "Stolen check"],
        message: "Unlock full risk report"
      }
    };
  }

  // =========================
  // 🤖 AI SUMMARY
  // =========================
  private generateSummary(basic: any, writeOff: any): string {
    const owners = basic?.KeeperHistory?.[0]?.NumberPreviousKeepers || 0;

    let summary = "Vehicle appears typical for its age.";

    if (owners > 4) {
      summary = "Vehicle has had multiple owners which may affect long-term reliability.";
    }

    if (basic?.IsMOTDue) {
      summary = "MOT is due soon — inspection recommended.";
    }

    if (writeOff) {
      summary = "⚠ This vehicle has a recorded write-off history.";
    }

    return summary;
  }

  private calculateRisk(data: any): number {
    let score = 0;

    if (data.finance === "outstanding") score += 40;
    if (data.stolen === "yes") score += 100;
    if (data.writeOff === "yes") score += 50;

    if (data.mileage?.current > 120000) score += 15;

    return Math.min(score, 100);
  }

  private generateInsights(data: any): string[] {
    const insights = [];

    if (data.finance === "outstanding") insights.push("⚠ Outstanding finance detected");
    if (data.stolen === "yes") insights.push("🚨 Vehicle reported stolen");
    if (data.writeOff === "yes") insights.push("⚠ Insurance write-off recorded");
    if (data.mileage?.current > 100000) insights.push("High mileage — expect wear & tear");

    if (insights.length === 0) insights.push("✅ No major risks detected");

    return insights;
  }

  private estimateValue(data: any): number {
    let base = 10000;
    const mileagePenalty = (data.mileage?.current || 0) * 0.05;
    return Math.max(base - mileagePenalty, 1000);
  }

  async getReports() {
    return this.reportRepository.find({
      order: { createdAt: 'DESC' }
    });
  }

  getVehicleImage(make: string, model?: string) {
  if (!make) {
    return {
      image: "https://via.placeholder.com/800x400?text=Vehicle"
    };
  }

  const query = `${make} ${model || ""} car`;

  return {
    image: `https://source.unsplash.com/800x400/?${encodeURIComponent(query)}`
  };
}
}