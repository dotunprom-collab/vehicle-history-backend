import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    email?: string;
    sessionId?: string;
    reg?: string;
    [key: string]: any;
  };
}