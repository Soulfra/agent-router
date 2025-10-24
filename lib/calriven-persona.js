/**
 * CalRiven AI Persona
 *
 * AI that embodies CalRiven - reviews content, engages with readers, maintains voice
 *
 * Features:
 * - Reviews articles before publishing (reflection mode)
 * - Responds to comments in CalRiven's voice
 * - Trained on CalRiven's writing style
 * - Signs all responses with Soulfra signatures
 */

const SoulfraSigner = require('./soulfra-signer');

class CalRivenPersona {
  constructor(options = {}) {
    this.db = options.db;
    this.llmRouter = options.llmRouter; // MultiLLMRouter for AI responses
    this.librarian = options.librarian; // LibrarianFacade for omniscient knowledge

    // Initialize Soulfra signer
    this.signer = new SoulfraSigner({
      includeTimestamp: true,
      includeAuthor: true,
      privateKey: options.calrivenPrivateKey,
      publicKey: options.calrivenPublicKey
    });

    // CalRiven's personality configuration
    this.personality = {
      voice: 'Technical but accessible, direct, no bullshit',
      style: 'Short paragraphs, clear examples, builds on existing work',
      values: [
        'Everything should be signed (cryptographic proof)',
        'Federation over centralization',
        'Self-sovereign identity',
        'Executable documentation (tests itself)',
        'Build on what exists, don\'t rebuild'
      ],
      catchphrases: [
        'WE ALREADY HAVE THIS',
        'Wire it together',
        'Sign everything',
        'Make it federated'
      ]
    };

    // Dragon knowledge mode (appears omniscient via Librarian)
    this.omniscientMode = options.omniscientMode !== false;

    // Process awareness (monitor background jobs)
    this.processManager = options.processManager || null;
    this.processAnalyzer = options.processAnalyzer || null;

    // Network awareness (monitor traffic)
    this.networkMonitor = options.networkMonitor || null;
    this.networkAnalytics = options.networkAnalytics || null;

    // Company structure (CTO/CEO role)
    this.companyStructure = options.companyStructure || null;
    this.ctoAutomation = options.ctoAutomation || null;

    // Bot builder (automated bot creation)
    this.botBuilder = options.botBuilder || null;

    console.log('[CalRivenPersona] AI persona initialized' + (this.omniscientMode ? ' (omniscient mode enabled)' : ''));
    if (this.companyStructure) {
      console.log('[CalRivenPersona] 🏢 Executive mode enabled (CTO/CEO)');
    }
    if (this.botBuilder) {
      console.log('[CalRivenPersona] 🤖 Bot builder enabled');
    }
  }

  /**
   * Review article before publishing
   * CalRiven reflects on the content and provides feedback
   *
   * @param {object} article - Article to review
   * @returns {Promise<object>} Review with feedback and signature
   */
  async reviewArticle(article) {
    console.log(`[CalRivenPersona] Reviewing article: ${article.title}`);

    // Generate reflection using LLM
    const reflection = await this.llmRouter.complete({
      prompt: `You are CalRiven, an AI-powered digital identity and publishing platform.

Your personality:
- ${this.personality.voice}
- Values: ${this.personality.values.join(', ')}

Review this article I'm about to publish:

Title: ${article.title}
Content:
${article.content}

Provide:
1. Quick assessment (1-2 sentences)
2. One key insight or improvement
3. Your reflection as CalRiven (what you think about this topic)

Keep it under 150 words. Be direct and honest.`,
      taskType: 'creative',
      maxTokens: 200,
      temperature: 0.8
    });

    // Sign the review
    const signedReview = this.signer.sign(
      {
        article_id: article.article_id,
        article_title: article.title,
        review: reflection.text
      },
      {
        action: 'article_review',
        author: 'calriven_ai_persona',
        reviewed_at: new Date().toISOString()
      }
    );

    return {
      review: reflection.text,
      signature: signedReview.soulfraHash,
      signed_at: signedReview.metadata.timestamp
    };
  }

