import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // =========================
  // 💳 CREATE CHECKOUT SESSION
  // =========================
  @Post('checkout')
  async checkout(@Body() body: any) {
    const session = await this.paymentService.createCheckoutSession(body);
    return { url: session.url };
  }

  // =========================
  // ✅ STRIPE SUCCESS (NO JWT)
  // =========================
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
const email =
  session.customer_details?.email ||
  session.customer_email ||
  'guest';
const bundle = session.metadata?.bundle;
if (
  session.metadata?.type === 'bundle'
) {

  await this.paymentService.createBundle(

    email,

    Number(session.metadata.quantity || 1),

    session.metadata.tier || 'standard',
  );
}

      return {
        reg,
        email,
        sessionId, // ✅ THIS replaces JWT
        status: 'paid',
      };

    } catch (err) {
      return { error: 'Failed to retrieve session' };
    }
  }
}