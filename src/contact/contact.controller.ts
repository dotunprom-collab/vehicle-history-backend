import { Body, Controller, Post, HttpException, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EmailService } from '../common/email.service';

@Controller('contact')
export class ContactController {
  constructor(private readonly emailService: EmailService) {}

  @Post('submit')
  @Throttle({ default: { limit: 3, ttl: 3600000 } }) // 3 per hour per IP
  async submit(@Body() body: any) {
    // Honeypot — bots fill this in, humans don't
    if (body.website) {
      console.log('🐛 Honeypot triggered — silent reject');
      // Pretend success so the bot moves on
      return { success: true };
    }

    const { fname, lname, email, subject, reg, message } = body;

    // Basic validation
    if (!fname || typeof fname !== 'string' || fname.length > 100) {
      throw new HttpException('Invalid first name', HttpStatus.BAD_REQUEST);
    }
    if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 200) {
      throw new HttpException('Invalid email', HttpStatus.BAD_REQUEST);
    }
    if (!subject || typeof subject !== 'string') {
      throw new HttpException('Subject required', HttpStatus.BAD_REQUEST);
    }
    if (!message || typeof message !== 'string' || message.length < 5 || message.length > 5000) {
      throw new HttpException('Message must be 5–5000 characters', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.emailService.sendContactMessage({
        fname: String(fname).trim().slice(0, 100),
        lname: String(lname || '').trim().slice(0, 100),
        fromEmail: String(email).trim().toLowerCase().slice(0, 200),
        subject: String(subject).trim().slice(0, 50),
        reg: reg ? String(reg).trim().toUpperCase().slice(0, 10) : undefined,
        message: String(message).trim().slice(0, 5000),
      });
      return { success: true };
    } catch (err) {
      throw new HttpException('Failed to send message', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}