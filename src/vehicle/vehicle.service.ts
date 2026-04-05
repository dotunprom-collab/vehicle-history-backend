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
      const response = await axios.post(
        "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
        { registrationNumber: reg },
        {
          headers: {
            "x-api-key": process.env.DVLA_API_KEY,
            "Content-Type": "application/json"
          }
        }
      );

      return {
        reg,
        make: response.data.make,
        year: response.data.yearOfManufacture,
        fuel: response.data.fuelType,
        colour: response.data.colour,
        motStatus: response.data.motStatus,
        taxStatus: response.data.taxStatus,
      };

    } catch (error: any) {
      console.error("🚨 DVLA ERROR:", error.message);

      return {
        reg,
        error: "DVLA data unavailable"
      };
    }
  }

  // =========================
  // 🔴 FULL PREMIUM REPORT
  // =========================
  async getFull(reg: string) {
    try {
      const apiKey = process.env.RAPID_API_KEY;

      const url = `https://www.rapidcarcheck.co.uk/api/?key=${apiKey}&domain=vehicle-history-backend-production.up.railway.app&plate=${reg}`;

      const response = await axios.get(url);
      const data = response.data;

      console.log("🔥 FULL API RESPONSE START 🔥");
      console.log(JSON.stringify(data, null, 2));
      console.log("🔥 FULL API RESPONSE END 🔥");

      if (data.HasError || !data.Results) {
        return { reg, error: data.status_msg || "No data" };
        
      }
      
      const vehicle =
        data.Results?.InitialVehicleCheckModel?.BasicVehicleDetailsModel;

      const mileage = Number(vehicle?.AverageMileage) || 0;

      const premium = {
        make: vehicle.Make,
        model: vehicle.Model,
        year: vehicle.DateOfFirstRegistration,
        fuel: vehicle.FuelType,
        colour: vehicle.Colour,
        mileage,
        engineSize: vehicle.CylinderCapacity,
        bodyStyle: vehicle.BodyStyle,

        finance: data.Results?.FinanceModel?.HasFinance ? "outstanding" : "clear",
        stolen: data.Results?.StolenCheckModel?.IsStolen ? "yes" : "no",
        writeOff: data.Results?.InsuranceWriteOffModel?.IsWriteOff ? "yes" : "no"
      };

      const riskScore = this.calculateRisk(premium);
      const insights = this.generateInsights(premium);
      const estimatedValue = this.estimateValue(premium);

      // ✅ SAVE REPORT BEFORE RETURN
await this.reportRepository.save({
  reg,
  make: premium.make,
  model: premium.model,
  riskScore,
  data: premium
});

return {
  reg,
  ...premium,
  riskScore,
  insights,
  estimatedValue
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
  // 🧠 RISK ENGINE
  // =========================
  private calculateRisk(data: any): number {
    let score = 0;

    if (data.finance === "outstanding") score += 40;
    if (data.stolen === "yes") score += 100;
    if (data.writeOff === "yes") score += 50;

    if (data.mileage > 120000) score += 15;

    return Math.min(score, 100);
  }

  // =========================
  // 🤖 INSIGHTS ENGINE
  // =========================
  private generateInsights(data: any): string[] {
    const insights = [];

    if (data.finance === "outstanding") {
      insights.push("⚠ Outstanding finance detected");
    }

    if (data.stolen === "yes") {
      insights.push("🚨 Vehicle reported stolen");
    }

    if (data.writeOff === "yes") {
      insights.push("⚠ Insurance write-off recorded");
    }

    if (data.mileage > 100000) {
      insights.push("High mileage — expect wear & tear");
    }

    if (insights.length === 0) {
      insights.push("✅ No major risks detected");
    }

    return insights;
  }

  // =========================
  // 💰 VALUE ENGINE
  // =========================
  private estimateValue(data: any): number {
    let base = 10000;

    const mileagePenalty = data.mileage * 0.05;

    return Math.max(base - mileagePenalty, 1000);
  }

async getReports() {
  return this.reportRepository.find({
    order: { createdAt: 'DESC' }
  });
}

}