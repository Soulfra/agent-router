/**
 * @calos/sdk - TypeScript Type Definitions
 * Official TypeScript types for the CALOS Platform SDK
 */

export interface CALOSConfig {
  /** Your CALOS API key (required) */
  apiKey: string;
  /** API base URL (default: https://api.calos.dev) */
  baseURL?: string;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
}

export interface ChatCompletionParams {
  /** The prompt to send to the model */
  prompt: string;
  /** Model to use (optional, auto-routed if not specified) */
  model?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature (0-1) */
  temperature?: number;
}

export interface ChatCompletionResponse {
  /** Generated text content */
  content: string;
  /** Usage statistics */
  usage: {
    /** Input tokens consumed */
    prompt_tokens: number;
    /** Output tokens generated */
    completion_tokens: number;
    /** Total tokens */
    total_tokens: number;
    /** LLM provider used */
    provider?: string;
  };
  /** Provider that fulfilled the request */
  provider: string;
  /** Model used */
  model: string;
}

export interface ChatStreamChunk {
  /** Chunk of generated text */
  content?: string;
  /** Usage stats (sent with final chunk) */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    provider?: string;
  };
}

export interface UsageStats {
  /** Tokens used in current billing period */
  tokens_used_this_period: number;
  /** Token limit for current period (null = unlimited) */
  tokens_limit: number | null;
  /** Cost in cents for current period */
  cost_this_period_cents: number;
  /** Cost limit in cents (null = unlimited) */
  cost_limit_cents: number | null;
  /** Number of API calls made */
  api_calls_this_period: number;
  /** End of current billing period */
  current_period_end: string;
  /** Pricing model (metered, byok, hybrid, subscription) */
  pricing_model: string;
  /** Markup percentage applied */
  markup_percent: number;
}

export interface ProviderUsage {
  /** Provider name (openai, anthropic, deepseek, ollama) */
  provider: string;
  /** Number of requests */
  requests: number;
  /** Total tokens consumed */
  total_tokens: number;
  /** Total cost in cents */
  total_cost_cents: number;
  /** Average tokens per request */
  avg_tokens_per_request: number;
}

export interface UnbilledUsage {
  /** Number of unbilled requests */
  unbilled_requests: number;
  /** Unbilled tokens */
  unbilled_tokens: number;
  /** Unbilled cost in cents */
  unbilled_cost_cents: number;
}

export interface Tenant {
  /** Tenant ID */
  tenant_id: string;
  /** Tenant slug (subdomain) */
  tenant_slug: string;
  /** Tenant name */
  name: string;
  /** Tenant status */
  status: 'active' | 'trial' | 'suspended' | 'cancelled';
  /** Billing period start */
  current_period_start: string;
  /** Billing period end */
  current_period_end: string;
  /** Maximum users allowed */
  max_users: number;
  /** Current user count */
  users_count: number;
  /** Custom domain (if configured) */
  custom_domain?: string;
  /** Whitelabel logo URL */
  logo_url?: string;
  /** Created timestamp */
  created_at: string;
}

/**
 * Chat resource - AI chat completions
 */
export declare class Chat {
  /**
   * Create a chat completion
   */
  complete(params: ChatCompletionParams): Promise<ChatCompletionResponse>;

  /**
   * Create a streaming chat completion
   */
  stream(
    params: ChatCompletionParams,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResponse>;
}

/**
 * Usage resource - Track usage and billing
 */
export declare class Usage {
  /**
   * Get current period usage
   */
  getCurrent(): Promise<UsageStats>;

  /**
   * Get usage breakdown by provider
   */
  getByProvider(params?: { days?: number }): Promise<ProviderUsage[]>;

  /**
   * Get unbilled usage
   */
  getUnbilled(): Promise<UnbilledUsage>;
}

/**
 * Tenants resource - Manage tenant settings (super admin only)
 */
export declare class Tenants {
  /**
   * List all tenants (super admin only)
   */
  list(): Promise<Tenant[]>;

  /**
   * Get tenant details
   */
  get(tenantId: string): Promise<Tenant>;

  /**
   * Update tenant
   */
  update(tenantId: string, updates: Partial<Tenant>): Promise<Tenant>;
}

/**
 * Custom error classes
 */
export declare class CALOSError extends Error {
  statusCode?: number;
  response?: any;
  constructor(message: string, statusCode?: number, response?: any);
}

export declare class AuthenticationError extends CALOSError {
  constructor(message: string, response?: any);
}

export declare class RateLimitError extends CALOSError {
  constructor(message: string, response?: any);
}

export declare class UsageLimitError extends CALOSError {
  constructor(message: string, response?: any);
}

export declare class APIError extends CALOSError {
  constructor(message: string, statusCode: number, response?: any);
}

/**
 * Main CALOS SDK client
 */
export declare class CALOS {
  /** Chat resource */
  chat: Chat;
  /** Usage resource */
  usage: Usage;
  /** Tenants resource (super admin only) */
  tenants: Tenants;

  /**
   * Initialize CALOS client
   *
   * @example
   * ```typescript
   * const calos = new CALOS({
   *   apiKey: 'sk-tenant-abc123',
   *   baseURL: 'https://yoursubdomain.calos.dev'
   * });
   * ```
   */
  constructor(config: CALOSConfig);

  /**
   * Get SDK version
   */
  static readonly version: string;
}

export default CALOS;
