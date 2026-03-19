import { Controller, Post, Body } from '@nestjs/common';
import { VehicleService } from './vehicle.service';

@Controller('vehicle')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post('preview')
  preview(@Body() body: { registration: string }) {
    return this.vehicleService.getVehicle(body.registration);
  }
}