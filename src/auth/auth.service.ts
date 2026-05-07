import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  generateToken(payload: any) {
  return this.jwtService.sign(payload);
}

// ─── UPGRADE TOKEN ────────────────────────────────────────────
// Used when emailing Standard buyers a £3 upgrade link.
// Token proves: "this email purchased Standard for this reg".
generateUpgradeToken(payload: {
  reg: string;
  email: string;
  fromTier: 'standard';
}): string {
  return this.jwtService.sign(
    {
      reg: payload.reg.toUpperCase().trim(),
      email: payload.email.toLowerCase().trim(),
      fromTier: payload.fromTier,
      type: 'upgrade_offer',
    },
    {
      secret: process.env.JWT_SECRET,
      expiresIn: '7d',
    },
  );
}

verifyUpgradeToken(token: string): {
  reg: string;
  email: string;
  fromTier: string;
  type: string;
} | null {
  try {
    const decoded: any = this.jwtService.verify(token, {
      secret: process.env.JWT_SECRET,
    });
    if (decoded.type !== 'upgrade_offer') {
      console.warn('[AUTH] Token type mismatch', decoded.type);
      return null;
    }
    if (decoded.fromTier !== 'standard') {
      console.warn('[AUTH] Upgrade token must be from standard tier');
      return null;
    }
    return decoded;
  } catch (err: any) {
    console.warn('[AUTH] Upgrade token invalid:', err.message);
    return null;
  }
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