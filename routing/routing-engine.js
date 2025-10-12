/**
 * Routing Engine
 * Smart routing logic that decides which agents should handle which messages
 * Based on: @mentions, intent classification, availability, load balancing
 */

const MessageParser = require('./message-parser');
const AgentRegistry = require('./agent-registry');

class RoutingEngine {
  constructor(agentRegistry = null) {
    this.parser = new MessageParser();
    this.registry = agentRegistry || new AgentRegistry();

    // Routing rules
    this.rules = this.initializeRules();
  }

  initializeRules() {
    return [
      // Explicit @mentions always take priority
      {
        name: 'explicit-mentions',
        priority: 100,
        condition: (msg) => msg.routing.explicit,
        handler: (msg) => this.handleExplicitMentions(msg)
      },

      // Workflow-related queries
      {
        name: 'workflow-routing',
        priority: 90,
        condition: (msg) => {
          const intent = this.parser.classifyIntent(msg.content);
          return intent === 'workflow';
        },
        handler: (msg) => ['@n8n-bridge', '@script-toolkit']
      },

      // Forum questions (use best agents for public Q&A)
      {
        name: 'forum-routing',
        priority: 85,
        condition: (msg) => msg.context?.source === 'forum',
        handler: (msg) => {
          // For forum questions, use GPT-4 and Claude for quality
          const agents = [];

          if (this.registry.isAvailable('@gpt4')) {
            agents.push('@gpt4');
          }

          if (this.registry.isAvailable('@claude')) {
            agents.push('@claude');
          }

          // Fallback to any available
          if (agents.length === 0) {
            agents.push('@ollama', '@gpt-3.5');
          }

          return agents;
        }
      },

      // Code-related queries (prefer Ollama for speed, fallback to GPT-4)
      {
        name: 'code-routing',
        priority: 80,
        condition: (msg) => {
          const intent = this.parser.classifyIntent(msg.content);
          return intent === 'code';
        },
        handler: (msg) => {
          const agents = [];

          // Try local Ollama first for speed
          if (this.registry.isAvailable('@ollama:codellama')) {
            agents.push('@ollama:codellama');
          }

          // Add cloud options
          if (this.registry.isAvailable('@gpt4')) {
            agents.push('@gpt4');
          } else if (this.registry.isAvailable('@claude')) {
            agents.push('@claude');
          }

          return agents.length > 0 ? agents : ['@gpt4'];
        }
      },

      // Creative tasks (prefer Claude)
      {
        name: 'creative-routing',
        priority: 80,
        condition: (msg) => {
          const intent = this.parser.classifyIntent(msg.content);
          return intent === 'creative';
        },
        handler: (msg) => {
          if (this.registry.isAvailable('@claude')) {
            return ['@claude'];
          }
          return ['@gpt4', '@ollama:mistral'];
        }
      },

      // Quick facts (prefer Ollama or GPT-3.5 for cost)
      {
        name: 'fact-routing',
        priority: 80,
        condition: (msg) => {
          const intent = this.parser.classifyIntent(msg.content);
          return intent === 'fact';
        },
        handler: (msg) => {
          if (this.registry.isAvailable('@ollama')) {
            return ['@ollama'];
          }
          return ['@gpt-3.5'];
        }
      },

      // High priority (use fastest available)
      {
        name: 'priority-routing',
        priority: 70,
        condition: (msg) => msg.priority === 'urgent' || msg.priority === 'high',
        handler: (msg) => {
          const available = this.registry.getAvailable();
          // Sort by latency (fast first)
          const sorted = available.sort((a, b) => {
            const latencyOrder = { fast: 0, medium: 1, slow: 2 };
            return latencyOrder[a.latency] - latencyOrder[b.latency];
          });

          return sorted.slice(0, 2).map(a => a.id);
        }
      },

      // Default routing (GPT-4 or Claude)
      {
        name: 'default-routing',
        priority: 0,
        condition: (msg) => true,
        handler: (msg) => {
          const intent = this.parser.classifyIntent(msg.content);
          return this.parser.suggestAgents(intent);
        }
      }
    ];
  }

  /**
   * Route a message to appropriate agents
   */
  route(input, context = {}) {
    // Parse message
    const message = this.parser.parse(input, context);

    // Apply routing rules (sorted by priority)
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    let targetAgents = [];

    for (const rule of sortedRules) {
      if (rule.condition(message)) {
        targetAgents = rule.handler(message);
        console.log(`✓ Applied rule: ${rule.name}`);
        break; // Use first matching rule
      }
    }

    // Handle delegation if agents are unavailable
    const finalAgents = this.handleDelegation(targetAgents, message);

    // Add CC and BCC
    const allAgents = {
      primary: finalAgents,
      cc: message.cc,
      bcc: message.bcc
    };

    // Return routing decision
    return {
      message,
      agents: allAgents,
      routing: {
        rule: sortedRules.find(r => r.condition(message))?.name,
        intent: this.parser.classifyIntent(message.content),
        delegated: finalAgents.some(a => !targetAgents.includes(a))
      }
    };
  }

  /**
   * Handle explicit @mentions
   */
  handleExplicitMentions(message) {
    const agents = [];

    // Add directly mentioned agents
    for (const mention of message.mentions) {
      agents.push(`@${mention}`);
    }

    // Add 'to' recipients
    for (const recipient of message.to) {
      if (!agents.includes(recipient)) {
        agents.push(recipient);
      }
    }

    return agents;
  }

  /**
   * Handle delegation for unavailable agents
   */
  handleDelegation(targetAgents, message) {
    const finalAgents = [];

    for (const agentId of targetAgents) {
      if (this.registry.isAvailable(agentId)) {
        finalAgents.push(agentId);
      } else {
        // Try to delegate
        const agent = this.registry.get(agentId);

        if (!agent) {
          console.warn(`⚠️  Agent ${agentId} not found in registry`);
          continue;
        }

        // Determine delegation reason
        let reason = 'busy';
        if (agent.status === 'offline') reason = 'offline';
        if (agent.outOfOffice) reason = 'out-of-office';

        const delegate = this.registry.getDelegation(agentId, reason);

        if (delegate) {
          console.log(`→ Delegating from ${agentId} to ${delegate} (${reason})`);
          finalAgents.push(delegate);

          // Add out of office message to context if applicable
          if (agent.outOfOffice) {
            message.context.outOfOfficeNotices = message.context.outOfOfficeNotices || [];
            message.context.outOfOfficeNotices.push(agent.outOfOffice.message);
          }
        } else {
          console.warn(`⚠️  No delegation available for ${agentId}`);
        }
      }
    }

    // If no agents available, use default
    if (finalAgents.length === 0) {
      console.log('⚠️  No agents available, using fallback');
      return ['@gpt4'];
    }

    return finalAgents;
  }

  /**
   * Add a custom routing rule
   */
  addRule(name, priority, condition, handler) {
    this.rules.push({
      name,
      priority,
      condition,
      handler
    });

    // Re-sort by priority
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove a routing rule
   */
  removeRule(name) {
    const index = this.rules.findIndex(r => r.name === name);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get routing suggestions without executing
   */
  suggest(input) {
    const message = this.parser.parse(input);
    const intent = this.parser.classifyIntent(message.content);
    const suggested = this.parser.suggestAgents(intent);

    return {
      message,
      intent,
      suggested,
      available: suggested.filter(a => this.registry.isAvailable(a))
    };
  }
}

module.exports = RoutingEngine;
