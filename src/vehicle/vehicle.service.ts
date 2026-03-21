import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class VehicleService {
  async getVehicle(reg: string) {
  try {
    if (!process.env.DVLA_API_KEY) {
      console.error("❌ DVLA API KEY MISSING");
      return { error: "Server config error" };
    }

    const response = await axios.post(
      'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
      {
        registrationNumber: reg,
      },
      {
        headers: {
          'x-api-key': process.env.DVLA_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 5000, // 🔥 prevent hanging
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
    console.error("🚨 DVLA ERROR FULL:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // 🔥 NEVER crash app
    return {
      error: "Vehicle lookup failed",
      };
    }
  }
}