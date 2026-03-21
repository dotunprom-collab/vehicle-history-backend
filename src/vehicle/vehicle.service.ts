import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class VehicleService {
  async getVehicle(reg: string) {
    try {
      // 🔥 safety check
      if (!process.env.DVLA_API_KEY) {
        console.error("❌ DVLA API KEY MISSING");
        return { error: "Server configuration error" };
      }

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