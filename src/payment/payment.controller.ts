import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('checkout')
  createCheckout(@Body() body: { reg: string }) {
    return this.paymentService.createCheckoutSession(body.reg);
  }

  // ✅ NEW CORRECT SUCCESS HANDLER
@Get('success')
async handleSuccess(@Query('session_id') sessionId: string) {
  if (!sessionId) {
    return { error: 'No session ID provided' };
  }

  const session = await this.paymentService.getSession(sessionId);

  const reg = session.metadata?.reg;

  if (!reg) {
    return { error: 'No registration found in Stripe session' };
  }

  return {
    reg,
  };
}
}