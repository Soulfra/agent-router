/**
 * Firestore Monitor - Cal's Q&A Responder
 * Monitors Firestore for unanswered questions from DeathToData
 * Routes to CALOS agents and posts answers back
 */

const admin = require('firebase-admin');
const axios = require('axios');

// Configuration
const ROUTER_URL = process.env.ROUTER_URL || 'http://localhost:5001';
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 30000; // 30 seconds

// Initialize Firebase Admin
const serviceAccount = process.env.FIREBASE_CREDENTIALS
  ? JSON.parse(process.env.FIREBASE_CREDENTIALS)
  : require(process.env.FIREBASE_KEY_PATH || './firebase-credentials.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

class FirestoreMonitor {
  constructor() {
    this.isProcessing = false;
  }

  /**
   * Check for unanswered questions
   */
  async checkForQuestions() {
    if (this.isProcessing) {
      console.log('⏳ Previous check still processing...');
      return;
    }

    try {
      this.isProcessing = true;
      console.log(`\n🔍 Checking for unanswered questions... [${new Date().toISOString()}]`);

      // Query unanswered questions
      const questionsSnapshot = await db.collection('questions')
        .where('answered', '==', false)
        .orderBy('created_at', 'asc')
        .limit(5) // Process 5 at a time
        .get();

      if (questionsSnapshot.empty) {
        console.log('✓ No unanswered questions');
        return;
      }

      console.log(`📬 Found ${questionsSnapshot.size} unanswered question(s)`);

      // Process each question
      for (const doc of questionsSnapshot.docs) {
        await this.answerQuestion(doc.id, doc.data());
      }

    } catch (error) {
      console.error('❌ Error checking questions:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Answer a single question
   */
  async answerQuestion(questionId, questionData) {
    try {
      console.log(`\n💬 Processing question: "${questionData.title}"`);
      console.log(`   ID: ${questionId}`);
      console.log(`   User: ${questionData.fingerprint}`);

      // Format question for CALOS
      const prompt = `Question: ${questionData.title}\n\nDetails: ${questionData.body}\n\nPlease provide a helpful, detailed answer.`;

      // Send to CALOS router
      const routerResponse = await axios.post(`${ROUTER_URL}/agent`, {
        input: prompt,
        context: {
          source: 'deathtodata_qa',
          question_id: questionId,
          fingerprint: questionData.fingerprint
        }
      });

      // Extract answer from logs
      const logs = routerResponse.data.logs || [];

      if (logs.length === 0) {
        throw new Error('No response from agents');
      }

      // Use the first successful agent response
      const successfulLog = logs.find(log => !log.error);

      if (!successfulLog) {
        throw new Error('All agents failed');
      }

      const answer = successfulLog.result;
      const answeredBy = successfulLog.agent;

      console.log(`✓ Got answer from ${answeredBy}`);
      console.log(`   Length: ${answer.length} characters`);

      // Update question in Firestore
      await db.collection('questions').doc(questionId).update({
        answered: true,
        answer: answer,
        answered_by: answeredBy,
        answered_at: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('✓ Answer saved to Firestore');

      // Award VIBES to user
      await this.awardVibesForAnswer(questionData.fingerprint, questionId);

      console.log(`✅ Question ${questionId} answered successfully`);

    } catch (error) {
      console.error(`❌ Error answering question ${questionId}:`, error.message);

      // Mark as failed (for debugging)
      try {
        await db.collection('questions').doc(questionId).update({
          error: error.message,
          error_at: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (updateError) {
        console.error('Failed to update error status:', updateError.message);
      }
    }
  }

  /**
   * Award VIBES to user when their question is answered
   */
  async awardVibesForAnswer(fingerprint, questionId) {
    try {
      const vibesRef = db.collection('vibes_users').doc(fingerprint);
      const vibesDoc = await vibesRef.get();

      if (!vibesDoc.exists) {
        // Create new user with 1.0 VIBES
        await vibesRef.set({
          fingerprint,
          balance: 1.0,
          lifetime_earned: 1.0,
          lifetime_spent: 0.0,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          last_activity: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Increment existing balance
        await vibesRef.update({
          balance: admin.firestore.FieldValue.increment(1.0),
          lifetime_earned: admin.firestore.FieldValue.increment(1.0),
          last_activity: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Record transaction
      await db.collection('vibes_transactions').add({
        fingerprint,
        type: 'earn',
        action: 'question_answered',
        amount: 1.0,
        question_id: questionId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Mark question as VIBES awarded
      await db.collection('questions').doc(questionId).update({
        vibes_awarded: true
      });

      console.log(`✓ Awarded 1.0 VIBES to ${fingerprint}`);

    } catch (error) {
      console.error('❌ Error awarding VIBES:', error.message);
      // Don't fail the whole operation if VIBES fails
    }
  }

  /**
   * Start monitoring
   */
  start() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Cal\'s Firestore Q&A Monitor          ║');
    console.log('║  DeathToData Question Responder        ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log(`🔗 CALOS Router: ${ROUTER_URL}`);
    console.log(`⏱️  Check Interval: ${CHECK_INTERVAL / 1000}s`);
    console.log('');
    console.log('🚀 Monitor started. Cal is watching for questions...');
    console.log('');

    // Check immediately
    this.checkForQuestions();

    // Then check periodically
    setInterval(() => {
      this.checkForQuestions();
    }, CHECK_INTERVAL);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start monitor
const monitor = new FirestoreMonitor();
monitor.start();
