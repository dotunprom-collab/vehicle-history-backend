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

} as nodemailer.TransportOptions);

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
  }
  async sendReportEmail(
  email: string,
  reg: string,
  pdf: Buffer
) {
  // example with nodemailer
  console.log('EMAIL USER:', process.env.EMAIL_USER);
  console.log('EMAIL PASS EXISTS:', !!process.env.EMAIL_PASS);

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
}
}