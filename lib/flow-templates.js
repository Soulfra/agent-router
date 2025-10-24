/**
 * Flow Templates
 *
 * Pre-built flows like DocuSign templates
 * Ready-to-use for common workflows
 *
 * Categories:
 * - Payment flows (Stripe-style)
 * - Signup flows (DocuSign-style)
 * - Subscription flows (recurring)
 * - Affiliate flows (referral → commission)
 */

class FlowTemplates {
  /**
   * Payment Flow
   * Like Stripe Checkout but as a flow
   *
   * Steps: Validate → Charge → Add Credits → Badge → Email
   */
  static paymentFlow() {
    return {
      name: 'Payment Flow',
      description: 'Complete payment processing with credits and badge reward',
      trigger: 'api',
      metadata: {
        category: 'payment',
        emoji: '💰',
        completion_badge: 'first_purchase'
      },
      steps: [
        {
          name: 'Validate Payment Method',
          type: 'condition',
          config: {
            condition: {
              field: 'payment_method_id',
              operator: 'not_equals',
              value: null
            }
          }
        },
        {
          name: 'Charge Payment',
          type: 'action',
          config: {
            action_code: 'stripe_charge',
            action_data: {
              amount: '{{amount}}',
              payment_method: '{{payment_method_id}}',
              customer: '{{customer_id}}'
            }
          },
          retryConfig: {
            maxRetries: 3,
            backoff: 'exponential'
          }
        },
        {
          name: 'Add Credits',
          type: 'database',
          config: {
            query: `
              INSERT INTO user_credits (user_id, credits_remaining, credits_purchased, purchase_date)
              VALUES ($1, $2, $3, NOW())
              ON CONFLICT (user_id) DO UPDATE
              SET credits_remaining = user_credits.credits_remaining + $2,
                  credits_purchased = user_credits.credits_purchased + $3
            `,
            params: ['{{user_id}}', '{{amount}}', '{{amount}}']
          }
        },
        {
          name: 'Award First Purchase Badge',
          type: 'badge',
          config: {
            badge_type: 'first_purchase'
          }
        },
        {
          name: 'Send Receipt Email',
          type: 'notify',
          config: {
            type: 'email',
            recipient: '{{user_email}}',
            message: 'Payment successful! ${{amount}} in credits added to your account.'
          }
        }
      ]
    };
  }

  /**
   * Signup Flow
   * Like DocuSign signature flow but for user signup
   *
   * Steps: Create Account → Verify Email → Welcome Badge → Onboarding Email
   */
  static signupFlow() {
    return {
      name: 'User Signup Flow',
      description: 'Complete user onboarding with verification and welcome',
      trigger: 'api',
      metadata: {
        category: 'authentication',
        emoji: '👤',
        completion_badge: 'newcomer'
      },
      steps: [
        {
          name: 'Create User Account',
          type: 'database',
          config: {
            query: `
              INSERT INTO users (email, password_hash, tenant_id, created_at)
              VALUES ($1, $2, $3, NOW())
              RETURNING user_id
            `,
            params: ['{{email}}', '{{password_hash}}', '{{tenant_id}}']
          }
        },
        {
          name: 'Send Verification Email',
          type: 'notify',
          config: {
            type: 'email',
            recipient: '{{email}}',
            message: 'Welcome! Click here to verify your email: {{verification_link}}'
          }
        },
        {
          name: 'Award Newcomer Badge',
          type: 'badge',
          config: {
            badge_type: 'newcomer'
          }
        },
        {
          name: 'Wait for Email Verification',
          type: 'wait',
          config: {
            duration: 60000 // 1 minute poll
          }
        },
        {
          name: 'Check Verification Status',
          type: 'condition',
          config: {
            condition: {
              field: 'email_verified',
              operator: 'equals',
              value: true
            }
          }
        },
        {
          name: 'Award Email Verified Badge',
          type: 'badge',
          config: {
            badge_type: 'email_verified'
          }
        },
        {
          name: 'Send Welcome Email',
          type: 'notify',
          config: {
            type: 'email',
            recipient: '{{email}}',
            message: 'Welcome to CALOS! Your account is ready.'
          }
        }
      ]
    };
  }

