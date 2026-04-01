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
  console.log("🚀 FULL REPORT CALLED:", reg);
  console.log("🔑 API KEY:", process.env.RAPID_API_KEY);
  try {
    const apiKey = process.env.RAPID_API_KEY;

    const url = `https://www.rapidcarcheck.co.uk/api/?key=${apiKey}&domain=vehicle-history-backend-production.up.railway.app&plate=${reg}`;

    console.log("🌍 REQUEST URL:", url);

    const response = await axios.get(url);
    const data = response.data;

    console.log("RAW RAPID:", JSON.stringify(data, null, 2));

    // ✅ HANDLE ERROR RESPONSE
    if (data.status !== 1) {
      return {
        reg,
        error: data.status_msg || "No vehicle data found"
      };
    }

    // ✅ FLEXIBLE DATA EXTRACTION (IMPORTANT)
    const vehicle =
      data.Results?.InitialVehicleCheckModel ||
      data.vehicle ||
      data.data ||
      data;

    return {
      reg,
      make: vehicle.Make || vehicle.make || "N/A",
      year: vehicle.YearOfManufacture || vehicle.year || "N/A",
      fuel: vehicle.FuelType || vehicle.fuel || "N/A",
      colour: vehicle.Colour || vehicle.colour || "N/A",
      mileage: vehicle.AverageMileage || vehicle.mileage || 0,
      bodyStyle: vehicle.BodyStyle || "N/A",
      bhp: vehicle.Bhp || "N/A",
      engineSize: vehicle.EngineSize || "N/A",
      riskScore: calculateRiskScore(vehicle)
    };

  } catch (error: any) {
    console.error("🔥 RAPID ERROR:", error.response?.data || error.message);

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