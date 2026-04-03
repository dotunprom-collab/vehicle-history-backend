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

  function clean(value: any) {
  if (!value || value === "..." || value === null) return "N/A";
  return value;
}

// ✅ RETURN CLEAN DATA
return {
  reg,
  make: clean(vehicle.Make),
  model: clean(vehicle.Model),
  year: clean(vehicle.DateOfFirstRegistration),
  fuel: clean(vehicle.FuelType),
  colour: clean(vehicle.Colour),
  mileage: Number(vehicle.AverageMileage) || 0,
  bodyStyle: clean(vehicle.BodyStyle),
  engineSize: clean(vehicle.CylinderCapacity),
  motDue: clean(vehicle.DateMotDue),
  taxDue: clean(vehicle.DateRoadTaxDue),

  // 🔥 NEW AI LAYER
  insights: generateInsights(vehicle),
  estimatedValue: estimateValue(vehicle),

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

function generateInsights(vehicle: any) {
  const insights: string[] = [];

  const mileage = Number(vehicle.AverageMileage) || 0;
  const age = vehicle.DateOfFirstRegistration || "";
  const motIssues = vehicle.MotResultsSummary?.MileageIssueIdentified;

  // 🚨 Mileage risk
  if (mileage > 100000) {
    insights.push("⚠️ High mileage vehicle — increased wear and tear risk.");
  } else if (mileage < 30000) {
    insights.push("✅ Low mileage — likely less mechanical stress.");
  }

  // 🚨 MOT issues
  if (motIssues) {
    insights.push("⚠️ Mileage inconsistency detected in MOT history.");
  } else {
    insights.push("✅ No mileage discrepancies found.");
  }

  // 🚨 MOT expiry
  if (vehicle.IsMOTDue) {
    insights.push("⚠️ MOT is due soon — may require inspection.");
  } else {
    insights.push("✅ MOT status looks valid.");
  }

  // 🚨 Tax
  if (vehicle.IsRoadTaxDue) {
    insights.push("⚠️ Road tax expired or due.");
  }

  return insights;
}

function estimateValue(vehicle: any): number {
  const base = 10000;

  const mileage = Number(vehicle.AverageMileage) || 0;
  const year = new Date(vehicle.DateOfFirstRegistrationParsed || "2015-01-01").getFullYear();

  let value = base;

  // depreciation by age
  const age = new Date().getFullYear() - year;
  value -= age * 800;

  // mileage impact
  value -= mileage * 0.05;

  // floor
  if (value < 1000) value = 1000;

  return Math.round(value);
}

// ✅ OUTSIDE CLASS (IMPORTANT)
function calculateRiskScore(data: any): number {
  let score = 0;

  if (data.finance?.status === "outstanding") score += 40;
  if (data.stolen?.status === "yes") score += 40;
  if (data.writeOff?.status === "yes") score += 30;

  return Math.min(score, 100);
}