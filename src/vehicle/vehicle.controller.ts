import { Controller, Post, Body } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post('preview')
async preview(@Body() body: { registration: string }) {
  console.log("🔥 HIT CONTROLLER:", body);

  return {
    reg: body.registration || "NONE",
    make: "WORKING",
    year: 2024,
    fuel: "PETROL",
    colour: "BLACK",
    motStatus: "Valid",
  };
    }
  }
}