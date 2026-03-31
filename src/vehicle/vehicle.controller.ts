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

  @Post('preview')
  async preview(@Body() body: { registration: string }) {
    return this.vehicleService.getVehicle(body.registration);
  }

  @Post('full')
  async full(@Body() body: { registration: string }) {
    return this.vehicleService.getFullReport(body.registration);
  }
}