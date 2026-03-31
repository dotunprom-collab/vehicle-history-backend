import { Controller, Post, Body, Get } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

// ✅ HEALTH
@Controller()
export class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}

// ✅ VEHICLE
@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  // 🔹 FREE PREVIEW
  @Post('preview')
  async preview(@Body() body: { registration: string }) {
    return this.vehicleService.getVehicle(body.registration);
  }

  // 🚀 FULL REPORT
  @Post('full')
  async getFull(@Body() body: { registration: string }) {
    return this.vehicleService.getFullReport(body.registration);
  }
}