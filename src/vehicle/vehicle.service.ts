import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class VehicleService {

  // 🔹 FREE DVLA PREVIEW
  async getVehicle(reg: string) {
    try {
      const response = await axios.post(
        "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
        {
          registrationNumber: reg
        },
        {
          headers: {
            "x-api-key": process.env.DVLA_API_KEY,
            "Content-Type": "application/json"
          }
        }
      );

      return {
        reg,
        make: response.data.make || "Unknown",
        year: response.data.yearOfManufacture || "N/A",
        fuel: response.data.fuelType || "N/A",
        colour: response.data.colour || "N/A",
        motStatus: response.data.motStatus || "Unknown",
      };

    } catch (error: any) {
      console.error("🚨 DVLA ERROR:", error.message);

      return {
        reg,
        make: "Unavailable",
        year: "N/A",
        fuel: "N/A",
        colour: "N/A",
        motStatus: "Unavailable",
      };
    }
  }

  // 🔥 FULL PREMIUM REPORT (RapidCarCheck)
  async getFullReport(reg: string) {
    try {
      const response = await axios.post(
        "https://api.rapidcarcheck.co.uk/v1/full-check",
        {
          vrm: reg
        },
        {
          headers: {
            "x-api-key": process.env.RAPID_API_KEY,
            "Content-Type": "application/json"
          }
        }
      );

      const data = response.data;

      return {
        reg,
        make: data.make || "Unknown",
        year: data.year || "N/A",
        fuel: data.fuel || "N/A",
        colour: data.colour || "N/A",

        // 🚨 PREMIUM DATA
        finance: data.finance?.status || "Unknown",
        stolen: data.stolen?.status || "Unknown",
        writeOff: data.writeOff?.status || "Unknown",
        mileage: data.mileage || [],
        owners: data.owners || "N/A",

        // 🎯 RISK SCORE
        riskScore: calculateRiskScore(data)
      };

    } catch (error: any) {
      console.error("🔥 RAPID API ERROR:", error.message);

      return {
        reg,
        error: "Failed to load premium data"
      };
    }
  }
}

// ✅ OUTSIDE CLASS (IMPORTANT)
function calculateRiskScore(data: any): number {
  let score = 0;

  if (data.finance?.status === "outstanding") score += 40;
  if (data.stolen?.status === "yes") score += 40;
  if (data.writeOff?.status === "yes") score += 30;

  return Math.min(score, 100);
}