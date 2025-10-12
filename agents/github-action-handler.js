/**
 * GitHub Action Handler
 * Processes GitHub notifications and takes appropriate action
 * - PR review requests → Auto-review with Claude
 * - Issue assignments → Add to backlog, respond with timeline
 * - Security alerts → Notify via Discord
 * - Pages/Workflow failures → Debug and report
 */

const axios = require('axios');

// Configuration
const ROUTER_URL = process.env.ROUTER_URL || 'http://localhost:5001';
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
const AUTO_REVIEW_ENABLED = process.env.AUTO_REVIEW_ENABLED === 'true';

class GitHubActionHandler {
  /**
   * Handle a GitHub notification
   */
  async handle(notification) {
    console.log(`\n🔧 Handling ${notification.type}...`);

    try {
      switch (notification.type) {
        case 'pr_review_request':
          return await this.handlePRReviewRequest(notification);

        case 'pr_mention':
        case 'pr_commented':
          return await this.handlePRComment(notification);

        case 'issue_mention':
        case 'issue_commented':
          return await this.handleIssueComment(notification);

        case 'issue_assigned':
          return await this.handleIssueAssignment(notification);

        case 'security_alert':
          return await this.handleSecurityAlert(notification);

        case 'pages_failure':
          return await this.handlePagesFailure(notification);

        case 'workflow_failure':
          return await this.handleWorkflowFailure(notification);

        default:
          console.log(`⚠️  Unknown notification type: ${notification.type}`);
          return null;
      }
    } catch (error) {
      console.error(`❌ Error handling ${notification.type}:`, error.message);
      return { error: error.message };
    }
  }

  /**
   * Handle PR review request
   */
  async handlePRReviewRequest(notification) {
    if (!AUTO_REVIEW_ENABLED) {
      console.log('⚠️  Auto-review disabled, skipping');
      return { skipped: true, reason: 'auto-review disabled' };
    }

    console.log('🤖 Requesting code review from Claude...');

    // Extract PR URL from body
    const prUrlMatch = notification.body.match(/https:\/\/github\.com\/[^\s]+pull\/\d+/);
    if (!prUrlMatch) {
      console.log('⚠️  Could not extract PR URL');
      return { error: 'PR URL not found' };
    }

    const prUrl = prUrlMatch[0];

    // Send to CALOS router for review
    const response = await axios.post(`${ROUTER_URL}/agent`, {
      input: `Review this GitHub pull request and provide feedback: ${prUrl}`,
      context: {
        source: 'github_pr_review',
        pr_url: prUrl
      },
      target_agents: ['@claude']  // Use Claude for code reviews
    });

    const review = response.data.logs[0]?.result;

    console.log('✓ Code review generated');
    console.log(`   Length: ${review?.length || 0} characters`);

    // In a real implementation, post review as GitHub comment
    // For now, just log it
    return {
      success: true,
      pr_url: prUrl,
      review_length: review?.length || 0
    };
  }

  /**
   * Handle PR comment/mention
   */
  async handlePRComment(notification) {
    console.log('💬 PR comment detected');

    // Extract question or request from comment
    // Route to appropriate AI agent for response

    return {
      success: true,
      action: 'logged'
    };
  }

  /**
   * Handle issue comment/mention
   */
  async handleIssueComment(notification) {
    console.log('💬 Issue comment detected');

    // Similar to PR comment handling
    return {
      success: true,
      action: 'logged'
    };
  }

  /**
   * Handle issue assignment
   */
  async handleIssueAssignment(notification) {
    console.log('📋 Issue assigned');

    // Extract issue URL
    const issueUrlMatch = notification.body.match(/https:\/\/github\.com\/[^\s]+issues\/\d+/);
    if (!issueUrlMatch) {
      console.log('⚠️  Could not extract issue URL');
      return { error: 'Issue URL not found' };
    }

    const issueUrl = issueUrlMatch[0];

    // Use GPT-4 to analyze and estimate
    const response = await axios.post(`${ROUTER_URL}/agent`, {
      input: `Analyze this GitHub issue and provide an estimated timeline and complexity: ${issueUrl}`,
      context: {
        source: 'github_issue_triage',
        issue_url: issueUrl
      },
      target_agents: ['@gpt4']
    });

    const analysis = response.data.logs[0]?.result;

    console.log('✓ Issue analyzed');

    // In real implementation, post comment with timeline
    return {
      success: true,
      issue_url: issueUrl,
      analyzed: true
    };
  }

