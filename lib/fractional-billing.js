/**
 * Fractional Billing System
 *
 * Manages revenue attribution and billing for fractional executive agents.
 * Splits revenue across employment relationships based on time allocation.
 *
 * Example:
 * - CalRiven works for 3 companies (Soulfra 50%, DeathToData 30%, AvailableCorp 20%)
 * - CalRiven bills 40 hours in a month
 * - Split: Soulfra (20h), DeathToData (12h), AvailableCorp (8h)
 * - Revenue split accordingly
 *
 * Features:
 * - Track billable hours per employer
 * - Generate invoices per company
 * - Revenue split across employment relationships
 * - Performance bonuses
 * - Payment routing through platform (agency commission)
 * - Monthly/quarterly reporting
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class FractionalBilling extends EventEmitter {
  constructor({
    db = null,
    employmentTracker = null,
    capacityManager = null,
    executiveRegistry = null
  }) {
    super();

    this.db = db;
    this.employmentTracker = employmentTracker;
    this.capacityManager = capacityManager;
    this.executiveRegistry = executiveRegistry;

    // Active invoices
    // Map: invoiceId -> invoice
    this.invoices = new Map();

    // Time entries (billable hours)
    // Map: entryId -> time entry
    this.timeEntries = new Map();

    // Payment records
    // Map: paymentId -> payment
    this.payments = new Map();

    // Platform commission (%)
    this.platformCommission = 15; // Agency takes 15% commission

    console.log('[FractionalBilling] Initialized');
  }

  /**
   * Record billable time entry
   */
  async recordTimeEntry({
    agentId,
    employmentId,
    companyId,
    hours,
    date = new Date(),
    description = '',
    category = 'general', // general, meeting, code_review, strategy, etc.
    metadata = {}
  }) {
    const entryId = crypto.randomUUID();

    // Get employment to get hourly rate
    const employment = this.employmentTracker.employments.get(employmentId);
    if (!employment) {
      throw new Error(`Employment not found: ${employmentId}`);
    }

    const amount = hours * employment.hourlyRate;

    const entry = {
      entryId,
      agentId,
      employmentId,
      companyId,
      hours,
      hourlyRate: employment.hourlyRate,
      amount,
      date,
      description,
      category,
      invoiced: false,
      invoiceId: null,
      createdAt: new Date(),
      metadata
    };

    this.timeEntries.set(entryId, entry);

    if (this.db) {
      await this.db.query(
        `INSERT INTO time_entries (
          entry_id, agent_id, employment_id, company_id, hours,
          hourly_rate, amount, date, description, category,
          invoiced, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)`,
        [
          entryId,
          agentId,
          employmentId,
          companyId,
          hours,
          employment.hourlyRate,
          amount,
          date,
          description,
          category,
          false,
          JSON.stringify(metadata)
        ]
      );
    }

    console.log(`[FractionalBilling] Recorded ${hours}h for ${employment.companyName} ($${amount})`);

    this.emit('time_entry_recorded', entry);

    return entry;
  }

  /**
   * Generate invoice for a company
   */
  async generateInvoice({
    companyId,
    startDate,
    endDate,
    includeUnbilled = true
  }) {
    const invoiceId = crypto.randomUUID();
    const invoiceNumber = this.generateInvoiceNumber();

    // Get all unbilled time entries for this company in the period
    const entries = [];
    for (const entry of this.timeEntries.values()) {
      if (entry.companyId === companyId &&
          entry.date >= startDate &&
          entry.date <= endDate &&
          (!entry.invoiced || !includeUnbilled)) {
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      throw new Error('No billable time entries found for this period');
    }

    // Calculate totals
    const subtotal = entries.reduce((sum, e) => sum + e.amount, 0);
    const platformFee = subtotal * (this.platformCommission / 100);
    const total = subtotal + platformFee;

    // Get company name from first entry
    const employment = this.employmentTracker.employments.get(entries[0].employmentId);

    const invoice = {
      invoiceId,
      invoiceNumber,
      companyId,
      companyName: employment.companyName,
      startDate,
      endDate,
      entries: entries.map(e => e.entryId),
      subtotal,
      platformFee,
      total,
      status: 'draft', // draft, sent, paid, overdue, cancelled
      generatedAt: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      paidAt: null
    };

    this.invoices.set(invoiceId, invoice);

    // Mark entries as invoiced
    for (const entry of entries) {
      entry.invoiced = true;
      entry.invoiceId = invoiceId;
    }

    if (this.db) {
      await this.db.query(
        `INSERT INTO invoices (
          invoice_id, invoice_number, company_id, company_name,
          start_date, end_date, entries, subtotal, platform_fee,
          total, status, generated_at, due_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)`,
        [
          invoiceId,
          invoiceNumber,
          companyId,
          invoice.companyName,
          startDate,
          endDate,
          JSON.stringify(invoice.entries),
          subtotal,
          platformFee,
          total,
          'draft',
          invoice.dueDate
        ]
      );

      // Update time entries
      for (const entryId of invoice.entries) {
        await this.db.query(
          `UPDATE time_entries
           SET invoiced = true, invoice_id = $1
           WHERE entry_id = $2`,
          [invoiceId, entryId]
        );
      }
    }

    console.log(`[FractionalBilling] Generated invoice ${invoiceNumber} for ${invoice.companyName}: $${total}`);

    this.emit('invoice_generated', invoice);

    return invoice;
  }

  /**
   * Generate invoice number (format: INV-YYYYMM-XXXX)
   */
  generateInvoiceNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  }

  /**
   * Send invoice to company
   */
  async sendInvoice(invoiceId) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    invoice.status = 'sent';
    invoice.sentAt = new Date();

    if (this.db) {
      await this.db.query(
        `UPDATE invoices
         SET status = 'sent', sent_at = NOW()
         WHERE invoice_id = $1`,
        [invoiceId]
      );
    }

    console.log(`[FractionalBilling] Sent invoice ${invoice.invoiceNumber} to ${invoice.companyName}`);

    this.emit('invoice_sent', invoice);

    return invoice;
  }

  /**
   * Record payment
   */
  async recordPayment({
    invoiceId,
    amount,
    paymentMethod = 'stripe',
    transactionId = null,
    paidAt = new Date(),
    metadata = {}
  }) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    const paymentId = crypto.randomUUID();

    const payment = {
      paymentId,
      invoiceId,
      amount,
      paymentMethod,
      transactionId,
      paidAt,
      createdAt: new Date(),
      metadata
    };

    this.payments.set(paymentId, payment);

    // Update invoice status
    invoice.status = 'paid';
    invoice.paidAt = paidAt;

    if (this.db) {
      await this.db.query(
        `INSERT INTO payments (
          payment_id, invoice_id, amount, payment_method,
          transaction_id, paid_at, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
        [
          paymentId,
          invoiceId,
          amount,
          paymentMethod,
          transactionId,
          paidAt,
          JSON.stringify(metadata)
        ]
      );

      await this.db.query(
        `UPDATE invoices
         SET status = 'paid', paid_at = $1
         WHERE invoice_id = $2`,
        [paidAt, invoiceId]
      );
    }

    // Calculate platform revenue and agent revenue
    const platformRevenue = invoice.platformFee;
    const agentRevenue = invoice.subtotal;

    console.log(`[FractionalBilling] Payment recorded: ${invoice.invoiceNumber} - $${amount}`);
    console.log(`[FractionalBilling] Revenue split: Platform $${platformRevenue}, Agent $${agentRevenue}`);

    this.emit('payment_recorded', { payment, invoice, platformRevenue, agentRevenue });

    return payment;
  }

  /**
   * Get revenue attribution for an agent
   */
  async getAgentRevenue(agentId, { startDate = null, endDate = null } = {}) {
    const revenue = {
      agentId,
      totalBilled: 0,
      totalPaid: 0,
      byCompany: {},
      byMonth: {}
    };

    // Get all time entries for this agent
    for (const entry of this.timeEntries.values()) {
      if (entry.agentId !== agentId) continue;

      if (startDate && entry.date < startDate) continue;
      if (endDate && entry.date > endDate) continue;

      revenue.totalBilled += entry.amount;

      // By company
      if (!revenue.byCompany[entry.companyId]) {
        const employment = this.employmentTracker.employments.get(entry.employmentId);
        revenue.byCompany[entry.companyId] = {
          companyName: employment.companyName,
          hours: 0,
          amount: 0,
          paid: 0
        };
      }
      revenue.byCompany[entry.companyId].hours += entry.hours;
      revenue.byCompany[entry.companyId].amount += entry.amount;

      // By month
      const monthKey = `${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, '0')}`;
      if (!revenue.byMonth[monthKey]) {
        revenue.byMonth[monthKey] = {
          hours: 0,
          amount: 0
        };
      }
      revenue.byMonth[monthKey].hours += entry.hours;
      revenue.byMonth[monthKey].amount += entry.amount;

      // Check if paid
      if (entry.invoiced && entry.invoiceId) {
        const invoice = this.invoices.get(entry.invoiceId);
        if (invoice && invoice.status === 'paid') {
          revenue.totalPaid += entry.amount;
          revenue.byCompany[entry.companyId].paid += entry.amount;
        }
      }
    }

    return revenue;
  }

  /**
   * Get company billing summary
   */
  async getCompanyBilling(companyId, { startDate = null, endDate = null } = {}) {
    const billing = {
      companyId,
      totalBilled: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      invoices: [],
      entries: []
    };

    // Get all time entries for this company
    for (const entry of this.timeEntries.values()) {
      if (entry.companyId !== companyId) continue;

      if (startDate && entry.date < startDate) continue;
      if (endDate && entry.date > endDate) continue;

      billing.totalBilled += entry.amount;
      billing.entries.push(entry);
    }

    // Get all invoices for this company
    for (const invoice of this.invoices.values()) {
      if (invoice.companyId !== companyId) continue;

      if (startDate && invoice.startDate < startDate) continue;
      if (endDate && invoice.endDate > endDate) continue;

      billing.invoices.push(invoice);

      if (invoice.status === 'paid') {
        billing.totalPaid += invoice.total;
      } else {
        billing.totalOutstanding += invoice.total;
      }
    }

    return billing;
  }

  /**
   * Get platform revenue report
   */
  async getPlatformRevenue({ startDate = null, endDate = null } = {}) {
    const report = {
      totalRevenue: 0,
      totalAgentRevenue: 0,
      totalPlatformFees: 0,
      invoiceCount: 0,
      paidInvoiceCount: 0,
      byMonth: {}
    };

    for (const invoice of this.invoices.values()) {
      if (startDate && invoice.generatedAt < startDate) continue;
      if (endDate && invoice.generatedAt > endDate) continue;

      report.invoiceCount++;

      if (invoice.status === 'paid') {
        report.paidInvoiceCount++;
        report.totalRevenue += invoice.total;
        report.totalAgentRevenue += invoice.subtotal;
        report.totalPlatformFees += invoice.platformFee;

        const monthKey = `${invoice.paidAt.getFullYear()}-${String(invoice.paidAt.getMonth() + 1).padStart(2, '0')}`;
        if (!report.byMonth[monthKey]) {
          report.byMonth[monthKey] = {
            revenue: 0,
            platformFees: 0,
            invoiceCount: 0
          };
        }
        report.byMonth[monthKey].revenue += invoice.total;
        report.byMonth[monthKey].platformFees += invoice.platformFee;
        report.byMonth[monthKey].invoiceCount++;
      }
    }

    return report;
  }

  /**
   * Get unbilled time entries for a company
   */
  getUnbilledTimeEntries(companyId) {
    const entries = [];

    for (const entry of this.timeEntries.values()) {
      if (entry.companyId === companyId && !entry.invoiced) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Get overdue invoices
   */
  getOverdueInvoices() {
    const now = new Date();
    const overdue = [];

    for (const invoice of this.invoices.values()) {
      if (invoice.status !== 'paid' && invoice.dueDate < now) {
        overdue.push(invoice);
      }
    }

    return overdue;
  }

  /**
   * Get stats
   */
  getStats() {
    const stats = {
      totalTimeEntries: this.timeEntries.size,
      totalInvoices: this.invoices.size,
      totalPayments: this.payments.size,
      totalBilled: 0,
      totalPaid: 0,
      outstandingAmount: 0,
      invoicesByStatus: {
        draft: 0,
        sent: 0,
        paid: 0,
        overdue: 0
      }
    };

    const now = new Date();

    for (const invoice of this.invoices.values()) {
      stats.totalBilled += invoice.total;

      if (invoice.status === 'paid') {
        stats.totalPaid += invoice.total;
        stats.invoicesByStatus.paid++;
      } else if (invoice.dueDate < now) {
        stats.outstandingAmount += invoice.total;
        stats.invoicesByStatus.overdue++;
      } else if (invoice.status === 'sent') {
        stats.outstandingAmount += invoice.total;
        stats.invoicesByStatus.sent++;
      } else {
        stats.invoicesByStatus.draft++;
      }
    }

    return stats;
  }
}

module.exports = FractionalBilling;