  /**
   * Subscription Flow
   * Like recurring payment setup
   *
   * Steps: Create Subscription → First Payment → Schedule Recurring → Badge
   */
  static subscriptionFlow() {
    return {
      name: 'Subscription Flow',
      description: 'Setup recurring subscription with automated billing',
      trigger: 'api',
      metadata: {
        category: 'subscription',
        emoji: '🔄',
        completion_badge: 'subscriber'
      },
      steps: [
        {
          name: 'Validate Plan',
          type: 'condition',
          config: {
            condition: {
              field: 'plan_id',
              operator: 'not_equals',
              value: null
            }
          }
        },
        {
          name: 'Create Stripe Subscription',
          type: 'http',
          config: {
            method: 'POST',
            url: 'https://api.stripe.com/v1/subscriptions',
            headers: {
              'Authorization': 'Bearer {{stripe_key}}'
            },
            body: {
              customer: '{{customer_id}}',
              items: [{ price: '{{price_id}}' }],
              payment_behavior: 'default_incomplete'
            }
          },
          retryConfig: {
            maxRetries: 3,
            backoff: 'exponential'
          }
        },
        {
          name: 'Save Subscription',
          type: 'database',
          config: {
            query: `
              INSERT INTO user_subscriptions (
                user_id, subscription_id, plan_id, status, billing_cycle_anchor, created_at
              )
              VALUES ($1, $2, $3, 'active', NOW(), NOW())
            `,
            params: ['{{user_id}}', '{{subscription_id}}', '{{plan_id}}']
          }
        },
        {
          name: 'Award Subscriber Badge',
          type: 'badge',
          config: {
            badge_type: 'subscriber'
          }
        },
        {
          name: 'Send Confirmation Email',
          type: 'notify',
          config: {
            type: 'email',
            recipient: '{{user_email}}',
            message: 'Subscription activated! You will be billed {{amount}} every {{interval}}.'
          }
        }
      ]
    };
  }

  /**
   * Affiliate Flow
   * Referral → Commission payout
   *
   * Steps: Track Referral → Verify Purchase → Calculate Commission → Payout → Badge
   */
  static affiliateFlow() {
    return {
      name: 'Affiliate Commission Flow',
      description: 'Process affiliate referral and payout commission',
      trigger: 'webhook',
      metadata: {
        category: 'affiliate',
        emoji: '💸',
        completion_badge: 'affiliate'
      },
      steps: [
        {
          name: 'Validate Referral',
          type: 'condition',
          config: {
            condition: {
              field: 'referrer_id',
              operator: 'not_equals',
              value: null
            }
          }
        },
        {
          name: 'Check Purchase Completed',
          type: 'condition',
          config: {
            condition: {
              field: 'payment_status',
              operator: 'equals',
              value: 'succeeded'
            }
          }
        },
        {
          name: 'Calculate Commission',
          type: 'database',
          config: {
            query: `
              SELECT
                amount * 0.10 as commission_amount,
                referrer_id
              FROM payments
              WHERE payment_id = $1
            `,
            params: ['{{payment_id}}']
          }
        },
        {
          name: 'Add Commission',
          type: 'database',
          config: {
            query: `
              INSERT INTO affiliate_commissions (
                affiliate_id, referred_user_id, commission_amount, status, created_at
              )
              VALUES ($1, $2, $3, 'pending', NOW())
            `,
            params: ['{{referrer_id}}', '{{user_id}}', '{{commission_amount}}']
          }
        },
        {
          name: 'Payout Commission',
          type: 'http',
          config: {
            method: 'POST',
            url: 'https://api.stripe.com/v1/transfers',
            headers: {
              'Authorization': 'Bearer {{stripe_key}}'
            },
            body: {
              amount: '{{commission_amount}}',
              currency: 'usd',
              destination: '{{affiliate_stripe_account}}'
            }
          },
          retryConfig: {
            maxRetries: 5,
            backoff: 'exponential'
          }
        },
        {
          name: 'Award Affiliate Badge',
          type: 'badge',
          config: {
            badge_type: 'affiliate'
          }
        },
        {
          name: 'Send Payout Notification',
          type: 'notify',
          config: {
            type: 'email',
            recipient: '{{affiliate_email}}',
            message: 'Commission paid! ${{commission_amount}} has been transferred to your account.'
          }
        }
      ]
    };
  }

