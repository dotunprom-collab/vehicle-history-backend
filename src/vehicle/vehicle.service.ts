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
    const apiKey = "2fc5efb58dd5ca0d76fc1e2587d24ee3";

    const url = `https://www.rapidcarcheck.co.uk/api/?key=${apiKey}&domain=vehicle-history-backend-production.up.railway.app&plate=${reg}`;

    console.log("🌍 REQUEST URL:", url);

    const response = await axios.get(url);
    const data = response.data;

    console.log("RAW RAPID:", JSON.stringify(data, null, 2));

    // ✅ HANDLE ERROR RESPONSE
   // ✅ HANDLE ERROR RESPONSE
if (data.HasError || !data.Results) {
  return {
    reg,
    error: data.status_msg || "No vehicle data found"
  };
}

// ✅ CORRECT DATA EXTRACTION
const vehicle =
  data.Results?.InitialVehicleCheckModel?.BasicVehicleDetailsModel ||
  data.vehicle ||
  data.data ||
  data;

// ✅ RETURN CLEAN DATA
return {
  reg,
  make: vehicle.Make || "N/A",
  model: vehicle.Model || "N/A",
  year: vehicle.DateOfFirstRegistration || "N/A",
  fuel: vehicle.FuelType || "N/A",
  colour: vehicle.Colour || "N/A",
  mileage: vehicle.AverageMileage || 0,
  bodyStyle: vehicle.BodyStyle || "N/A",
  engineSize: vehicle.CylinderCapacity || "N/A",
  motDue: vehicle.DateMotDue || "N/A",
  taxDue: vehicle.DateRoadTaxDue || "N/A",
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