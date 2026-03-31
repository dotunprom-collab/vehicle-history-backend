import { Controller, Post, Body, Get } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  // ✅ PREVIEW (WORKING)
  @Post('preview')
  async preview(@Body() body: { registration: string }) {
    return this.vehicleService.getVehicle(body.registration);
  }

  // ✅ FULL REPORT (FIXED)
  @Post('full')
  async full(@Body() body: { registration: string }) {
    return this.vehicleService.getFullReport(body.registration);
  }
}

// ✅ HEALTH (separate class)
@Controller()
export class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}