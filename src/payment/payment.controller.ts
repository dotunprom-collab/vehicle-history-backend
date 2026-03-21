import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('checkout')
  createCheckout(@Body() body: { reg: string }) {
    return this.paymentService.createCheckoutSession(body.reg);
  }

@Get('success')
async success(@Query('session_id') sessionId: string) {
  const session = await this.paymentService.getSession(sessionId);

  // ✅ FIX: handle error case FIRST
  if ('error' in session) {
    return session;
  }

  const reg = session.metadata?.reg;

  if (!reg) {
    return { error: 'No registration found in session' };
  }

  return { reg };
}
}