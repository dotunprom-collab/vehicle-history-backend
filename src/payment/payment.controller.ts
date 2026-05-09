import {Controller,Post,Body,Get,Res,Query,Headers,Req,HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { Throttle } from '@nestjs/throttler';
import { logger } from '../logger';
import * as Sentry from '@sentry/node';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';

@Controller('payment')
export class PaymentController {
 constructor(
  private readonly paymentService: PaymentService,
  private readonly authService: AuthService,
) {}

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

// ─── EMAIL UPGRADE LINK ────────────────────────────────────────
// Verifies signed JWT, creates £3 Stripe checkout, redirects.
@Get('upgrade-link')
async upgradeLink(
  @Query('token') token: string,
  @Res() res: Response,
) {
  if (!token) {
    return res
      .status(400)
      .send('Missing upgrade token. Please use the link from your email.');
  }

  const decoded = this.authService.verifyUpgradeToken(token);
  if (!decoded) {
    return res
      .status(401)
      .send(
        'This upgrade link is invalid or expired. Premium upgrade links are valid for 7 days after your Standard purchase. Please buy a fresh report from cheapregcheck.com.',
      );
  }

  try {
    const checkoutUrl = await this.paymentService.createUpgradeCheckout(
      decoded.reg,
      decoded.email,
    );
    return res.redirect(302, checkoutUrl);
  } catch (err: any) {
    console.error('[UPGRADE_LINK] Failed to create checkout:', err.message);
    return res
      .status(500)
      .send(
        'Could not create upgrade checkout. Please try again or contact support.',
      );
  }
}

@Post('webhook')
@HttpCode(200)
async webhook(
  @Req() req: any,
  @Headers('stripe-signature')
  signature: string,
) {
  try {
    return await this.paymentService.handleWebhook(
      req.body,
      signature,
    );
  } catch (err: any) {
    logger.error({
      event: 'STRIPE_WEBHOOK_HANDLER_FAILED',
      error: err?.message || String(err),
    });
    Sentry.captureException(err);
    // Re-throw so Nest returns 500 and Stripe retries.
    throw err;
  }
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