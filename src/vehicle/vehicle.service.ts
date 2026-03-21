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
        timeout: 2000, // 🔥 CRITICAL (reduce timeout)
      }
    );

    const data = response.data;

    return {
      reg,
      make: data.make,
      year: data.yearOfManufacture,
      fuel: data.fuelType,
      colour: data.colour,
      motStatus: data.motStatus,
    };

  } catch (error: any) {
    console.error("🚨 DVLA ERROR:", error.message);

    // 🔥 IMMEDIATE SAFE RESPONSE (NO DELAY)
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