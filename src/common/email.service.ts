import * as nodemailer from 'nodemailer';

export class EmailService {

  private transporter = nodemailer.createTransport({

    service: 'gmail',

    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },

    tls: {
      family: 4,
      rejectUnauthorized: false,
    },

    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,

  } as nodemailer.TransportOptions);

  constructor() {

    this.transporter.verify((error, success) => {

      if (error) {

        console.error(
          '❌ SMTP VERIFY FAILED',
          error,
        );

      } else {

        console.log(
          '✅ SMTP SERVER READY',
        );

      }

    });

  }

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

      await this.transporter.sendMail({

        from: `"CheapRegCheck" <${process.env.EMAIL_USER}>`,

        to,

        subject: `Your Vehicle Report (${reg})`,

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

    console.log(
      'EMAIL USER:',
      process.env.EMAIL_USER,
    );

    console.log(
      'EMAIL PASS EXISTS:',
      !!process.env.EMAIL_PASS,
    );

    try {

      await this.transporter.sendMail({

        from: `"CheapRegCheck" <${process.env.EMAIL_USER}>`,

        to: email,

        subject: `Your Vehicle Report (${reg})`,

        text: 'Your report is attached.',

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