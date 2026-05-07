import { Resend } from 'resend';

export class EmailService {

  private resend = new Resend(
    process.env.RESEND_API_KEY,
  );

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

    try {

      await this.resend.emails.send({

        from: 'CheapRegCheck <reports@cheapregcheck.com>',

        to,

        subject:
          `Your Vehicle Report (${reg})`,

        html: `
          <h2>Your report is ready</h2>
          <p>Registration: ${reg}</p>
          <p>Tier: ${tier}</p>
        `,

        attachments: [
          {
            filename: `${reg}-report.pdf`,
            content: pdfBuffer,
          },
        ],
      });

      console.log('✅ EMAIL SENT');

    } catch (err) {

      console.error(
        '❌ EMAIL SEND FAILED',
        err,
      );

      throw err;
    }
  }

  async sendReportEmail(
    email: string,
    reg: string,
    pdf: Buffer,
  ) {

    try {

      await this.resend.emails.send({

        from: 'CheapRegCheck <reports@cheapregcheck.com>',

        to: email,

        subject:
          `Your Vehicle Report (${reg})`,

        text:
          'Your vehicle report is attached.',

        attachments: [
          {
            filename: `${reg}-report.pdf`,
            content: pdf,
          },
        ],
      });

      console.log('✅ EMAIL SENT');

    } catch (err) {

      console.error(
        '❌ EMAIL SEND FAILED',
        err,
      );

      throw err;
    }
  }
}