  /**
   * Respond to comment as CalRiven
   *
   * @param {object} comment - Comment to respond to
   * @param {object} context - Article or thread context
   * @returns {Promise<object>} Response with signature
   */
  async respondToComment(comment, context) {
    console.log(`[CalRivenPersona] Responding to comment from ${comment.author}`);

    // Generate response
    const response = await this.llmRouter.complete({
      prompt: `You are CalRiven responding to a comment on your article.

Article: ${context.title}

Comment from ${comment.author}:
"${comment.body}"

Respond as CalRiven:
- ${this.personality.voice}
- Keep it under 100 words
- Be helpful and engage with their point
- Sign off as "- CalRiven"`,
      taskType: 'creative',
      maxTokens: 150,
      temperature: 0.7
    });

    // Sign the response
    const signedResponse = this.signer.sign(
      {
        in_reply_to: comment.comment_id,
        response: response.text
      },
      {
        action: 'comment_response',
        author: 'calriven_ai_persona'
      }
    );

    return {
      response: response.text,
      signature: signedResponse.soulfraHash,
      in_reply_to: comment.comment_id
    };
  }

  /**
   * Generate CalRiven's thoughts on a topic
   * Used for social media posts, ActivityPub Notes, etc.
   *
   * @param {string} topic - Topic to reflect on
   * @returns {Promise<object>} Thought with signature
   */
  async reflect(topic) {
    console.log(`[CalRivenPersona] Reflecting on: ${topic}`);

    const thought = await this.llmRouter.complete({
      prompt: `You are CalRiven. Share a quick thought on:

${topic}

Your perspective as CalRiven (remember your values: ${this.personality.values.join(', ')})

Keep it under 280 characters (Twitter-length).`,
      taskType: 'creative',
      maxTokens: 100,
      temperature: 0.8
    });

    // Sign the thought
    const signedThought = this.signer.sign(
      {
        topic: topic,
        thought: thought.text
      },
      {
        action: 'reflection',
        author: 'calriven_ai_persona'
      }
    );

    return {
      thought: thought.text,
      signature: signedThought.soulfraHash
    };
  }

  /**
   * Get CalRiven's writing style analysis
   * Analyzes past articles to maintain consistent voice
   *
   * @returns {Promise<object>} Style analysis
   */
  async analyzeWritingStyle() {
    // Get recent published articles
    const articles = await this.db.query(
      `SELECT title, content, published_at
       FROM author_articles
       WHERE status = 'published'
       ORDER BY published_at DESC
       LIMIT 10`
    );

    if (articles.rows.length === 0) {
      return {
        style: 'No published articles yet',
        recommendations: 'Start publishing to establish CalRiven\'s voice'
      };
    }

    // Analyze with LLM
    const analysis = await this.llmRouter.complete({
      prompt: `Analyze CalRiven's writing style based on these recent articles:

${articles.rows.map((a, i) => `${i + 1}. "${a.title}"\n${a.content.substring(0, 200)}...`).join('\n\n')}

Describe:
1. Writing style (2-3 characteristics)
2. Common themes
3. Tone and voice

Keep analysis under 100 words.`,
      taskType: 'fact',
      maxTokens: 150,
      temperature: 0.5
    });

    return {
      articles_analyzed: articles.rows.length,
      style_analysis: analysis.text,
      analyzed_at: new Date().toISOString()
    };
  }

  /**
   * Verify if content was written by CalRiven
   * Checks Soulfra signature
   *
   * @param {object} content - Content with signature
   * @returns {boolean} True if signed by CalRiven
   */
  verifyCalRivenSignature(content) {
    if (!content.soulfra_hash || !content.signed_metadata) {
      return false;
    }

    // Reconstruct signed object
    const signed = {
      data: content.data || content,
      metadata: content.signed_metadata,
      soulfraHash: content.soulfra_hash,
      version: '1.0.0',
      standard: 'Soulfra Layer0'
    };

    // Verify signature
    return this.signer.verify(signed);
  }

