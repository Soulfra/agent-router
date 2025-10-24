/**
 * Dialogue Tree Generator
 *
 * Generates MMORPG-style quest dialogue trees with pre-determined paths.
 * NOT for player-to-player chat - this is for quest NPC dialogue.
 *
 * Features:
 * - Branching dialogue options
 * - Quest prerequisites and conditions
 * - Export to Mermaid, DOT, and JSON formats
 * - Support for quest-style interactions (like FFXIV)
 */

class DialogueTreeGenerator {
  constructor() {
    this.dialogueNodes = new Map();
    this.rootNodeId = null;
  }

  /**
   * Create a new dialogue node
   */
  createNode(id, config) {
    const node = {
      id,
      npc_text: config.npc_text || '',
      npc_name: config.npc_name || 'NPC',
      emotion: config.emotion || 'neutral',
      options: config.options || [],
      conditions: config.conditions || null,
      actions: config.actions || [],
      quest_progress: config.quest_progress || null,
      isEnd: config.isEnd || false
    };

    this.dialogueNodes.set(id, node);

    if (!this.rootNodeId && config.isRoot) {
      this.rootNodeId = id;
    }

    return node;
  }

  /**
   * Add dialogue option (player choice)
   */
  addOption(nodeId, option) {
    const node = this.dialogueNodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    node.options.push({
      text: option.text,
      next_node: option.next_node,
      requires: option.requires || null,
      emotion: option.emotion || 'neutral'
    });
  }

  /**
   * Build quest dialogue tree from description
   */
  buildQuestTree(questConfig) {
    const { quest_name, npc_name, quest_type, difficulty } = questConfig;

    // Root node - quest introduction
    this.createNode('start', {
      isRoot: true,
      npc_name,
      npc_text: `Greetings, traveler. I have a ${difficulty} quest for you: ${quest_name}.`,
      emotion: 'friendly',
      options: [
        { text: 'Tell me more about this quest.', next_node: 'details' },
        { text: 'What rewards do I get?', next_node: 'rewards' },
        { text: 'Not interested.', next_node: 'decline' }
      ]
    });

    // Quest details node
    this.createNode('details', {
      npc_name,
      npc_text: this.generateQuestDetails(quest_type),
      emotion: 'serious',
      options: [
        { text: 'I accept this quest!', next_node: 'accept' },
        { text: 'What are the rewards?', next_node: 'rewards' },
        { text: 'Let me think about it.', next_node: 'end' }
      ]
    });

    // Rewards node
    this.createNode('rewards', {
      npc_name,
      npc_text: this.generateRewardText(difficulty),
      emotion: 'friendly',
      options: [
        { text: 'That sounds good! I accept.', next_node: 'accept' },
        { text: 'Tell me about the quest again.', next_node: 'details' },
        { text: 'Not worth it.', next_node: 'decline' }
      ]
    });

    // Accept node
    this.createNode('accept', {
      npc_name,
      npc_text: 'Excellent! May the gods guide your path.',
      emotion: 'happy',
      actions: ['quest_accepted', 'add_quest_log'],
      quest_progress: { status: 'accepted', stage: 0 },
      isEnd: true
    });

    // Decline node
    this.createNode('decline', {
      npc_name,
      npc_text: 'Perhaps another time, then.',
      emotion: 'disappointed',
      actions: ['quest_declined'],
      isEnd: true
    });

    // Neutral end
    this.createNode('end', {
      npc_name,
      npc_text: 'Return when you are ready.',
      emotion: 'neutral',
      isEnd: true
    });

    return this;
  }

  /**
   * Generate quest details based on type
   */
  generateQuestDetails(quest_type) {
    const details = {
      fetch: 'I need you to retrieve an ancient artifact from the Dark Forest. Beware of the creatures that lurk there.',
      kill: 'A pack of wolves has been terrorizing the village. Slay 10 of them to restore peace.',
      escort: 'My caravan needs protection on the road to Silverpeak. Will you guard us?',
      gather: 'I need 5 Moon Herbs from the northern valley. They only bloom at night.',
      explore: 'Explore the ruins of the Old Temple and report what you find.'
    };

    return details[quest_type] || 'Complete this task for me.';
  }

