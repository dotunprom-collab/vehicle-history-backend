import { Controller, Post, Body, Get } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

// ✅ HEALTH CHECK (ROOT "/")
@Controller()
export class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}

// ✅ VEHICLE ROUTES
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