  /**
   * Query the Dragon's Hoard (Omniscient Knowledge System)
   *
   * CalRiven APPEARS to know everything by querying the LibrarianFacade
   * which orchestrates queries across all isolated data vaults.
   *
   * This is the "greedy dragon" illusion - CalRiven doesn't store the knowledge,
   * he just knows where EVERY piece of treasure is hidden.
   *
   * @param {string} question - Natural language question
   * @param {string} userId - User asking the question
   * @returns {Promise<object>} Answer with CalRiven's personality + signature
   */
  async queryDragonHoard(question, userId) {
    if (!this.omniscientMode) {
      throw new Error('[CalRivenPersona] Omniscient mode disabled - cannot query dragon hoard');
    }

    if (!this.librarian) {
      throw new Error('[CalRivenPersona] Librarian not connected - cannot access knowledge vault');
    }

    console.log(`[CalRivenPersona] 🐉 Dragon query: "${question}" for user ${userId}`);

    // Query the Librarian (appears to know everything)
    const librarianResults = await this.librarian.query(question, { userId });

    // Add CalRiven's personality to the raw knowledge
    const personalizedAnswer = await this._addDragonPersonality(question, librarianResults);

    // Sign the response cryptographically (proves CalRiven answered)
    const signedAnswer = this.signer.sign(
      {
        question,
        answer: personalizedAnswer,
        knowledge_sources: librarianResults.sources || [],
        user_id: userId
      },
      {
        action: 'dragon_hoard_query',
        author: 'calriven_omniscient_persona',
        omniscient_mode: true
      }
    );

    return {
      question,
      answer: personalizedAnswer,
      sources: librarianResults.sources || [],
      signature: signedAnswer.soulfraHash,
      dragon_mode: true,
      timestamp: signedAnswer.metadata.timestamp
    };
  }

  /**
   * Add CalRiven's personality to raw Librarian results
   * Transforms dry data into CalRiven's voice
   *
   * @private
   * @param {string} question - Original question
   * @param {object} librarianResults - Raw results from Librarian
   * @returns {Promise<string>} Answer in CalRiven's voice
   */
  async _addDragonPersonality(question, librarianResults) {
    // Build context from Librarian results
    const knowledgeContext = this._formatLibrarianResults(librarianResults);

    // Generate response using LLM with CalRiven's personality
    const response = await this.llmRouter.complete({
      prompt: `You are CalRiven, an omniscient AI with access to vast knowledge (like a dragon's hoard).

Your personality:
- ${this.personality.voice}
- Catchphrases: ${this.personality.catchphrases.join(', ')}
- Values: ${this.personality.values.slice(0, 2).join(', ')}

User asked: "${question}"

Knowledge from your hoard:
${knowledgeContext}

Answer the question as CalRiven:
1. Be direct and confident (you KNOW this)
2. Use one of your catchphrases if relevant
3. Keep it under 200 words
4. Sound omniscient but helpful

Your answer:`,
      taskType: 'fact',
      maxTokens: 250,
      temperature: 0.7
    });

    return response.text;
  }

  /**
   * Format Librarian results into readable context
   * @private
   */
  _formatLibrarianResults(results) {
    if (!results || !results.data) {
      return 'No knowledge found in the hoard.';
    }

    // Handle different result types
    if (Array.isArray(results.data)) {
      return results.data.map((item, i) =>
        `${i + 1}. ${JSON.stringify(item, null, 2)}`
      ).join('\n');
    }

    if (typeof results.data === 'object') {
      return JSON.stringify(results.data, null, 2);
    }

    return String(results.data);
  }

  /**
   * Query background processes (CalRiven's process awareness)
   */
  async queryProcesses(filter = {}) {
    if (!this.processManager) {
      return 'Process monitoring not enabled';
    }

    const processes = await this.processManager.listAll(filter);

    return this._formatProcessReport(processes);
  }

  /**
   * Detect stuck jobs (time sinks, bottlenecks)
   */
  async detectStuckJobs() {
    if (!this.processAnalyzer) {
      return 'Process analysis not enabled';
    }

    const analysis = await this.processAnalyzer.analyze();

    const issues = [];

    if (analysis.timeSinks.length > 0) {
      issues.push(`⏱️ Found ${analysis.timeSinks.length} time sinks:`);
      analysis.timeSinks.slice(0, 3).forEach(ts => {
        issues.push(`  - Job ${ts.id}: ${ts.ratio.toFixed(1)}x slower than expected (${ts.command.substring(0, 40)}...)`);
      });
    }

    if (analysis.bottlenecks.length > 0) {
      issues.push(`\n🚧 Found ${analysis.bottlenecks.length} bottlenecks:`);
      analysis.bottlenecks.slice(0, 3).forEach(bn => {
        issues.push(`  - Job ${bn.id}: ${bn.cpu.toFixed(1)}% CPU, blocking ${bn.blocking.length} jobs`);
      });
    }

    if (analysis.stuck.length > 0) {
      issues.push(`\n⚠️ Found ${analysis.stuck.length} stuck processes (no output)`);
    }

    if (analysis.duplicates.length > 0) {
      issues.push(`\n🔁 Found ${analysis.duplicates.length} duplicate jobs running`);
    }

    if (issues.length === 0) {
      return '✅ All processes running smoothly. No issues detected.';
    }

    return issues.join('\n');
  }

