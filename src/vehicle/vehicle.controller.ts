import { Controller, Post, Body } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post('preview')
  async preview(@Body() body: { registration: string }) {
    try {
      const result = await this.vehicleService.getVehicle(body.registration);
      return result;
    } catch (err) {
      console.error("🔥 CONTROLLER ERROR:", err);

      return {
        error: "Service temporarily unavailable",
      };
    }
  }
}