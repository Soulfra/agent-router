/**
 * Interview Scheduler & Payment System
 *
 * Schedules expert interviews and handles payment processing.
 *
 * Features:
 * - Calendar integration (Google Calendar, Calendly-style booking)
 * - Payment processing ($50-$300 per interview)
 * - Video recording integration (Zoom/Meet)
 * - Transcript extraction
 * - Concept tagging and indexing
 * - Expert portfolio linking
 *
 * Workflow:
 * 1. User browses job → sees expert interviews available
 * 2. User books interview time slot with expert
 * 3. Payment processed ($50-$300 based on expertise)
 * 4. Meeting scheduled via Zoom/Google Meet
 * 5. Interview recorded automatically
 * 6. Transcript extracted → concepts tagged → linked to expert portfolio
 * 7. Interview published on platform
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

class InterviewScheduler extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.stripeKey = options.stripeKey || process.env.STRIPE_SECRET_KEY;
    this.zoomApiKey = options.zoomApiKey || process.env.ZOOM_API_KEY;
    this.googleCalendarCreds = options.googleCalendarCreds;

    // Interview rate ranges (in cents)
    this.rates = {
      expert: { min: 15000, max: 30000 }, // $150-$300
      advanced: { min: 10000, max: 20000 }, // $100-$200
      intermediate: { min: 5000, max: 10000 }, // $50-$100
      beginner: { min: 2500, max: 5000 } // $25-$50
    };

    console.log('[InterviewScheduler] Initialized');
  }

  /**
   * Create interview booking
   */
  async createInterviewBooking(options) {
    const {
      expertUsername,
      expertName,
      expertiseLevel,
      skill,
      userId,
      userEmail,
      userName,
      duration = 60, // minutes
      preferredTime = null,
      topics = []
    } = options;

    console.log(`[InterviewScheduler] Creating booking for ${expertName} on ${skill}`);

    // Calculate price based on expertise and duration
    const rate = this.rates[expertiseLevel] || this.rates.intermediate;
    const pricePerHour = Math.floor((rate.min + rate.max) / 2);
    const price = Math.floor((pricePerHour / 60) * duration);

    // Generate booking ID
    const bookingId = crypto.randomBytes(8).toString('hex');

    const booking = {
      bookingId,
      expert: {
        username: expertUsername,
        name: expertName,
        expertiseLevel,
        primarySkill: skill
      },
      user: {
        id: userId,
        email: userEmail,
        name: userName
      },
      interview: {
        skill,
        topics,
        duration,
        preferredTime
      },
      payment: {
        amount: price,
        currency: 'usd',
        status: 'pending'
      },
      meeting: {
        platform: 'zoom', // or 'google-meet'
        url: null,
        recordingUrl: null,
        transcriptUrl: null
      },
      status: 'pending_payment',
      createdAt: new Date(),
      scheduledAt: null,
      completedAt: null
    };

    // Save to database
    if (this.db) {
      await this._saveBooking(booking);
    }

    this.emit('booking:created', { bookingId, expertName, skill, price });

    console.log(`[InterviewScheduler] Booking created: ${bookingId} | Price: $${price / 100}`);

    return booking;
  }

  /**
   * Process payment for interview
   */
  async processPayment(bookingId, paymentMethod) {
    console.log(`[InterviewScheduler] Processing payment for booking: ${bookingId}`);

    // Get booking
    const booking = await this._getBooking(bookingId);
    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.payment.status !== 'pending') {
      throw new Error(`Payment already ${booking.payment.status}`);
    }

    try {
      // In production, integrate with Stripe
      // const charge = await stripe.charges.create({
      //   amount: booking.payment.amount,
      //   currency: booking.payment.currency,
      //   source: paymentMethod,
      //   description: `Interview: ${booking.expert.name} on ${booking.interview.skill}`
      // });

      // Mock payment success
      const paymentId = `ch_${crypto.randomBytes(12).toString('hex')}`;

      // Update booking
      booking.payment.status = 'completed';
      booking.payment.paymentId = paymentId;
      booking.payment.paidAt = new Date();
      booking.status = 'pending_schedule';

      // Save to database or cache
      await this._updateBooking(booking);

      this.emit('payment:completed', {
        bookingId,
        paymentId,
        amount: booking.payment.amount
      });

      console.log(`[InterviewScheduler] Payment completed: ${paymentId}`);

      return {
        success: true,
        paymentId,
        booking
      };

    } catch (error) {
      booking.payment.status = 'failed';
      booking.payment.error = error.message;

      await this._updateBooking(booking);

      this.emit('payment:failed', { bookingId, error: error.message });

      throw error;
    }
  }

  /**
   * Schedule interview meeting
   */
  async scheduleInterview(bookingId, timeSlot) {
    console.log(`[InterviewScheduler] Scheduling interview for booking: ${bookingId}`);

    const booking = await this._getBooking(bookingId);
    if (!booking) {
      throw new Error('Booking not found');
    }

    if (booking.payment.status !== 'completed') {
      throw new Error('Payment not completed');
    }

    // Create Zoom meeting
    const meeting = await this._createZoomMeeting({
      topic: `${booking.interview.skill} Interview with ${booking.expert.name}`,
      startTime: timeSlot,
      duration: booking.interview.duration,
      attendees: [booking.user.email, booking.expert.email || `${booking.expert.username}@github.com`]
    });

    // Update booking
    booking.scheduledAt = new Date(timeSlot);
    booking.meeting.url = meeting.joinUrl;
    booking.meeting.meetingId = meeting.meetingId;
    booking.status = 'scheduled';

    await this._updateBooking(booking);

    this.emit('interview:scheduled', {
      bookingId,
      expertName: booking.expert.name,
      scheduledAt: timeSlot,
      meetingUrl: meeting.joinUrl
    });

    console.log(`[InterviewScheduler] Interview scheduled: ${bookingId} at ${timeSlot}`);

    return {
      success: true,
      booking,
      meeting
    };
  }

  /**
   * Get available time slots for expert
   */
  async getAvailableSlots(expertUsername, dateRange = 7) {
    console.log(`[InterviewScheduler] Getting available slots for: ${expertUsername}`);

    // In production, integrate with Google Calendar API
    // For now, generate mock slots

    const slots = [];
    const now = new Date();

    for (let day = 1; day <= dateRange; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);

      // Morning slots (9 AM - 12 PM)
      for (let hour = 9; hour < 12; hour++) {
        const slot = new Date(date);
        slot.setHours(hour, 0, 0, 0);
        slots.push({
          time: slot.toISOString(),
          available: Math.random() > 0.3 // 70% available
        });
      }

      // Afternoon slots (2 PM - 5 PM)
      for (let hour = 14; hour < 17; hour++) {
        const slot = new Date(date);
        slot.setHours(hour, 0, 0, 0);
        slots.push({
          time: slot.toISOString(),
          available: Math.random() > 0.3 // 70% available
        });
      }
    }

    return slots.filter(slot => slot.available);
  }

  /**
   * Mark interview as completed and process transcript
   */
  async completeInterview(bookingId, options = {}) {
    const { recordingUrl, transcriptText } = options;

    console.log(`[InterviewScheduler] Completing interview: ${bookingId}`);

    const booking = await this._getBooking(bookingId);
    if (!booking) {
      throw new Error('Booking not found');
    }

    // Extract concepts from transcript
    const concepts = transcriptText ? this._extractConcepts(transcriptText) : [];

    // Update booking
    booking.completedAt = new Date();
    booking.meeting.recordingUrl = recordingUrl;
    booking.meeting.transcriptUrl = transcriptText ? this._saveTranscript(bookingId, transcriptText) : null;
    booking.interview.concepts = concepts;
    booking.status = 'completed';

    if (this.db) {
      await this._updateBooking(booking);
    }

    this.emit('interview:completed', {
      bookingId,
      expertName: booking.expert.name,
      skill: booking.interview.skill,
      concepts
    });

    console.log(`[InterviewScheduler] Interview completed: ${bookingId} | Concepts: ${concepts.length}`);

    return {
      success: true,
      booking,
      concepts
    };
  }

  /**
   * Get all interviews for a job/skill
   */
  async getInterviewsForSkill(skill) {
    if (!this.db) {
      console.warn('[InterviewScheduler] Database not configured');
      return [];
    }

    try {
      const query = `
        SELECT *
        FROM expert_interviews
        WHERE interview_skill = $1 AND status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 20
      `;

      const result = await this.db.query(query, [skill]);
      return result.rows;

    } catch (error) {
      console.error('[InterviewScheduler] Query error:', error.message);
      return [];
    }
  }

  /**
   * Create Zoom meeting (mock implementation)
   */
  async _createZoomMeeting(options) {
    const { topic, startTime, duration, attendees } = options;

    // In production, use Zoom API
    console.log(`[InterviewScheduler] Would create Zoom meeting: ${topic}`);

    // Mock response
    return {
      meetingId: crypto.randomBytes(8).toString('hex'),
      joinUrl: `https://zoom.us/j/${Math.floor(Math.random() * 1000000000)}`,
      startTime,
      duration,
      topic,
      attendees
    };
  }

  /**
   * Extract concepts from transcript
   */
  _extractConcepts(transcript) {
    // Simple keyword extraction (in production, use NLP)
    const commonTechTerms = [
      'react', 'vue', 'angular', 'typescript', 'javascript',
      'node', 'express', 'api', 'rest', 'graphql',
      'database', 'sql', 'mongodb', 'redis',
      'docker', 'kubernetes', 'ci/cd', 'devops',
      'testing', 'tdd', 'unit test', 'integration test',
      'performance', 'optimization', 'security',
      'authentication', 'authorization', 'jwt'
    ];

    const text = transcript.toLowerCase();
    const concepts = [];

    commonTechTerms.forEach(term => {
      if (text.includes(term)) {
        concepts.push(term);
      }
    });

    return [...new Set(concepts)]; // Deduplicate
  }

  /**
   * Save transcript to file system
   */
  _saveTranscript(bookingId, transcript) {
    // In production, save to S3 or file system
    console.log(`[InterviewScheduler] Would save transcript for: ${bookingId}`);
    return `/transcripts/${bookingId}.txt`;
  }

  /**
   * Save booking to database
   */
  async _saveBooking(booking) {
    if (!this.db) {
      // Save to in-memory cache for testing
      if (!this._bookingCache) {
        this._bookingCache = new Map();
      }
      this._bookingCache.set(booking.bookingId, booking);
      return;
    }

    try {
      await this.db.query(`
        INSERT INTO expert_interviews (
          booking_id,
          expert_username,
          expert_name,
          expertise_level,
          user_id,
          user_email,
          interview_skill,
          interview_topics,
          interview_duration,
          payment_amount,
          payment_status,
          meeting_platform,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        booking.bookingId,
        booking.expert.username,
        booking.expert.name,
        booking.expert.expertiseLevel,
        booking.user.id,
        booking.user.email,
        booking.interview.skill,
        JSON.stringify(booking.interview.topics),
        booking.interview.duration,
        booking.payment.amount,
        booking.payment.status,
        booking.meeting.platform,
        booking.status,
        booking.createdAt
      ]);
    } catch (error) {
      // Table might not exist yet
      if (!error.message.includes('does not exist')) {
        console.error('[InterviewScheduler] Save booking error:', error.message);
      }
    }
  }

  /**
   * Update booking in database
   */
  async _updateBooking(booking) {
    if (!this.db) {
      // Update in-memory cache for testing
      if (!this._bookingCache) {
        this._bookingCache = new Map();
      }
      this._bookingCache.set(booking.bookingId, booking);
      return;
    }

    try {
      await this.db.query(`
        UPDATE expert_interviews
        SET
          payment_status = $1,
          meeting_url = $2,
          meeting_recording_url = $3,
          scheduled_at = $4,
          completed_at = $5,
          status = $6,
          interview_concepts = $7
        WHERE booking_id = $8
      `, [
        booking.payment.status,
        booking.meeting.url,
        booking.meeting.recordingUrl,
        booking.scheduledAt,
        booking.completedAt,
        booking.status,
        JSON.stringify(booking.interview.concepts || []),
        booking.bookingId
      ]);
    } catch (error) {
      console.error('[InterviewScheduler] Update booking error:', error.message);
    }
  }

  /**
   * Get booking from database
   */
  async _getBooking(bookingId) {
    if (!this.db) {
      // Check in-memory cache for testing
      if (!this._bookingCache) {
        this._bookingCache = new Map();
      }

      if (this._bookingCache.has(bookingId)) {
        return this._bookingCache.get(bookingId);
      }

      // Mock booking for testing
      return {
        bookingId,
        expert: { username: 'test_expert', name: 'Test Expert', expertiseLevel: 'advanced' },
        user: { id: 1, email: 'user@test.com', name: 'Test User' },
        interview: { skill: 'react', topics: ['hooks', 'performance'], duration: 60 },
        payment: { amount: 10000, currency: 'usd', status: 'pending' },
        meeting: { platform: 'zoom', url: null },
        status: 'pending_payment',
        createdAt: new Date()
      };
    }

    try {
      const result = await this.db.query(`
        SELECT * FROM expert_interviews WHERE booking_id = $1
      `, [bookingId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('[InterviewScheduler] Get booking error:', error.message);
      return null;
    }
  }
}

module.exports = InterviewScheduler;
