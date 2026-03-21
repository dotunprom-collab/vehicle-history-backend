import { Injectable } from '@nestjs/common';

@Injectable()
export class VehicleService {
  async getVehicle(reg: string) {
    return {
      reg,
      make: "TEST",
      year: 2020,
      fuel: "PETROL",
      colour: "BLACK",
      motStatus: "Valid",
    };
  }
}