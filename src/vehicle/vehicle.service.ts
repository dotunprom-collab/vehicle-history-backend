import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class VehicleService {

  // 🟢 FREE DVLA CHECK (unchanged)
  async getVehiclePreview(reg: string) {
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
      };

    } catch (error: any) {
      console.error("DVLA ERROR:", error.message);

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

  // 🔥 PAID FULL CHECK (NEW)
  async getFullReport(reg: string) {
    try {
      const response = await axios.post(
        process.env.RAPID_API_URL!,
        {
          registrationNumber: reg
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
        make: data.make,
        model: data.model,
        year: data.year,
        fuel: data.fuel,
        colour: data.colour,
        motStatus: data.motStatus,

        // 🔥 PREMIUM DATA
        stolen: data.stolen || false,
        finance: data.finance || false,
        writeOff: data.writeOff || false,
        mileageFlag: data.mileageFlag || false,
      };

    } catch (error: any) {
      console.error("RAPID API ERROR:", error.message);

      return {
        error: "Failed to fetch full report"
      };
    }
  }
}