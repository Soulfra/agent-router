/**
 * Forum Monitor
 * Connects CALOS routing to existing PHPBB forum system
 * Cal monitors unanswered questions and auto-responds
 */

const axios = require('axios');

const FORUM_API = process.env.FORUM_API || 'http://localhost:7777';
const ROUTER_API = 'http://localhost:5001';
const BROADCAST_API = process.env.BROADCAST_API || 'http://localhost:7700';
const CHECK_INTERVAL = parseInt(process.env.FORUM_CHECK_INTERVAL) || 30000; // 30 seconds

class ForumMonitor {
    constructor() {
        this.running = false;
        this.stats = {
            totalChecks: 0,
            questionsAnswered: 0,
            errors: 0
        };

        console.log('🏛️  Forum Monitor initialized');
        console.log(`   Forum API: ${FORUM_API}`);
        console.log(`   Check interval: ${CHECK_INTERVAL}ms`);
    }

    async start() {
        if (this.running) {
            console.log('⚠️  Forum Monitor already running');
            return;
        }

        this.running = true;
        console.log('✓ Forum Monitor started');

        // Start monitoring loop
        this.monitorLoop();
    }

    async monitorLoop() {
        if (!this.running) return;

        try {
            await this.checkForumQuestions();
        } catch (error) {
            console.error('Forum Monitor error:', error.message);
            this.stats.errors++;
        }

        // Schedule next check
        setTimeout(() => this.monitorLoop(), CHECK_INTERVAL);
    }

    async checkForumQuestions() {
        this.stats.totalChecks++;

        try {
            // Get unanswered forum posts from PHPBB integration
            const response = await axios.get(`${FORUM_API}/api/unanswered`, {
                timeout: 5000
            });

            const unansweredPosts = response.data;

            if (!unansweredPosts || unansweredPosts.length === 0) {
                console.log(`[${new Date().toISOString()}] No unanswered posts`);
                return;
            }

            console.log(`📬 Found ${unansweredPosts.length} unanswered post(s)`);

            // Process each post
            for (const post of unansweredPosts) {
                await this.answerPost(post);
            }

        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                console.log('⚠️  PHPBB Forum service not running (expected if not started)');
            } else {
                throw error;
            }
        }
    }

    async answerPost(post) {
        try {
            console.log(`\n🤔 Processing: "${post.title || post.subject}"`);
            console.log(`   Topic ID: ${post.topic_id}`);
            console.log(`   Posted by: ${post.username || post.user_id}`);

            // Use CALOS routing engine to generate answer
            const routerResponse = await axios.post(`${ROUTER_API}/agent`, {
                input: `Forum Question: ${post.title || post.subject}\n\n${post.content || post.text}`,
                context: {
                    source: 'forum',
                    topic_id: post.topic_id,
                    user_id: post.user_id
                },
                // Let routing engine decide which agents to use
                // Or explicitly use best agents for Q&A:
                target_agents: ['@gpt4', '@claude']
            }, {
                timeout: 60000 // 60s timeout for AI response
            });

            const calAnswer = routerResponse.data.logs[0]?.result;

            if (!calAnswer) {
                console.log('❌ No answer generated');
                return;
            }

            console.log(`✓ Cal generated answer (${calAnswer.length} chars)`);

            // Post answer back to forum
            await axios.post(`${FORUM_API}/api/posts`, {
                topic_id: post.topic_id,
                forum_id: post.forum_id,
                content: calAnswer,
                user_id: 'cal_bot', // Cal's forum user ID
                is_cal_answer: true
            });

            console.log(`✓ Posted answer to forum`);

            // Broadcast to community (if broadcaster is running)
            try {
                await axios.post(`${BROADCAST_API}/broadcast`, {
                    sport: 'forum', // Reuse sport field for category
                    eventType: 'answer',
                    message: `🤖 Cal answered: "${post.title || post.subject}"`,
                    game: {
                        id: post.topic_id,
                        title: post.title || post.subject
                    }
                }, {
                    timeout: 3000
                });
                console.log(`✓ Broadcasted to community`);
            } catch (broadcastError) {
                // Broadcasting is optional
                if (broadcastError.code !== 'ECONNREFUSED') {
                    console.log('⚠️  Broadcast failed (broadcaster may not be running)');
                }
            }

            this.stats.questionsAnswered++;

        } catch (error) {
            console.error(`✗ Error answering post ${post.topic_id}:`, error.message);
            throw error;
        }
    }

    stop() {
        this.running = false;
        console.log('✗ Forum Monitor stopped');
    }

    getStats() {
        return {
            ...this.stats,
            running: this.running,
            uptime: process.uptime()
        };
    }
}

// Allow running standalone or as module
if (require.main === module) {
    const monitor = new ForumMonitor();
    monitor.start();

    // Graceful shutdown
    process.on('SIGTERM', () => {
        console.log('\nShutting down...');
        monitor.stop();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('\nShutting down...');
        monitor.stop();
        process.exit(0);
    });
}

module.exports = ForumMonitor;
