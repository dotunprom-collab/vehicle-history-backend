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

  // ✅ STRIPE SUCCESS (SECURE)
  @Get('success')
  async success(@Query('session_id') sessionId: string) {
    try {
      if (!sessionId) {
        return { error: 'Missing session ID' };
      }

      const session = await this.paymentService.getSession(sessionId);

      // ❌ INVALID SESSION
      if (!session || 'error' in session) {
        return { error: 'Session not found' };
      }

      // 🔒 CRITICAL: VERIFY PAYMENT ACTUALLY COMPLETED
      if (session.payment_status !== 'paid') {
        return { error: 'Payment not completed' };
      }

      const reg = session.metadata?.reg;
      const pkg = session.metadata?.pkg;

      if (!reg) {
        return { error: 'No registration found in session' };
      }

      return {
        reg,
        pkg,
        status: 'paid'
      };

    } catch (err) {
      console.error("🔥 SUCCESS ENDPOINT ERROR:", err);
      return { error: 'Failed to retrieve session' };
    }
  }
}