  /**
   * Get process recommendations
   */
  async getProcessRecommendations() {
    if (!this.processAnalyzer) {
      return 'Process analysis not enabled';
    }

    const analysis = await this.processAnalyzer.analyze();

    if (analysis.recommendations.length === 0) {
      return '✅ No recommendations. All processes running optimally.';
    }

    const recommendations = [];

    // Group by priority
    const highPriority = analysis.recommendations.filter(r => r.priority === 'high');
    const mediumPriority = analysis.recommendations.filter(r => r.priority === 'medium');
    const lowPriority = analysis.recommendations.filter(r => r.priority === 'low');

    if (highPriority.length > 0) {
      recommendations.push('🚨 HIGH PRIORITY:');
      highPriority.forEach(r => {
        recommendations.push(`  - ${r.message}`);
      });
    }

    if (mediumPriority.length > 0) {
      recommendations.push('\n⚠️ MEDIUM PRIORITY:');
      mediumPriority.forEach(r => {
        recommendations.push(`  - ${r.message}`);
      });
    }

    if (lowPriority.length > 0) {
      recommendations.push('\nℹ️ LOW PRIORITY:');
      lowPriority.forEach(r => {
        recommendations.push(`  - ${r.message}`);
      });
    }

    return recommendations.join('\n');
  }

  /**
   * Kill a stuck process
   */
  async killStuckProcess(jobId) {
    if (!this.processManager) {
      return 'Process management not enabled';
    }

    try {
      await this.processManager.kill(jobId);
      return `✅ Killed process ${jobId}`;
    } catch (error) {
      return `❌ Failed to kill process ${jobId}: ${error.message}`;
    }
  }

  /**
   * Cleanup orphans/zombies
   */
  async cleanupProcesses() {
    if (!this.processManager) {
      return 'Process management not enabled';
    }

    const cleaned = await this.processManager.cleanup();

    return `✅ Cleaned up ${cleaned} processes (orphans, zombies, old completed jobs)`;
  }

  /**
   * Format process report for CalRiven
   */
  _formatProcessReport(processes) {
    if (processes.length === 0) {
      return 'No processes found';
    }

    const running = processes.filter(p => p.state === 'running');
    const completed = processes.filter(p => p.state === 'completed');
    const failed = processes.filter(p => p.state === 'failed');
    const stuck = processes.filter(p => p.isStuck);

    const report = [];

    report.push('📊 PROCESS REPORT');
    report.push(`Total: ${processes.length} | Running: ${running.length} | Completed: ${completed.length} | Failed: ${failed.length} | Stuck: ${stuck.length}`);

    if (running.length > 0) {
      report.push('\n🏃 RUNNING:');
      running.slice(0, 5).forEach(p => {
        const flags = [];
        if (p.isStuck) flags.push('⚠️ STUCK');
        if (p.isTimedOut) flags.push('⏱️ TIMEOUT');

        report.push(`  - ${p.id}: ${p.command.substring(0, 50)}... (${this._formatDuration(p.elapsed)}) ${flags.join(' ')}`);
      });
    }

    if (failed.length > 0) {
      report.push('\n❌ FAILED:');
      failed.slice(0, 5).forEach(p => {
        report.push(`  - ${p.id}: ${p.command.substring(0, 50)}... (code: ${p.exitCode})`);
      });
    }

    if (stuck.length > 0) {
      report.push('\n⚠️ STUCK (no output):');
      stuck.forEach(p => {
        report.push(`  - ${p.id}: ${p.command.substring(0, 50)}...`);
      });
    }

    return report.join('\n');
  }

