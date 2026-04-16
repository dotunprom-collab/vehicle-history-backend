import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { AuthService } from '../auth/auth.service';

@Controller('payment')
export class PaymentController {
  constructor
  (private readonly paymentService: PaymentService, 
  private authService: AuthService,
  ) {}

  // 💳 CREATE CHECKOUT SESSION (FIXED FOR BUNDLES)
  @Post('checkout')
  async checkout(
  @Body() body: { reg: string; pkg?: string; bundle?: number }
) {
  return this.paymentService.createCheckoutSession(
    body.reg,
    body.pkg,
    body.bundle
  );
}

  // ✅ STRIPE SUCCESS (SECURE)
  @Get('success')
  async success(@Query('session_id') sessionId: string) {
  try {
    if (!sessionId) {
      return { error: 'Missing session ID' };
    }

    const session = await this.paymentService.getSession(sessionId);

    if (!session || 'error' in session) {
      return { error: 'Session not found' };
    }

    if (session.payment_status !== 'paid') {
      return { error: 'Payment not completed' };
    }

    const reg = session.metadata?.reg;
    const email = session.customer_email || 'guest';

    if (!reg) {
      return { error: 'No registration found' };
    }

    // 🔥 GENERATE JWT
    const token = this.authService.generateToken({
      email,
      reg,
      sessionId,
    });

    return {
      reg,
      token, // 🔥 SEND TOKEN
      status: 'paid',
    };

  } catch (err) {
    return { error: 'Failed to retrieve session' };
  }
}
}