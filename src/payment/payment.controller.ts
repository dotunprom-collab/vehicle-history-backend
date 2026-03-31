import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // 💳 CREATE CHECKOUT SESSION
  @Post('checkout')
  async checkout(@Body() body: { reg: string; pkg: string }) {
    return this.paymentService.createCheckoutSession(body.reg, body.pkg);
  }

  // ✅ STRIPE SUCCESS HANDLER
  @Get('success')
async success(@Query('session_id') sessionId: string) {
  try {
    if (!sessionId) {
      return { error: 'Missing session ID' };
    }

    const session = await this.paymentService.getSession(sessionId);

    // ✅ TYPE GUARD
    if (!session || 'error' in session) {
      return { error: 'Session not found' };
    }

    const reg = session.metadata?.reg;
    const pkg = session.metadata?.pkg;

    if (!reg) {
      return { error: 'No registration found in session' };
    }

    return {
      reg,
      pkg
    };

  } catch (err) {
    console.error("🔥 SUCCESS ENDPOINT ERROR:", err);
    return { error: 'Failed to retrieve session' };
  }
  }
}