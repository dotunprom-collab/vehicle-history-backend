import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  generateToken(payload: any) {
  return this.jwtService.sign(payload);
}

  verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      return null;
    }
  }

  validateToken(token: string) {
  return this.jwtService.verify(token);
}
}