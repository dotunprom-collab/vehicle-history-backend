import { Controller, Post, Body } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

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