import { Controller, Post, Body, Get } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

// ✅ HEALTH CHECK
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

  // 🟢 FREE DVLA PREVIEW
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

  // 🔥 PAID FULL REPORT
  @Post('full')
  async getFull(@Body() body: { registration: string }) {
    try {
      return await this.vehicleService.getFullReport(body.registration);
    } catch (err) {
      console.error("🔥 FULL REPORT ERROR:", err);

      return {
        error: "Failed to fetch full report",
      };
    }
  }
}