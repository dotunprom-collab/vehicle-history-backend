import { Resend } from 'resend';

import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  constructor(private readonly authService: AuthService) {}

  // Tier-aware report email.
  // Standard buyers get a £3 upgrade upsell block. Premium buyers don't.
 async sendReport({
  to,
  reg,
  tier,
  pdfBuffer,
}: {
  to: string;
  reg: string;
  tier: string;
  pdfBuffer: Buffer;
}) {
  console.log('[EMAIL DEBUG] sendReport called with:', { to, reg, tier, hasBuffer: !!pdfBuffer });
  try {
    // ── Tier-aware vars ──────────────────────────────────────
    const isStandard = tier === 'standard';
    const tierLabel = isStandard ? 'STANDARD-TIER' : 'PREMIUM-TIER';

      const subject = isStandard
        ? `Your ${reg} report is ready — finance & theft checks still hidden`
        : `Your ${reg} Premium report is ready`;

    // ── Upgrade link (Standard only) ─────────────────────────
// Build a signed JWT proving this email purchased Standard for this reg.
// Link expires in 7 days. The /payment/upgrade-link endpoint verifies it
// and redirects directly to a £3 Stripe checkout.
const BACKEND_URL =
  process.env.BACKEND_URL ||
  'https://vehicle-history-backend-production.up.railway.app';

let upgradeUrl = '';
console.log('[EMAIL DEBUG] tier received:', tier, '| isStandard:', isStandard);

if (isStandard) {
  try {
    const upgradeToken = this.authService.generateUpgradeToken({
      reg,
      email: to,
      fromTier: 'standard',
    });
    console.log('[EMAIL DEBUG] token generated, length:', upgradeToken?.length || 0);
    upgradeUrl = `${BACKEND_URL}/payment/upgrade-link?token=${upgradeToken}`;
    console.log('[EMAIL DEBUG] upgradeUrl built:', upgradeUrl.substring(0, 100) + '...');
  } catch (err: any) {
    console.error('[EMAIL DEBUG] FAILED to generate upgrade token:', err.message, err.stack);
  }
} else {
  console.log('[EMAIL DEBUG] not standard tier, skipping upgrade link');
}

      // ── Conditional upsell HTML block ────────────────────────
      const upsellBlock = isStandard
        ? `
        <div style="
          background:#fef3c7;
          border:2px solid #b45309;
          padding:24px;
          margin-bottom:24px;
        ">
          <div style="
            font-family:'Courier New',Courier,monospace;
            font-size:11px;
            font-weight:700;
            letter-spacing:1.5px;
            color:#7c2d12;
            margin-bottom:8px;
          ">
            ▲ INCOMPLETE REPORT
          </div>
          <h2 style="
            font-family:Arial,sans-serif;
            margin:0 0 12px 0;
            color:#7c2d12;
            font-size:18px;
            font-weight:700;
            line-height:1.3;
          ">
            Your Standard report is missing 3 critical checks
          </h2>
          <p style="
            font-family:Arial,sans-serif;
            margin:0 0 16px 0;
            color:#451a03;
            font-size:14px;
            line-height:1.5;
          ">
            Standard tells you about MOT, keepers, and write-off status — but the most expensive risks remain hidden:
          </p>
          <table style="
            width:100%;
            border-collapse:collapse;
            margin-bottom:20px;
            font-family:'Courier New',Courier,monospace;
            font-size:13px;
          ">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #fde68a;color:#451a03;font-weight:700;">
                OUTSTANDING FINANCE
              </td>
              <td style="padding:8px 0;border-bottom:1px solid #fde68a;text-align:right;">
                <span style="background:#fee2e2;color:#991b1b;padding:3px 10px;font-size:11px;font-weight:700;letter-spacing:1px;">[LOCKED]</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #fde68a;color:#451a03;font-weight:700;">
                STOLEN VEHICLE CHECK
              </td>
              <td style="padding:8px 0;border-bottom:1px solid #fde68a;text-align:right;">
                <span style="background:#fee2e2;color:#991b1b;padding:3px 10px;font-size:11px;font-weight:700;letter-spacing:1px;">[LOCKED]</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#451a03;font-weight:700;">
                INSURANCE WRITE-OFF
              </td>
              <td style="padding:8px 0;text-align:right;">
                <span style="background:#fee2e2;color:#991b1b;padding:3px 10px;font-size:11px;font-weight:700;letter-spacing:1px;">[LOCKED]</span>
              </td>
            </tr>
          </table>
          <p style="
            font-family:Arial,sans-serif;
            margin:0 0 20px 0;
            color:#7c2d12;
            font-size:13px;
            line-height:1.5;
          ">
            <strong>1 in 3</strong> UK used cars carry hidden finance.
            <strong>1 in 14</strong> is a recorded write-off.
            Don't drive blind.
          </p>
          <table cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
            <tr>
              <td style="background:#b45309;text-align:center;">
                <a href="${upgradeUrl}"
                   target="_blank"
                   style="
                    display:inline-block;
                    padding:14px 28px;
                    font-family:Arial,sans-serif;
                    font-size:15px;
                    font-weight:700;
                    color:#ffffff;
                    text-decoration:none;
                    letter-spacing:0.3px;
                  ">
                  Unlock Premium for £3 →
                </a>
              </td>
            </tr>
          </table>
          <p style="
            font-family:Arial,sans-serif;
            margin:14px 0 0 0;
            color:#7c2d12;
            font-size:11px;
            text-align:center;
          ">
            Same registration · Instant unlock · Secure Stripe checkout
          </p>
        </div>
        `
        : '';

      // ── Send email ───────────────────────────────────────────
      await this.resend.emails.send({
        from: 'CheapRegCheck <reports@cheapregcheck.com>',
        to,
        subject: subject,
        html: `
          <div style="
            font-family:Arial,sans-serif;
            max-width:600px;
            margin:auto;
            background:#fafafa;
            color:#111827;
          ">
            <!-- Top classification band -->
            <div style="
              background:#000000;
              padding:14px 24px;
              font-family:'Courier New',Courier,monospace;
            ">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="color:#ffffff;font-size:11px;font-weight:700;letter-spacing:2px;">
                    VEHICLE HISTORY AUDIT
                  </td>
                  <td style="color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1.5px;text-align:right;">
                    ${tierLabel}
                  </td>
                </tr>
              </table>
            </div>

            <!-- Body -->
            <div style="padding:32px 24px;background:#ffffff;">

              <h1 style="
                font-family:Arial,sans-serif;
                font-size:24px;
                font-weight:700;
                color:#111827;
                margin:0 0 8px 0;
                line-height:1.2;
              ">
                Your report is ready
              </h1>
              <p style="
                font-family:Arial,sans-serif;
                font-size:15px;
                color:#6b7280;
                margin:0 0 24px 0;
                line-height:1.5;
              ">
                Thank you for your purchase. Your vehicle history audit for
                <strong style="color:#111827;font-family:'Courier New',Courier,monospace;">${reg.toUpperCase()}</strong>
                is attached to this email.
              </p>

              ${upsellBlock}

              <h3 style="
                font-family:'Courier New',Courier,monospace;
                font-size:11px;
                font-weight:700;
                color:#525252;
                letter-spacing:1.5px;
                margin:0 0 12px 0;
              ">
                § REPORT METADATA
              </h3>
              <table style="
                width:100%;
                border-collapse:collapse;
                margin-bottom:24px;
                font-family:'Courier New',Courier,monospace;
                font-size:12px;
              ">
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#525252;letter-spacing:1px;">
                    REGISTRATION
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700;color:#111827;text-align:right;">
                    ${reg.toUpperCase()}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#525252;letter-spacing:1px;">
                    CLASSIFICATION
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700;color:#111827;text-align:right;">
                    ${tierLabel}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#525252;letter-spacing:1px;">
                    GENERATED
                  </td>
                  <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-weight:700;color:#111827;text-align:right;">
                    ${new Date().toISOString().substring(0, 10)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#525252;letter-spacing:1px;">
                    VALIDITY
                  </td>
                  <td style="padding:10px 0;font-weight:700;color:#111827;text-align:right;">
                    24 HOURS
                  </td>
                </tr>
              </table>

              <div style="
                background:#f3f4f6;
                border-left:3px solid #000000;
                padding:14px 18px;
                margin-bottom:24px;
              ">
                <p style="
                  font-family:Arial,sans-serif;
                  margin:0;
                  color:#374151;
                  font-size:13px;
                  line-height:1.5;
                ">
                  <strong style="color:#111827;">Important:</strong>
                  Review the attached report carefully before purchasing any vehicle.
                  We strongly recommend an independent inspection by a qualified mechanic.
                  Vehicle status (tax, MOT, finance) can change at any time.
                </p>
              </div>

            </div>

            <!-- Footer -->
            <div style="
              background:#000000;
              padding:20px 24px;
              text-align:center;
              font-family:'Courier New',Courier,monospace;
            ">
              <p style="margin:0 0 6px 0;color:#ffffff;font-size:11px;font-weight:700;letter-spacing:2px;">
                CHEAPREGCHECK.COM
              </p>
              <p style="margin:0;color:#a3a3a3;font-size:10px;letter-spacing:1.5px;">
                AUTOMATED VEHICLE INTELLIGENCE
              </p>
            </div>

          </div>
        `,
        attachments: [
          {
            filename: `${reg}-report.pdf`,
            content: pdfBuffer,
          },
        ],
      });

      console.log('✅ EMAIL SENT', { reg, tier, to });
    } catch (err) {
      console.error('❌ EMAIL SEND FAILED', err);
      throw err;
    }
  }

  async sendContactMessage({
    fname,
    lname,
    fromEmail,
    subject,
    reg,
    message,
  }: {
    fname: string;
    lname: string;
    fromEmail: string;
    subject: string;
    reg?: string;
    message: string;
  }) {
    const subjectLabels: Record<string, string> = {
      report: 'Question about report',
      payment: 'Payment or billing',
      refund: 'Refund request',
      data: 'Data accuracy',
      technical: 'Technical problem',
      other: 'Other',
    };
    const subjectLabel = subjectLabels[subject] || subject;
    const fullName = [fname, lname].filter(Boolean).join(' ');

    try {
      await this.resend.emails.send({
        from: 'CheapRegCheck Contact <noreply@cheapregcheck.com>',
        to: 'support@cheapregcheck.com',
        replyTo: fromEmail,
        subject: `[Contact] ${subjectLabel} — ${fullName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111827;">
            <h2 style="font-size:18px;margin:0 0 16px 0;">New contact form submission</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
              <tr><td style="padding:6px 0;color:#6b7280;width:130px;">Name</td><td style="padding:6px 0;font-weight:600;">${fullName || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;font-weight:600;"><a href="mailto:${fromEmail}">${fromEmail}</a></td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;">Subject</td><td style="padding:6px 0;font-weight:600;">${subjectLabel}</td></tr>
              ${reg ? `<tr><td style="padding:6px 0;color:#6b7280;">Registration</td><td style="padding:6px 0;font-weight:600;font-family:'Courier New',monospace;">${reg}</td></tr>` : ''}
            </table>
            <h3 style="font-size:14px;margin:0 0 8px 0;color:#525252;">Message</h3>
            <div style="background:#f3f4f6;border-left:3px solid #16a34a;padding:14px 18px;white-space:pre-wrap;font-size:14px;line-height:1.6;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;">Reply directly to this email to respond to ${fullName || 'the customer'}.</p>
          </div>
        `,
      });
      console.log('✅ CONTACT EMAIL SENT', { from: fromEmail, subject: subjectLabel });
    } catch (err) {
      console.error('❌ CONTACT EMAIL FAILED', err);
      throw err;
    }
  }
}