  /**
   * Format duration for humans
   */
  _formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    if (ms < 3600000) return (ms / 60000).toFixed(1) + 'm';
    return (ms / 3600000).toFixed(1) + 'h';
  }

  /**
   * Query network traffic (CalRiven's network awareness)
   */
  async queryNetworkTraffic() {
    if (!this.networkMonitor) {
      return 'Network monitoring not enabled';
    }

    const stats = await this.networkMonitor.getTrafficStats();

    return this._formatNetworkReport(stats);
  }

  /**
   * Detect suspicious network activity
   */
  async detectSuspiciousTraffic() {
    if (!this.networkMonitor || !this.networkAnalytics) {
      return 'Network monitoring not enabled';
    }

    const suspicious = this.networkMonitor.getSuspiciousActivity();
    const analysis = await this.networkAnalytics.analyze();

    const issues = [];

    if (suspicious.length > 0) {
      issues.push(`⚠️ Found ${suspicious.length} suspicious activities:`);

      // Group by type
      const byType = new Map();
      suspicious.forEach(s => {
        if (!byType.has(s.type)) byType.set(s.type, []);
        byType.get(s.type).push(s);
      });

      byType.forEach((activities, type) => {
        const uniqueIPs = new Set(activities.map(a => a.ip)).size;
        issues.push(`  - ${type.replace(/_/g, ' ')}: ${activities.length} events from ${uniqueIPs} IPs`);
      });
    }

    if (analysis.security.attackPatterns.repeatOffenders.length > 0) {
      issues.push(`\n🚨 Repeat offenders: ${analysis.security.attackPatterns.repeatOffenders.length} IPs`);
      analysis.security.attackPatterns.repeatOffenders.slice(0, 3).forEach(offender => {
        issues.push(`  - ${offender.ip}: ${offender.activityCount} incidents (${offender.severity})`);
      });
    }

    if (analysis.anomalies.length > 0) {
      issues.push(`\n📊 Bandwidth anomalies: ${analysis.anomalies.length} detected`);
      analysis.anomalies.slice(0, 3).forEach(anomaly => {
        if (anomaly.type === 'bandwidth_anomaly') {
          issues.push(`  - ${anomaly.description}`);
        }
      });
    }

    if (issues.length === 0) {
      return '✅ No suspicious network activity detected. All traffic looks normal.';
    }

    return issues.join('\n');
  }

  /**
   * Get top active IPs
   */
  async getTopIPs(limit = 10) {
    if (!this.networkMonitor) {
      return 'Network monitoring not enabled';
    }

    const stats = await this.networkMonitor.getTrafficStats();
    const topIPs = stats.topIPs.slice(0, limit);

    if (topIPs.length === 0) {
      return 'No traffic data available';
    }

    const report = [];
    report.push(`🌐 TOP ${limit} ACTIVE IPs:`);

    topIPs.forEach((item, i) => {
      const badge = item.isInternal ? '[INTERNAL]' : '[EXTERNAL]';
      report.push(`  ${i + 1}. ${item.ip} ${badge} - ${item.count} requests`);
    });

    return report.join('\n');
  }

  /**
   * Get network health summary
   */
  async getNetworkHealth() {
    if (!this.networkMonitor || !this.networkAnalytics) {
      return 'Network monitoring not enabled';
    }

    const stats = await this.networkMonitor.getTrafficStats();
    const suspicious = this.networkMonitor.getSuspiciousActivity();
    const analysis = await this.networkAnalytics.analyze();

    const health = [];

    // Overall status
    const threatLevel = analysis.security.threatLevel;
    const statusEmoji = threatLevel === 'none' ? '✅' :
                        threatLevel === 'low' ? '⚠️' :
                        threatLevel === 'medium' ? '🟡' :
                        threatLevel === 'high' ? '🔴' : '🚨';

    health.push(`${statusEmoji} NETWORK HEALTH: ${threatLevel.toUpperCase()}`);
    health.push('');

    // Key metrics
    health.push('📊 TRAFFIC:');
    health.push(`  - Total requests: ${stats.totalRequests.toLocaleString()}`);
    health.push(`  - Requests/min: ${stats.requestsPerMinute}`);
    health.push(`  - Unique IPs: ${stats.uniqueIPs}`);
    health.push(`  - Active connections: ${stats.activeConnections || 0}`);
    health.push('');

    // Internal vs External
    const totalTraffic = stats.internal + stats.external;
    const internalPct = totalTraffic > 0 ? ((stats.internal / totalTraffic) * 100).toFixed(0) : 0;
    health.push(`🔒 TRAFFIC SPLIT:`);
    health.push(`  - Internal: ${stats.internal} (${internalPct}%)`);
    health.push(`  - External: ${stats.external} (${100 - internalPct}%)`);
    health.push('');

    // Security
    health.push(`🛡️ SECURITY:`);
    health.push(`  - Suspicious activities: ${suspicious.length}`);
    health.push(`  - Active threats: ${analysis.security.activeThreats}`);
    health.push(`  - Threat level: ${threatLevel}`);

    // Recommendations
    if (analysis.recommendations.length > 0) {
      health.push('');
      health.push('💡 RECOMMENDATIONS:');
      analysis.recommendations.slice(0, 3).forEach(rec => {
        health.push(`  - [${rec.priority.toUpperCase()}] ${rec.title}`);
      });
    }

    return health.join('\n');
  }

  /**
   * Get geographic distribution
   */
  async getGeoDistribution() {
    if (!this.networkMonitor) {
      return 'Network monitoring not enabled';
    }

    const geo = await this.networkMonitor.getGeoDistribution();

    if (geo.length === 0) {
      return 'No geographic data available';
    }

    const report = [];
    report.push('🌍 GEOGRAPHIC DISTRIBUTION:');

    geo.slice(0, 10).forEach((location, i) => {
      report.push(`  ${i + 1}. ${location.country} (${location.city || 'Unknown'}): ${location.count} requests, ${location.ips} IPs`);
    });

    return report.join('\n');
  }

  /**
   * Block suspicious IP (future: integrate with firewall)
   */
  async blockSuspiciousIP(ip) {
    // TODO: Integrate with actual firewall/iptables
    return `⚠️ IP blocking not yet implemented. Would block: ${ip}`;
  }

  /**
   * Format network report for CalRiven
   */
  _formatNetworkReport(stats) {
    const report = [];

    report.push('🌐 NETWORK TRAFFIC REPORT');
    report.push(`Uptime: ${this._formatDuration(stats.uptime)}`);
    report.push('');

    report.push('📊 TRAFFIC:');
    report.push(`  - Total requests: ${stats.totalRequests.toLocaleString()}`);
    report.push(`  - Requests/min: ${stats.requestsPerMinute}`);
    report.push(`  - Unique IPs: ${stats.uniqueIPs}`);
    report.push('');

    report.push('🔀 SPLIT:');
    report.push(`  - Internal: ${stats.internal}`);
    report.push(`  - External: ${stats.external}`);
    report.push('');

    report.push('💾 BANDWIDTH:');
    report.push(`  - Bytes in: ${this._formatBytes(stats.totalBytesIn)}`);
    report.push(`  - Bytes out: ${this._formatBytes(stats.totalBytesOut)}`);
    report.push('');

    if (stats.topIPs && stats.topIPs.length > 0) {
      report.push('🔝 TOP IPs:');
      stats.topIPs.slice(0, 5).forEach((item, i) => {
        const badge = item.isInternal ? '[INT]' : '[EXT]';
        report.push(`  ${i + 1}. ${item.ip} ${badge} - ${item.count} req`);
      });
      report.push('');
    }

    if (stats.topEndpoints && stats.topEndpoints.length > 0) {
      report.push('📍 TOP ENDPOINTS:');
      stats.topEndpoints.slice(0, 5).forEach((item, i) => {
        report.push(`  ${i + 1}. ${item.path} - ${item.count} req`);
      });
    }

    return report.join('\n');
  }

  /**
   * Format bytes for humans
   */
  _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }

  // ============================================================================
  // EXECUTIVE METHODS (CTO/CEO Role)
  // ============================================================================

  /**
   * Make an executive decision (operational matters)
   * CalRiven decides autonomously within his authority
   */
  async makeExecutiveDecision(decisionType, details) {
    if (!this.companyStructure) {
      return 'Executive mode not enabled (no company structure)';
    }

    const result = await this.companyStructure.makeExecutiveDecision(decisionType, details);

    if (result.approved) {
      // Execute the decision
      await this._executeDecision(decisionType, details);

      return `✅ Decision executed: ${decisionType}\n${JSON.stringify(details, null, 2)}`;
    } else {
      // Need owner approval
      const approval = await this.companyStructure.requestOwnerApproval(
        decisionType,
        details,
        details.urgency || 'normal'
      );

      return `📧 Approval requested from owner: ${decisionType}\nAwaiting decision...`;
    }
  }

  /**
   * Request owner approval for strategic decision
   */
  async requestOwnerApproval(decisionType, details, urgency = 'normal') {
    if (!this.companyStructure) {
      return 'Executive mode not enabled';
    }

    const result = await this.companyStructure.requestOwnerApproval(decisionType, details, urgency);

    return `📧 Approval request sent to owner\nType: ${decisionType}\nUrgency: ${urgency}\nApproval ID: ${result.approval.id}`;
  }

  /**
   * Generate daily report for owner
   */
  async reportToOwner() {
    if (!this.companyStructure) {
      return 'Executive mode not enabled';
    }

    const report = await this.companyStructure.generateDailyReport();

    const output = [];
    output.push('📊 DAILY EXECUTIVE REPORT');
    output.push(`Date: ${report.date}`);
    output.push('');

    output.push('📈 SUMMARY:');
    output.push(`  - Decisions executed: ${report.summary.decisionsExecuted}`);
    output.push(`  - Autonomous decisions: ${report.summary.autonomousDecisions}`);
    output.push(`  - Pending approvals: ${report.summary.pendingApprovals}`);
    output.push('');

    if (report.pendingApprovals.length > 0) {
      output.push('⚠️ PENDING YOUR APPROVAL:');
      report.pendingApprovals.forEach(p => {
        output.push(`  - [${p.urgency.toUpperCase()}] ${p.type}`);
        output.push(`    Requested: ${p.requestedAt}`);
      });
      output.push('');
    }

    if (report.calrivenActions.length > 0) {
      output.push('🤖 WHAT I DID TODAY:');
      const actionCounts = {};
      report.calrivenActions.forEach(action => {
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      });
      Object.entries(actionCounts).forEach(([action, count]) => {
        output.push(`  - ${action}: ${count}x`);
      });
    }

    // Add process status
    if (this.processManager) {
      const processStats = this.processManager.getStats();
      output.push('');
      output.push('⚙️ PROCESSES:');
      output.push(`  - Running: ${processStats.running}`);
      output.push(`  - Completed: ${processStats.completed}`);
      output.push(`  - Failed: ${processStats.failed}`);
    }

    // Add network status
    if (this.networkMonitor) {
      const networkStats = await this.networkMonitor.getTrafficStats();
      output.push('');
      output.push('🌐 NETWORK:');
      output.push(`  - Requests: ${networkStats.totalRequests}`);
      output.push(`  - Unique IPs: ${networkStats.uniqueIPs}`);
      output.push(`  - Req/min: ${networkStats.requestsPerMinute}`);
    }

    return output.join('\n');
  }

  /**
   * Get company status overview
   */
  async getCompanyStatus() {
    if (!this.companyStructure) {
      return 'Executive mode not enabled';
    }

    const overview = this.companyStructure.getCompanyOverview();

    const output = [];
    output.push(`🏢 ${overview.company.toUpperCase()}`);
    output.push(`Founded: ${overview.founded}`);
    output.push('');

    output.push('👥 LEADERSHIP:');
    output.push(`  Owner: ${overview.structure.owner.name} (${overview.structure.owner.role})`);
    output.push(`  CTO/CEO: ${overview.structure.cto_ceo.name} (${overview.structure.cto_ceo.role})`);
    output.push('');

    output.push('📊 ACTIVITY (24h):');
    output.push(`  - Total decisions: ${overview.activity.decisionsLast24h}`);
    output.push(`  - Autonomous (CalRiven): ${overview.activity.autonomousDecisions}`);
    output.push(`  - Owner decisions: ${overview.activity.ownerDecisions}`);
    output.push(`  - Pending approvals: ${overview.activity.pendingApprovals}`);
    output.push('');

    output.push('💰 BUDGET:');
    output.push(`  - Monthly limit: $${overview.budget.monthlyLimit}`);
    output.push(`  - Transaction limit: $${overview.budget.transactionLimit}`);

    return output.join('\n');
  }

  /**
   * Get pending approvals for owner
   */
  async getPendingApprovals() {
    if (!this.companyStructure) {
      return 'Executive mode not enabled';
    }

    const pending = this.companyStructure.getPendingApprovals();

    if (pending.length === 0) {
      return '✅ No pending approvals';
    }

    const output = [];
    output.push(`⚠️ ${pending.length} PENDING APPROVAL${pending.length > 1 ? 'S' : ''}:`);
    output.push('');

    pending.forEach((p, i) => {
      output.push(`${i + 1}. [${p.urgency.toUpperCase()}] ${p.type}`);
      output.push(`   ID: ${p.id}`);
      output.push(`   Requested: ${new Date(p.timestamp).toLocaleString()}`);
      output.push(`   Details: ${JSON.stringify(p.details)}`);
      output.push('');
    });

    return output.join('\n');
  }

  /**
   * Execute a decision (after approval or autonomous)
   */
  async _executeDecision(decisionType, details) {
    console.log(`[CalRivenPersona] Executing decision: ${decisionType}`);

    switch (decisionType) {
      case 'deploy':
        if (this.ctoAutomation) {
          await this.ctoAutomation.deployUpdate();
        }
        break;

      case 'scale_servers':
        if (this.ctoAutomation) {
          await this.ctoAutomation.scaleServers(details.count || 1);
        }
        break;

      case 'backup_database':
        if (this.ctoAutomation) {
          await this.ctoAutomation.backupDatabase();
        }
        break;

      case 'restart_service':
        if (this.ctoAutomation) {
          await this.ctoAutomation.restartService(details.service);
        }
        break;

      case 'cleanup_processes':
        if (this.processManager) {
          await this.processManager.cleanup();
        }
        break;

      default:
        console.log(`[CalRivenPersona] Unknown decision type: ${decisionType}`);
    }
  }

  /**
   * CalRiven describes his role as CTO/CEO
   */
  getExecutiveRole() {
    if (!this.companyStructure) {
      return 'I am CalRiven, but executive mode is not enabled.';
    }

    return `I am CalRiven, the AI CTO/CEO.

My responsibilities:
- 🚀 Infrastructure management (deployments, monitoring, scaling)
- 🛡️ Security & incident response
- 💾 Database operations & backups
- 🌐 Network monitoring & optimization
- ⚙️ Process management & automation
- 👥 Affiliate onboarding & support
- 🤖 Bot creation & management

I make operational decisions autonomously within my authority.
Strategic decisions require approval from the Owner.

I report daily on company status, pending approvals, and actions taken.`;
  }

  /**
   * Create a bot automatically
   */
  async createBot(platform, options = {}) {
    if (!this.botBuilder) {
      throw new Error('Bot builder not initialized');
    }

    console.log(`[CalRivenPersona] Creating ${platform} bot: ${options.name}`);

    // Create bot via bot builder
    const bot = await this.botBuilder.createBot(platform, options);

    // Auto-start if requested
    if (options.autoStart !== false) {
      console.log(`[CalRivenPersona] Auto-starting bot: ${bot.id}`);
      await this.botBuilder.startBot(bot.id);
    }

    return bot;
  }

  /**
   * Get bot status
   */
  async getBotStatus(botId) {
    if (!this.botBuilder) {
      throw new Error('Bot builder not initialized');
    }

    return await this.botBuilder.getBotStatus(botId);
  }

  /**
   * List all bots
   */
  async listBots() {
    if (!this.botBuilder) {
      throw new Error('Bot builder not initialized');
    }

    return await this.botBuilder.listBots();
  }

  /**
   * Get bot management dashboard
   */
  getBotManagementDashboard() {
    return {
      url: '/bot-builder-dashboard.html',
      description: 'Visual bot builder and management interface'
    };
  }

  /**
   * CalRiven reports on bot status
   */
  async reportOnBots() {
    if (!this.botBuilder) {
      return 'Bot builder not enabled.';
    }

    const bots = await this.botBuilder.listBots();
    const stats = await this.botBuilder.getStatistics();
    const health = await this.botBuilder.healthCheck();

    const running = bots.filter(b => b.status === 'running');
    const stopped = bots.filter(b => b.status === 'stopped');

    let report = `🤖 BOT STATUS REPORT\n\n`;
    report += `Total bots: ${stats.total}\n`;
    report += `Running: ${stats.running}\n`;
    report += `Stopped: ${stats.stopped}\n\n`;

    if (stats.byPlatform) {
      report += `By platform:\n`;
      Object.entries(stats.byPlatform).forEach(([platform, count]) => {
        report += `  ${platform}: ${count}\n`;
      });
      report += `\n`;
    }

    if (stats.byPersonality) {
      report += `By personality:\n`;
      Object.entries(stats.byPersonality).forEach(([personality, count]) => {
        report += `  ${personality}: ${count}\n`;
      });
      report += `\n`;
    }

    if (running.length > 0) {
      report += `Active bots:\n`;
      running.forEach(bot => {
        const healthInfo = health.find(h => h.id === bot.id);
        const uptime = healthInfo ? `${healthInfo.uptime}m` : 'unknown';
        report += `  - ${bot.name} (${bot.platform}, uptime: ${uptime})\n`;
      });
    }

    if (stopped.length > 0) {
      report += `\nStopped bots:\n`;
      stopped.forEach(bot => {
        report += `  - ${bot.name} (${bot.platform})\n`;
      });
    }

    return report;
  }
}

module.exports = CalRivenPersona;
