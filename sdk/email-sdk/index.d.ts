/**
 * TypeScript definitions for @calos/email-sdk
 */

export interface CalosEmailConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body?: string;
  html?: string;
  from?: string;
  userId?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  provider?: string;
  recipients?: number;
  error?: string;
  code?: string;
}

export interface AddRecipientOptions {
  userId?: string;
  metadata?: Record<string, any>;
}

export interface AddRecipientResult {
  success: boolean;
  recipient?: string;
  status?: string;
  token?: string;
  expiresAt?: string;
  confirmationUrl?: string;
  error?: string;
  code?: string;
}

export interface GetRecipientsOptions {
  userId?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface Recipient {
  user_id: string;
  recipient_email: string;
  status: string;
  confirmed_at?: string;
  bounce_count?: string;
  spam_complaint?: string;
}

export interface GetRecipientsResult {
  success: boolean;
  recipients: Recipient[];
  count: number;
}

export interface StatusOptions {
  userId?: string;
}

export interface RateLimits {
  hourly: {
    current: number;
    limit: number;
    resetAt: string;
  };
  daily: {
    current: number;
    limit: number;
    resetAt: string;
  };
  monthly: {
    current: number;
    limit: number;
    resetAt: string;
  };
  total: number;
}

export interface WhitelistStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  bounces: number;
  spamComplaints: number;
}

export interface ReputationStats {
  score: number;
  status: string;
  bounces: number;
  spamComplaints: number;
  totalSends: number;
}

export interface StatusResult {
  system?: {
    initialized: boolean;
    poller?: object;
    smtp?: object;
  };
  user?: {
    userId: string;
    rateLimits: RateLimits;
    whitelist: WhitelistStats;
    reputation: ReputationStats;
    relayStats: object;
  };
  global?: {
    rateLimits: object;
  };
  timestamp: string;
}

export interface HealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: boolean;
    smtp: boolean;
    poller: boolean;
  };
  timestamp: string;
  error?: string;
}

export declare class CalosError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code: string);
}

export declare class CalosEmailClient {
  constructor(config?: CalosEmailConfig);

  send(options: SendEmailOptions): Promise<SendEmailResult>;
  addRecipient(email: string, options?: AddRecipientOptions): Promise<AddRecipientResult>;
  removeRecipient(email: string, options?: AddRecipientOptions): Promise<{ success: boolean }>;
  getRecipients(options?: GetRecipientsOptions): Promise<GetRecipientsResult>;
  getStatus(options?: StatusOptions): Promise<StatusResult>;
  sendTest(to: string): Promise<SendEmailResult>;
  healthCheck(): Promise<HealthResult>;
}

export declare function createClient(config?: CalosEmailConfig): CalosEmailClient;

export declare const email: CalosEmailClient;

export { CalosEmailClient as default };
