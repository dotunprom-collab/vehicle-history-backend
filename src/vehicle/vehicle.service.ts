import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class VehicleService {
async getVehicle(reg: string) {
  try {
    const response = await axios.post(
      'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
      { registrationNumber: reg },
      {
        headers: {
          'x-api-key': process.env.DVLA_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 2000,
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

    // ✅ NEVER crash backend
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
}