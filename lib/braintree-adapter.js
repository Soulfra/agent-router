/**
 * Braintree Payment Adapter for CalOS
 *
 * Integrates PayPal Braintree SDK for:
 * - Credit/debit card processing
 * - PayPal wallet payments
 * - Venmo integration
 * - Google Pay / Apple Pay
 * - 3D Secure authentication
 * - Recurring subscriptions
 * - Payment method vaulting
 * - Refunds and disputes
 *
 * Complements existing Stripe integration for:
 * - Fee optimization (route to cheapest processor)
 * - Redundancy (fallback if one processor down)
 * - Geographic optimization (better rates in certain regions)
 * - Payment method coverage (Venmo, PayPal specific)
 *
 * Usage:
 *   const adapter = new BraintreeAdapter();
 *   await adapter.initialize();
 *   const clientToken = await adapter.generateClientToken(customerId);
 *   const result = await adapter.processPayment(nonce, amount, metadata);
 */

const braintree = require('braintree');

class BraintreeAdapter {
  constructor(options = {}) {
    this.config = {
      environment: options.environment || process.env.BRAINTREE_ENVIRONMENT || 'sandbox',
      merchantId: options.merchantId || process.env.BRAINTREE_MERCHANT_ID,
      publicKey: options.publicKey || process.env.BRAINTREE_PUBLIC_KEY,
      privateKey: options.privateKey || process.env.BRAINTREE_PRIVATE_KEY,
      ...options
    };

    this.gateway = null;
    this.initialized = false;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize Braintree gateway
   */
  async initialize() {
    if (this.initialized) return;

    if (!this.config.merchantId || !this.config.publicKey || !this.config.privateKey) {
      console.warn('[BraintreeAdapter] Missing credentials - payment processing disabled');
      return false;
    }

    try {
      // Determine environment
      const environment = this.config.environment === 'production'
        ? braintree.Environment.Production
        : braintree.Environment.Sandbox;

      // Create gateway
      this.gateway = new braintree.BraintreeGateway({
        environment,
        merchantId: this.config.merchantId,
        publicKey: this.config.publicKey,
        privateKey: this.config.privateKey
      });

      this.initialized = true;
      console.log(`[BraintreeAdapter] ✓ Initialized (${this.config.environment})`);
      return true;
    } catch (error) {
      console.error('[BraintreeAdapter] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Check if adapter is initialized
   */
  _ensureInitialized() {
    if (!this.initialized || !this.gateway) {
      throw new Error('BraintreeAdapter not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // CLIENT TOKEN GENERATION (for Drop-in UI)
  // ============================================================================

  /**
   * Generate client token for drop-in UI
   *
   * @param {string} customerId - Optional customer ID to associate token
   * @returns {Promise<string>} Client token
   */
  async generateClientToken(customerId = null) {
    this._ensureInitialized();

    try {
      const options = {};
      if (customerId) {
        options.customerId = customerId;
      }

      const response = await this.gateway.clientToken.generate(options);
      return response.clientToken;
    } catch (error) {
      console.error('[BraintreeAdapter] Client token generation failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // CUSTOMER MANAGEMENT
  // ============================================================================

  /**
   * Create Braintree customer
   */
  async createCustomer(customerData) {
    this._ensureInitialized();

    try {
      const result = await this.gateway.customer.create({
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        email: customerData.email,
        phone: customerData.phone,
        company: customerData.company,
        customFields: customerData.customFields || {}
      });

      if (result.success) {
        console.log(`[BraintreeAdapter] Customer created: ${result.customer.id}`);
        return {
          success: true,
          customerId: result.customer.id,
          customer: result.customer
        };
      } else {
        return {
          success: false,
          error: result.message
        };
      }
    } catch (error) {
      console.error('[BraintreeAdapter] Customer creation failed:', error);
      throw error;
    }
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId) {
    this._ensureInitialized();

    try {
      const customer = await this.gateway.customer.find(customerId);
      return customer;
    } catch (error) {
      if (error.type === braintree.errorTypes.notFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update customer
   */
  async updateCustomer(customerId, updateData) {
    this._ensureInitialized();

    try {
      const result = await this.gateway.customer.update(customerId, updateData);
      return {
        success: result.success,
        customer: result.customer,
        error: result.success ? null : result.message
      };
    } catch (error) {
      console.error('[BraintreeAdapter] Customer update failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT PROCESSING
  // ============================================================================

  /**
   * Process payment with payment method nonce
   *
   * @param {string} nonce - Payment method nonce from client
   * @param {number} amountCents - Amount in cents
   * @param {object} metadata - Transaction metadata
   * @returns {Promise<object>} Transaction result
   */
  async processPayment(nonce, amountCents, metadata = {}) {
    this._ensureInitialized();

    try {
      const amount = (amountCents / 100).toFixed(2);

      const transactionData = {
        amount,
        paymentMethodNonce: nonce,
        options: {
          submitForSettlement: metadata.autoSettle !== false,
          storeInVaultOnSuccess: metadata.storePaymentMethod || false
        },
        customerId: metadata.customerId,
        orderId: metadata.orderId,
        customFields: metadata.customFields || {}
      };

      // Add 3D Secure if required
      if (metadata.require3DSecure) {
        transactionData.options.threeDSecure = {
          required: true
        };
      }

      const result = await this.gateway.transaction.sale(transactionData);

      if (result.success) {
        console.log(`[BraintreeAdapter] Payment successful: ${result.transaction.id}`);
        return {
          success: true,
          transactionId: result.transaction.id,
          status: result.transaction.status,
          amount: result.transaction.amount,
          processor: 'braintree',
          transaction: result.transaction
        };
      } else {
        return {
          success: false,
          error: result.message,
          processorResponse: result.transaction?.processorResponseText
        };
      }
    } catch (error) {
      console.error('[BraintreeAdapter] Payment processing failed:', error);
      throw error;
    }
  }

  /**
   * Process PayPal payment
   */
  async processPayPalPayment(nonce, amountCents, metadata = {}) {
    // PayPal nonces are processed the same way as card nonces
    return this.processPayment(nonce, amountCents, {
      ...metadata,
      paymentMethodType: 'paypal'
    });
  }

  /**
   * Process Venmo payment
   */
  async processVenmoPayment(nonce, amountCents, metadata = {}) {
    return this.processPayment(nonce, amountCents, {
      ...metadata,
      paymentMethodType: 'venmo'
    });
  }

  // ============================================================================
  // PAYMENT METHOD VAULTING
  // ============================================================================

  /**
   * Vault payment method for future use
   */
  async vaultPaymentMethod(nonce, customerId, options = {}) {
    this._ensureInitialized();

    try {
      const result = await this.gateway.paymentMethod.create({
        customerId,
        paymentMethodNonce: nonce,
        options: {
          makeDefault: options.makeDefault || false,
          verifyCard: options.verifyCard !== false
        }
      });

      if (result.success) {
        return {
          success: true,
          paymentMethodToken: result.paymentMethod.token,
          paymentMethod: result.paymentMethod
        };
      } else {
        return {
          success: false,
          error: result.message
        };
      }
    } catch (error) {
      console.error('[BraintreeAdapter] Vault payment method failed:', error);
      throw error;
    }
  }

  /**
   * Get customer payment methods
   */
  async getPaymentMethods(customerId) {
    this._ensureInitialized();

    try {
      const customer = await this.getCustomer(customerId);
      if (!customer) {
        return [];
      }

      return {
        creditCards: customer.creditCards || [],
        paypalAccounts: customer.paypalAccounts || [],
        venmoAccounts: customer.venmoAccounts || [],
        usBankAccounts: customer.usBankAccounts || []
      };
    } catch (error) {
      console.error('[BraintreeAdapter] Get payment methods failed:', error);
      throw error;
    }
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(token) {
    this._ensureInitialized();

    try {
      const result = await this.gateway.paymentMethod.delete(token);
      return { success: result.success };
    } catch (error) {
      console.error('[BraintreeAdapter] Delete payment method failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  /**
   * Create subscription
   */
  async createSubscription(planId, paymentMethodToken, options = {}) {
    this._ensureInitialized();

    try {
      const result = await this.gateway.subscription.create({
        paymentMethodToken,
        planId,
        price: options.price,
        trialDuration: options.trialDuration,
        trialDurationUnit: options.trialDurationUnit,
        options: {
          startImmediately: options.startImmediately !== false
        }
      });

      if (result.success) {
        return {
          success: true,
          subscriptionId: result.subscription.id,
          subscription: result.subscription
        };
      } else {
        return {
          success: false,
          error: result.message
        };
      }
    } catch (error) {
      console.error('[BraintreeAdapter] Create subscription failed:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId) {
    this._ensureInitialized();

    try {
      const result = await this.gateway.subscription.cancel(subscriptionId);
      return {
        success: result.success,
        subscription: result.subscription
      };
    } catch (error) {
      console.error('[BraintreeAdapter] Cancel subscription failed:', error);
      throw error;
    }
  }

  /**
   * Get subscription
   */
  async getSubscription(subscriptionId) {
    this._ensureInitialized();

    try {
      const subscription = await this.gateway.subscription.find(subscriptionId);
      return subscription;
    } catch (error) {
      if (error.type === braintree.errorTypes.notFoundError) {
        return null;
      }
      throw error;
    }
  }

  // ============================================================================
  // REFUNDS & DISPUTES
  // ============================================================================

  /**
   * Refund transaction (full or partial)
   */
  async refund(transactionId, amountCents = null) {
    this._ensureInitialized();

    try {
      const amount = amountCents ? (amountCents / 100).toFixed(2) : undefined;

      const result = await this.gateway.transaction.refund(transactionId, amount);

      if (result.success) {
        return {
          success: true,
          refundId: result.transaction.id,
          refundedAmount: result.transaction.amount,
          transaction: result.transaction
        };
      } else {
        return {
          success: false,
          error: result.message
        };
      }
    } catch (error) {
      console.error('[BraintreeAdapter] Refund failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // TRANSACTION QUERIES
  // ============================================================================

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId) {
    this._ensureInitialized();

    try {
      const transaction = await this.gateway.transaction.find(transactionId);
      return transaction;
    } catch (error) {
      if (error.type === braintree.errorTypes.notFoundError) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search transactions
   */
  async searchTransactions(criteria) {
    this._ensureInitialized();

    try {
      const stream = this.gateway.transaction.search(search => {
        if (criteria.customerId) {
          search.customerId().is(criteria.customerId);
        }
        if (criteria.status) {
          search.status().is(criteria.status);
        }
        if (criteria.minAmount) {
          search.amount().min(criteria.minAmount);
        }
        if (criteria.maxAmount) {
          search.amount().max(criteria.maxAmount);
        }
        if (criteria.startDate) {
          search.createdAt().min(criteria.startDate);
        }
        if (criteria.endDate) {
          search.createdAt().max(criteria.endDate);
        }
      });

      const transactions = [];
      await new Promise((resolve, reject) => {
        stream.on('data', transaction => {
          transactions.push(transaction);
        });
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      return transactions;
    } catch (error) {
      console.error('[BraintreeAdapter] Search transactions failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // WEBHOOK VERIFICATION
  // ============================================================================

  /**
   * Parse and verify webhook notification
   */
  async verifyWebhookNotification(signature, payload) {
    this._ensureInitialized();

    try {
      const notification = await this.gateway.webhookNotification.parse(signature, payload);
      return {
        valid: true,
        notification
      };
    } catch (error) {
      console.error('[BraintreeAdapter] Webhook verification failed:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // MARKETPLACE (Sub-Merchants)
  // ============================================================================

  /**
   * Create sub-merchant account (for marketplace/platform model)
   */
  async createMerchantAccount(merchantData) {
    this._ensureInitialized();

    try {
      const result = await this.gateway.merchantAccount.create({
        individual: {
          firstName: merchantData.individual.firstName,
          lastName: merchantData.individual.lastName,
          email: merchantData.individual.email,
          phone: merchantData.individual.phone,
          dateOfBirth: merchantData.individual.dateOfBirth,
          ssn: merchantData.individual.ssn,
          address: merchantData.individual.address
        },
        business: merchantData.business,
        funding: merchantData.funding,
        tosAccepted: merchantData.tosAccepted,
        masterMerchantAccountId: merchantData.masterMerchantAccountId
      });

      if (result.success) {
        return {
          success: true,
          merchantAccountId: result.merchantAccount.id,
          status: result.merchantAccount.status,
          merchantAccount: result.merchantAccount
        };
      } else {
        return {
          success: false,
          error: result.message,
          errors: result.errors
        };
      }
    } catch (error) {
      console.error('[BraintreeAdapter] Create merchant account failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Test connection to Braintree
   */
  async testConnection() {
    this._ensureInitialized();

    try {
      // Try to generate a client token as a connection test
      await this.generateClientToken();
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get gateway instance (for advanced usage)
   */
  getGateway() {
    this._ensureInitialized();
    return this.gateway;
  }
}

module.exports = BraintreeAdapter;