  /**
   * Handle security alert
   */
  async handleSecurityAlert(notification) {
    console.log('🚨 Security alert detected');

    // Notify via Discord if webhook configured
    if (DISCORD_WEBHOOK) {
      await axios.post(DISCORD_WEBHOOK, {
        content: `🚨 **Security Alert** 🚨\n\n${notification.subject}\n\nCheck GitHub for details.`
      });
      console.log('✓ Discord notification sent');
    }

    // Extract vulnerability details
    const response = await axios.post(`${ROUTER_URL}/agent`, {
      input: `Analyze this security alert and provide recommendations: ${notification.body.substring(0, 500)}`,
      context: {
        source: 'github_security',
        subject: notification.subject
      },
      target_agents: ['@claude']
    });

    const recommendations = response.data.logs[0]?.result;

    console.log('✓ Security analysis completed');

    return {
      success: true,
      notified: !!DISCORD_WEBHOOK,
      analyzed: true
    };
  }

  /**
   * Handle GitHub Pages failure
   */
  async handlePagesFailure(notification) {
    console.log('📄 Pages deployment failed');

    // Extract error details
    const errorMatch = notification.body.match(/error|failed|failure/i);

    // Use GPT-4 to diagnose
    const response = await axios.post(`${ROUTER_URL}/agent`, {
      input: `Diagnose this GitHub Pages failure and suggest fixes: ${notification.body.substring(0, 500)}`,
      context: {
        source: 'github_pages_debug',
        subject: notification.subject
      },
      target_agents: ['@gpt4']
    });

    const diagnosis = response.data.logs[0]?.result;

    console.log('✓ Diagnosis generated');

    // Notify via Discord
    if (DISCORD_WEBHOOK) {
      await axios.post(DISCORD_WEBHOOK, {
        content: `⚠️ **GitHub Pages Deployment Failed**\n\n${notification.subject}\n\n**Diagnosis:**\n${diagnosis?.substring(0, 500) || 'Check logs'}`
      });
    }

    return {
      success: true,
      diagnosed: true,
      notified: !!DISCORD_WEBHOOK
    };
  }

  /**
   * Handle workflow/action failure
   */
  async handleWorkflowFailure(notification) {
    console.log('⚙️ Workflow/Action failed');

    // Extract workflow name and error
    const workflowMatch = notification.subject.match(/Run failed: (.+)/);
    const workflowName = workflowMatch ? workflowMatch[1] : 'Unknown';

    console.log(`   Workflow: ${workflowName}`);

    // Use GPT-4 to diagnose
    const response = await axios.post(`${ROUTER_URL}/agent`, {
      input: `Diagnose this GitHub Actions workflow failure and suggest fixes: ${notification.body.substring(0, 500)}`,
      context: {
        source: 'github_workflow_debug',
        workflow: workflowName,
        subject: notification.subject
      },
      target_agents: ['@gpt4']
    });

    const diagnosis = response.data.logs[0]?.result;

    console.log('✓ Diagnosis generated');

    // Notify via Discord
    if (DISCORD_WEBHOOK) {
      await axios.post(DISCORD_WEBHOOK, {
        content: `⚠️ **GitHub Actions Failed**\n\nWorkflow: ${workflowName}\n\n**Diagnosis:**\n${diagnosis?.substring(0, 500) || 'Check logs'}`
      });
    }

    return {
      success: true,
      workflow: workflowName,
      diagnosed: true,
      notified: !!DISCORD_WEBHOOK
    };
  }
}

module.exports = GitHubActionHandler;