  /**
   * Webhook Processing Flow
   * GitHub webhook → Process → Notify
   *
   * Steps: Validate Signature → Process Event → Log → Notify
   */
  static webhookFlow() {
    return {
      name: 'Webhook Processing Flow',
      description: 'Process incoming webhooks with validation and logging',
      trigger: 'webhook',
      metadata: {
        category: 'webhook',
        emoji: '🔗',
        completion_badge: null
      },
      steps: [
        {
          name: 'Validate Signature',
          type: 'condition',
          config: {
            condition: {
              field: 'signature_valid',
              operator: 'equals',
              value: true
            }
          }
        },
        {
          name: 'Log Webhook Event',
          type: 'database',
          config: {
            query: `
              INSERT INTO webhook_events (
                source, event_type, payload, received_at
              )
              VALUES ($1, $2, $3, NOW())
            `,
            params: ['{{source}}', '{{event_type}}', '{{payload}}']
          }
        },
        {
          name: 'Process Event',
          type: 'action',
          config: {
            action_code: 'process_webhook',
            action_data: {
              event_type: '{{event_type}}',
              payload: '{{payload}}'
            }
          }
        },
        {
          name: 'Notify Admin',
          type: 'notify',
          config: {
            type: 'email',
            recipient: '{{admin_email}}',
            message: 'Webhook received: {{event_type}}'
          }
        }
      ]
    };
  }

  /**
   * Scheduled Task Flow
   * Daily/weekly automated tasks
   *
   * Steps: Fetch Data → Process → Store → Report
   */
  static scheduledTaskFlow() {
    return {
      name: 'Scheduled Task Flow',
      description: 'Automated task execution on schedule',
      trigger: 'schedule',
      metadata: {
        category: 'automation',
        emoji: '⏰',
        completion_badge: null
      },
      steps: [
        {
          name: 'Fetch Data',
          type: 'http',
          config: {
            method: 'GET',
            url: '{{data_source_url}}',
            headers: {
              'Authorization': 'Bearer {{api_key}}'
            }
          }
        },
        {
          name: 'Process Data',
          type: 'action',
          config: {
            action_code: 'process_data',
            action_data: {
              data: '{{http_response}}'
            }
          }
        },
        {
          name: 'Store Results',
          type: 'database',
          config: {
            query: `
              INSERT INTO scheduled_task_results (
                task_name, results, executed_at
              )
              VALUES ($1, $2, NOW())
            `,
            params: ['{{task_name}}', '{{results}}']
          }
        },
        {
          name: 'Send Report',
          type: 'notify',
          config: {
            type: 'email',
            recipient: '{{admin_email}}',
            message: 'Task {{task_name}} completed. Results: {{results}}'
          }
        }
      ]
    };
  }

  /**
   * Error Recovery Flow
   * Retry failed operations
   *
   * Steps: Check Status → Retry → Log → Notify
   */
  static errorRecoveryFlow() {
    return {
      name: 'Error Recovery Flow',
      description: 'Automatically retry failed operations',
      trigger: 'event',
      metadata: {
        category: 'system',
        emoji: '🔄',
        completion_badge: null
      },
      steps: [
        {
          name: 'Check Error Type',
          type: 'condition',
          config: {
            condition: {
              field: 'error_type',
              operator: 'equals',
              value: 'retryable'
            }
          }
        },
        {
          name: 'Retry Operation',
          type: 'action',
          config: {
            action_code: 'retry_operation',
            action_data: {
              operation_id: '{{operation_id}}'
            }
          },
          retryConfig: {
            maxRetries: 5,
            backoff: 'exponential'
          }
        },
        {
          name: 'Log Recovery',
          type: 'database',
          config: {
            query: `
              INSERT INTO error_recovery_log (
                operation_id, error_type, recovery_status, recovered_at
              )
              VALUES ($1, $2, 'success', NOW())
            `,
            params: ['{{operation_id}}', '{{error_type}}']
          }
        },
        {
          name: 'Notify Success',
          type: 'notify',
          config: {
            type: 'email',
            recipient: '{{admin_email}}',
            message: 'Operation {{operation_id}} recovered successfully.'
          }
        }
      ]
    };
  }

  /**
   * Get all templates
   */
  static getAllTemplates() {
    return [
      this.paymentFlow(),
      this.signupFlow(),
      this.subscriptionFlow(),
      this.affiliateFlow(),
      this.webhookFlow(),
      this.scheduledTaskFlow(),
      this.errorRecoveryFlow()
    ];
  }

  /**
   * Get template by category
   */
  static getTemplatesByCategory(category) {
    return this.getAllTemplates().filter(
      t => t.metadata.category === category
    );
  }

  /**
   * Get template by emoji
   */
  static getTemplatesByEmoji(emoji) {
    return this.getAllTemplates().filter(
      t => t.metadata.emoji === emoji
    );
  }
}

module.exports = FlowTemplates;