  /**
   * Generate reward text based on difficulty
   */
  generateRewardText(difficulty) {
    const rewards = {
      easy: 'I can offer you 50 gold and a healing potion.',
      medium: 'You will be rewarded with 200 gold, a rare weapon, and my gratitude.',
      hard: 'Complete this and you shall receive 500 gold, legendary armor, and the respect of the kingdom.',
      legendary: 'The reward is beyond measure - 1000 gold, an artifact of immense power, and eternal glory.'
    };

    return rewards[difficulty] || 'You will be fairly compensated.';
  }

  /**
   * Export to Mermaid format
   */
  toMermaid() {
    let mermaid = 'graph TD\n';

    for (const [nodeId, node] of this.dialogueNodes) {
      // Node definition
      const label = `${node.npc_name}: ${node.npc_text.substring(0, 50)}...`;
      const shape = node.isEnd ? '([' : '["';
      const endShape = node.isEnd ? '])' : '"]';

      mermaid += `    ${nodeId}${shape}${label}${endShape}\n`;

      // Add emotion styling
      if (node.emotion === 'happy') {
        mermaid += `    ${nodeId}:::happy\n`;
      } else if (node.emotion === 'disappointed') {
        mermaid += `    ${nodeId}:::sad\n`;
      }

      // Options (edges)
      for (const option of node.options) {
        const optionLabel = option.text.substring(0, 40);
        mermaid += `    ${nodeId} -->|"${optionLabel}"| ${option.next_node}\n`;
      }
    }

    // Add styles
    mermaid += '    classDef happy fill:#d4f4dd,stroke:#27ae60,stroke-width:2px\n';
    mermaid += '    classDef sad fill:#fde2e4,stroke:#e74c3c,stroke-width:2px\n';

    return mermaid;
  }

  /**
   * Export to GraphViz DOT format
   */
  toDot() {
    let dot = 'digraph QuestDialogue {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box, style=rounded];\n\n';

    for (const [nodeId, node] of this.dialogueNodes) {
      // Node styling
      const color = node.isEnd ? 'lightblue' : 'white';
      const label = `${node.npc_name}\\n${node.npc_text.substring(0, 60)}...`;

      dot += `  ${nodeId} [label="${label}", fillcolor="${color}", style=filled];\n`;

      // Edges
      for (const option of node.options) {
        const optionLabel = option.text.substring(0, 40);
        dot += `  ${nodeId} -> ${option.next_node} [label="${optionLabel}"];\n`;
      }
    }

    dot += '}\n';
    return dot;
  }

  /**
   * Export to JSON
   */
  toJSON() {
    return {
      root_node: this.rootNodeId,
      nodes: Array.from(this.dialogueNodes.values()),
      metadata: {
        total_nodes: this.dialogueNodes.size,
        end_nodes: Array.from(this.dialogueNodes.values()).filter(n => n.isEnd).length
      }
    };
  }

  /**
   * Generate advanced dialogue tree with AI
   */
  async generateWithAI(ollamaClient, config) {
    const prompt = `Generate a ${config.quest_type} quest dialogue tree for an MMORPG.

Quest Name: ${config.quest_name}
NPC Name: ${config.npc_name}
Difficulty: ${config.difficulty}
Setting: ${config.setting || 'fantasy medieval'}

Create a branching dialogue tree with:
1. Initial greeting and quest introduction
2. Multiple player response options
3. Quest details branch
4. Rewards branch
5. Accept/decline paths
6. At least 6-8 total nodes

Return JSON with structure:
{
  "nodes": [
    {
      "id": "start",
      "npc_text": "...",
      "npc_name": "...",
      "emotion": "friendly",
      "options": [
        { "text": "player option", "next_node": "node_id" }
      ],
      "isEnd": false
    }
  ]
}`;

    try {
      const response = await ollamaClient.generate({
        model: config.model || 'soulfra-model',
        prompt,
        format: 'json'
      });

      const data = JSON.parse(response.response);

      // Import generated nodes
      for (const node of data.nodes) {
        this.createNode(node.id, node);
      }

      return this;
    } catch (error) {
      console.error('[DialogueTreeGenerator] AI generation failed:', error);
      // Fall back to template
      return this.buildQuestTree(config);
    }
  }
}

module.exports = DialogueTreeGenerator;
