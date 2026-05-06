import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Headers,
  Req,
  HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { Throttle } from '@nestjs/throttler';
import { logger } from '../logger';
import * as Sentry from '@sentry/node';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // =========================
  // 💳 CREATE CHECKOUT SESSION
  // =========================


@Throttle({
  default: {
    limit: 5,
    ttl: 60000,
  },
})
@Post('checkout')
async checkout(@Body() body: any) {
  const session =
    await this.paymentService
      .createCheckoutSession(body);

  return {
    url: session.url,
  };
}

@Post('webhook')
@HttpCode(200)
async webhook(
  @Req() req: any,
  @Headers('stripe-signature')
  signature: string,
) {
  console.log(
    'RAW BODY EXISTS:',
    !!req.body
  );
  console.log(
    'SIGNATURE EXISTS:',
    !!signature
  );
  return this.paymentService.handleWebhook(
    req.body,
    signature,
  );
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

logger.info({
  event: 'PAYMENT_SUCCESS',
  sessionId,
  email:
    session.customer_details?.email ||
    session.customer_email,
});

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
      Sentry.captureException(err);
      return { error: 'Failed to retrieve session' };
    }
  }
}