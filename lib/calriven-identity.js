#!/usr/bin/env node

/**
 * KNOW YOUR NAME IDENTITY SYSTEM
 * 
 * Simple but effective identity verification system inspired by KnowYourMeme.
 * Core principle: "If you have a reachable email, you're good enough"
 * 
 * Features:
 * - Email-based identity verification (primary method)
 * - Domain ownership verification (for territory claims)
 * - Cross-platform identity linking (GitHub, Google, TikTok)
 * - Reputation building through platform interactions
 * - Anonymous/pseudonymous identity options
 * - Identity federation across all SoulFra services
 */

const crypto = require('crypto');
const dns = require('dns').promises;
const EventEmitter = require('events');
const nodemailer = require('nodemailer');
const WebSocket = require('ws');

class KnowYourNameIdentitySystem extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Email verification settings
            email: {
                verification: {
                    enabled: true,
                    codeLength: 6,
                    expiryMinutes: 15,
                    maxAttempts: 5,
                    rateLimitMinutes: 1
                },
                smtp: {
                    host: process.env.SMTP_HOST || 'smtp.gmail.com',
                    port: 587,
                    secure: false,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                },
                templates: {
                    verification: {
                        subject: '🎮 Verify Your SoulFra Identity',
                        template: 'verification-email.html'
                    },
                    welcome: {
                        subject: '🌟 Welcome to the SoulFra Universe!',
                        template: 'welcome-email.html'
                    }
                }
            },
            
            // Domain ownership verification
            domainVerification: {
                methods: ['dns_txt', 'html_meta', 'html_file'],
                txtRecordPrefix: 'soulfra-verify=',
                htmlMetaTag: '<meta name="soulfra-verification" content="{code}">',
                htmlFileName: 'soulfra-verify.html',
                verificationTimeout: 300000, // 5 minutes
                retryAttempts: 3
            },
            
            // Identity reputation system
            reputation: {
                initialScore: 10,
                maxScore: 100,
                verificationBonuses: {
                    email: 5,
                    domain: 15,
                    github: 10,
                    google: 8,
                    tiktok: 5
                },
                activityBonuses: {
                    characterUpload: 2,
                    worldEntry: 1,
                    communityVote: 3,
                    domainPurchase: 10
                },
                decayRate: 0.1 // per day of inactivity
            },
            
            // Cross-platform linking
            platformLinking: {
                github: {
                    enabled: true,
                    apiBase: 'https://api.github.com',
                    requiredScopes: ['user:email', 'public_repo']
                },
                google: {
                    enabled: true,
                    apiBase: 'https://www.googleapis.com',
                    requiredScopes: ['profile', 'email']
                },
                tiktok: {
                    enabled: true,
                    apiBase: 'https://open-api.tiktok.com',
                    requiredScopes: ['user.info.basic', 'user.info.profile']
                }
            },
            
            // Anonymous identity options
            anonymity: {
                allowAnonymous: true,
                pseudonymGeneration: true,
                privacyLevels: ['public', 'pseudonymous', 'anonymous'],
                anonymousFeatures: ['world_entry', 'character_creation', 'voting'],
                restrictedFeatures: ['domain_ownership', 'premium_features', 'marketplace']
            },
            
            // Integration settings
            integration: {
                characterSystem: 'http://localhost:8086',
                domainSystem: 'http://localhost:3000',
                chromaticEngine: 'http://localhost:3005',
                qrPortalSystem: 'http://localhost:8085',
                websocketPort: 8087
            },
            
            ...config
        };
        
        // Core identity database
        this.identities = new Map();
        this.verificationSessions = new Map();
        this.domainVerifications = new Map();
        this.platformLinks = new Map();
        this.reputationHistory = new Map();
        
        // Email verification system
        this.emailTransporter = null;
        this.verificationCodes = new Map();
        
        // WebSocket for real-time updates
        this.wss = null;
        this.activeConnections = new Set();
        
        // System metrics
        this.metrics = {
            identitiesCreated: 0,
            emailVerifications: 0,
            domainVerifications: 0,
            platformLinksCreated: 0,
            reputationPointsAwarded: 0,
            anonymousIdentities: 0
        };
        
        console.log('🆔 Know Your Name Identity System initializing...');
    }
    
    /**
     * Initialize the identity system
     */
    async initialize() {
        console.log('🚀 Starting Know Your Name Identity System...');
        
        try {
            // Initialize email system
            await this.initializeEmailSystem();
            
            // Initialize WebSocket server
            await this.initializeWebSocketServer();
            
            // Start background tasks
            this.startBackgroundTasks();
            
            console.log('✅ Know Your Name Identity System ready');
            this.emit('system_ready');
            
        } catch (error) {
            console.error('❌ Failed to initialize Identity System:', error);
            throw error;
        }
    }
    
    /**
     * Create new identity with email verification
     */
    async createIdentity(emailOrData, options = {}) {
        try {
            const identityData = typeof emailOrData === 'string' 
                ? { email: emailOrData } 
                : emailOrData;
            
            const identity = {
                id: crypto.randomUUID(),
                email: identityData.email,
                displayName: identityData.displayName || this.generateDisplayName(identityData.email),
                privacyLevel: options.privacyLevel || 'public',
                
                // Verification status
                verification: {
                    email: { verified: false, verifiedAt: null },
                    domain: { verified: false, domains: [], verifiedAt: null },
                    platforms: {}
                },
                
                // Reputation system
                reputation: {
                    score: this.config.reputation.initialScore,
                    level: 1,
                    badges: [],
                    history: []
                },
                
                // Linked accounts
                linkedPlatforms: {},
                
                // Identity metadata
                created: new Date(),
                lastActive: new Date(),
                preferences: {
                    notifications: true,
                    publicProfile: options.privacyLevel !== 'anonymous',
                    showReputation: options.privacyLevel === 'public'
                },
                
                // Activity tracking
                activity: {
                    charactersCreated: 0,
                    worldsEntered: 0,
                    domainsOwned: 0,
                    votescast: 0,
                    lastLogin: new Date()
                }
            };
            
            // Handle anonymous identities
            if (options.anonymous || !identityData.email) {
                identity.displayName = this.generatePseudonym();
                identity.privacyLevel = 'anonymous';
                identity.email = null;
                this.metrics.anonymousIdentities++;
            } else {
                // Start email verification process
                await this.initiateEmailVerification(identity);
            }
            
            this.identities.set(identity.id, identity);
            this.metrics.identitiesCreated++;
            
            // Broadcast identity creation
            this.broadcastUpdate({
                type: 'identity_created',
                identityId: identity.id,
                displayName: identity.displayName,
                anonymous: !identity.email
            });
            
            console.log(`🆔 Created identity: ${identity.displayName} (${identity.id})`);
            
            return {
                success: true,
                identity: this.sanitizeIdentityForResponse(identity),
                verificationRequired: !!identity.email
            };
            
        } catch (error) {
            console.error('Identity creation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Initiate email verification
     */
    async initiateEmailVerification(identity) {
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const sessionId = crypto.randomUUID();
        
        const session = {
            id: sessionId,
            identityId: identity.id,
            email: identity.email,
            code: verificationCode,
            attempts: 0,
            created: new Date(),
            expires: new Date(Date.now() + (this.config.email.verification.expiryMinutes * 60000))
        };
        
        this.verificationSessions.set(sessionId, session);
        
        // Send verification email
        await this.sendVerificationEmail(identity.email, verificationCode, identity.displayName);
        
        console.log(`📧 Sent verification email to ${identity.email}`);
        
        return sessionId;
    }
    
    /**
     * Verify email with code
     */
    async verifyEmail(identityId, verificationCode) {
        try {
            const identity = this.identities.get(identityId);
            if (!identity) {
                throw new Error('Identity not found');
            }
            
            // Find verification session
            const session = Array.from(this.verificationSessions.values())
                .find(s => s.identityId === identityId);
            
            if (!session) {
                throw new Error('No verification session found');
            }
            
            if (session.expires < new Date()) {
                throw new Error('Verification code expired');
            }
            
            if (session.attempts >= this.config.email.verification.maxAttempts) {
                throw new Error('Too many verification attempts');
            }
            
            session.attempts++;
            
            if (session.code !== verificationCode) {
                throw new Error('Invalid verification code');
            }
            
            // Mark email as verified
            identity.verification.email.verified = true;
            identity.verification.email.verifiedAt = new Date();
            
            // Award reputation bonus
            this.awardReputationPoints(identity, this.config.reputation.verificationBonuses.email, 'email_verification');
            
            // Clean up verification session
            this.verificationSessions.delete(session.id);
            
            // Send welcome email
            await this.sendWelcomeEmail(identity);
            
            this.metrics.emailVerifications++;
            
            console.log(`✅ Email verified for identity ${identity.displayName}`);
            
            return {
                success: true,
                identity: this.sanitizeIdentityForResponse(identity)
            };
            
        } catch (error) {
            console.error('Email verification error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Initiate domain ownership verification
     */
    async initiateDomainVerification(identityId, domain) {
        try {
            const identity = this.identities.get(identityId);
            if (!identity) {
                throw new Error('Identity not found');
            }
            
            if (!identity.verification.email.verified) {
                throw new Error('Email must be verified before domain verification');
            }
            
            // Generate verification code
            const verificationCode = crypto.randomBytes(16).toString('hex');
            
            const domainVerification = {
                id: crypto.randomUUID(),
                identityId,
                domain: domain.toLowerCase(),
                code: verificationCode,
                methods: {
                    dns_txt: {
                        record: `${this.config.domainVerification.txtRecordPrefix}${verificationCode}`,
                        status: 'pending'
                    },
                    html_meta: {
                        tag: this.config.domainVerification.htmlMetaTag.replace('{code}', verificationCode),
                        status: 'pending'
                    },
                    html_file: {
                        filename: this.config.domainVerification.htmlFileName,
                        content: verificationCode,
                        status: 'pending'
                    }
                },
                created: new Date(),
                expires: new Date(Date.now() + this.config.domainVerification.verificationTimeout)
            };
            
            this.domainVerifications.set(domainVerification.id, domainVerification);
            
            console.log(`🌐 Started domain verification for ${domain}`);
            
            return {
                success: true,
                verificationId: domainVerification.id,
                domain,
                methods: domainVerification.methods,
                expires: domainVerification.expires
            };
            
        } catch (error) {
            console.error('Domain verification initiation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Check domain ownership verification
     */
    async checkDomainVerification(verificationId) {
        try {
            const verification = this.domainVerifications.get(verificationId);
            if (!verification) {
                throw new Error('Verification not found');
            }
            
            if (verification.expires < new Date()) {
                throw new Error('Verification expired');
            }
            
            const domain = verification.domain;
            let verified = false;
            let method = null;
            
            // Check DNS TXT record
            try {
                const txtRecords = await dns.resolveTxt(domain);
                const flatRecords = txtRecords.flat();
                
                if (flatRecords.some(record => record === verification.methods.dns_txt.record)) {
                    verified = true;
                    method = 'dns_txt';
                    verification.methods.dns_txt.status = 'verified';
                }
            } catch (error) {
                verification.methods.dns_txt.status = 'failed';
            }
            
            // Check HTML meta tag (would require HTTP request in real implementation)
            if (!verified) {
                // Placeholder for HTTP verification
                // This would make an HTTP request to https://domain/ and check for meta tag
            }
            
            // Check HTML file (would require HTTP request in real implementation)
            if (!verified) {
                // Placeholder for file verification
                // This would make an HTTP request to https://domain/soulfra-verify.html
            }
            
            if (verified) {
                // Update identity with verified domain
                const identity = this.identities.get(verification.identityId);
                if (!identity.verification.domain.domains) {
                    identity.verification.domain.domains = [];
                }
                identity.verification.domain.domains.push({
                    domain,
                    verifiedAt: new Date(),
                    method
                });
                identity.verification.domain.verified = true;
                identity.verification.domain.verifiedAt = new Date();
                
                // Award reputation bonus
                this.awardReputationPoints(identity, this.config.reputation.verificationBonuses.domain, 'domain_verification');
                
                // Clean up verification
                this.domainVerifications.delete(verificationId);
                
                this.metrics.domainVerifications++;
                
                console.log(`✅ Domain verified: ${domain} for identity ${identity.displayName}`);
                
                return {
                    success: true,
                    verified: true,
                    domain,
                    method,
                    identity: this.sanitizeIdentityForResponse(identity)
                };
            }
            
            return {
                success: true,
                verified: false,
                domain,
                methods: verification.methods
            };
            
        } catch (error) {
            console.error('Domain verification check error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Link external platform account
     */
    async linkPlatformAccount(identityId, platform, platformData) {
        try {
            const identity = this.identities.get(identityId);
            if (!identity) {
                throw new Error('Identity not found');
            }
            
            // Validate platform
            if (!this.config.platformLinking[platform]?.enabled) {
                throw new Error(`Platform ${platform} not supported`);
            }
            
            // Store platform link
            identity.linkedPlatforms[platform] = {
                id: platformData.id,
                username: platformData.username,
                displayName: platformData.displayName,
                email: platformData.email,
                linkedAt: new Date(),
                lastSync: new Date()
            };
            
            // Update verification status
            identity.verification.platforms[platform] = {
                verified: true,
                verifiedAt: new Date()
            };
            
            // Award reputation bonus
            const bonus = this.config.reputation.verificationBonuses[platform] || 5;
            this.awardReputationPoints(identity, bonus, `${platform}_link`);
            
            this.metrics.platformLinksCreated++;
            
            console.log(`🔗 Linked ${platform} account for identity ${identity.displayName}`);
            
            return {
                success: true,
                platform,
                identity: this.sanitizeIdentityForResponse(identity)
            };
            
        } catch (error) {
            console.error('Platform linking error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Award reputation points
     */
    awardReputationPoints(identity, points, reason) {
        const oldScore = identity.reputation.score;
        identity.reputation.score = Math.min(
            identity.reputation.score + points,
            this.config.reputation.maxScore
        );
        
        // Track reputation history
        const reputationEntry = {
            points,
            reason,
            timestamp: new Date(),
            oldScore,
            newScore: identity.reputation.score
        };
        
        identity.reputation.history.push(reputationEntry);
        
        // Update reputation level
        const newLevel = Math.floor(identity.reputation.score / 10) + 1;
        if (newLevel > identity.reputation.level) {
            identity.reputation.level = newLevel;
            
            // Award level-up badge
            identity.reputation.badges.push({
                type: 'level_up',
                level: newLevel,
                earnedAt: new Date()
            });
        }
        
        this.metrics.reputationPointsAwarded += points;
        
        // Broadcast reputation update
        this.broadcastUpdate({
            type: 'reputation_update',
            identityId: identity.id,
            points,
            reason,
            newScore: identity.reputation.score,
            newLevel: identity.reputation.level
        });
        
        console.log(`⭐ Awarded ${points} reputation points to ${identity.displayName} for ${reason}`);
    }
    
    /**
     * Get identity by ID
     */
    getIdentity(identityId) {
        const identity = this.identities.get(identityId);
        return identity ? this.sanitizeIdentityForResponse(identity) : null;
    }
    
    /**
     * Find identity by email
     */
    findIdentityByEmail(email) {
        const identity = Array.from(this.identities.values())
            .find(id => id.email === email);
        return identity ? this.sanitizeIdentityForResponse(identity) : null;
    }
    
    /**
     * Update identity activity
     */
    updateActivity(identityId, activityType, data = {}) {
        const identity = this.identities.get(identityId);
        if (!identity) return;
        
        identity.lastActive = new Date();
        identity.activity.lastLogin = new Date();
        
        // Award activity-based reputation
        const bonus = this.config.reputation.activityBonuses[activityType];
        if (bonus) {
            this.awardReputationPoints(identity, bonus, activityType);
        }
        
        // Update specific activity counters
        switch (activityType) {
            case 'characterUpload':
                identity.activity.charactersCreated++;
                break;
            case 'worldEntry':
                identity.activity.worldsEntered++;
                break;
            case 'domainPurchase':
                identity.activity.domainsOwned++;
                break;
            case 'communityVote':
                identity.activity.votescast++;
                break;
        }
    }
    
    /**
     * Get system statistics
     */
    getSystemStats() {
        return {
            metrics: this.metrics,
            database: {
                totalIdentities: this.identities.size,
                verifiedEmails: Array.from(this.identities.values())
                    .filter(id => id.verification.email.verified).length,
                verifiedDomains: Array.from(this.identities.values())
                    .filter(id => id.verification.domain.verified).length,
                activeVerificationSessions: this.verificationSessions.size,
                pendingDomainVerifications: this.domainVerifications.size
            },
            reputation: {
                averageScore: this.calculateAverageReputation(),
                topUsers: this.getTopReputationUsers(5)
            }
        };
    }
    
    // Utility methods
    generateDisplayName(email) {
        if (!email) return this.generatePseudonym();
        const username = email.split('@')[0];
        return username.charAt(0).toUpperCase() + username.slice(1);
    }
    
    generatePseudonym() {
        const adjectives = ['Swift', 'Mystic', 'Brave', 'Clever', 'Noble', 'Wise', 'Bold', 'Keen'];
        const nouns = ['Wanderer', 'Scholar', 'Guardian', 'Seeker', 'Composer', 'Explorer', 'Dreamer', 'Builder'];
        
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const number = Math.floor(Math.random() * 1000);
        
        return `${adjective}${noun}${number}`;
    }
    
    sanitizeIdentityForResponse(identity) {
        const sanitized = { ...identity };
        
        // Remove sensitive information based on privacy level
        if (identity.privacyLevel === 'anonymous') {
            delete sanitized.email;
            delete sanitized.linkedPlatforms;
        } else if (identity.privacyLevel === 'pseudonymous') {
            delete sanitized.email;
            // Keep linked platforms but remove emails
            Object.keys(sanitized.linkedPlatforms || {}).forEach(platform => {
                delete sanitized.linkedPlatforms[platform].email;
            });
        }
        
        return sanitized;
    }
    
    async initializeEmailSystem() {
        if (this.config.email.smtp.auth.user) {
            this.emailTransporter = nodemailer.createTransporter(this.config.email.smtp);
            console.log('📧 Email system initialized');
        } else {
            console.warn('⚠️  No SMTP credentials provided, email verification disabled');
        }
    }
    
    async sendVerificationEmail(email, code, displayName) {
        if (!this.emailTransporter) return;
        
        const mailOptions = {
            from: this.config.email.smtp.auth.user,
            to: email,
            subject: this.config.email.templates.verification.subject,
            html: `
                <h2>🎮 Welcome to SoulFra!</h2>
                <p>Hi ${displayName},</p>
                <p>Your verification code is: <strong style="font-size: 24px; color: #4ECDC4;">${code}</strong></p>
                <p>This code expires in ${this.config.email.verification.expiryMinutes} minutes.</p>
                <p>Welcome to the musical multiverse! 🌟</p>
            `
        };
        
        await this.emailTransporter.sendMail(mailOptions);
    }
    
    async sendWelcomeEmail(identity) {
        if (!this.emailTransporter || !identity.email) return;
        
        const mailOptions = {
            from: this.config.email.smtp.auth.user,
            to: identity.email,
            subject: this.config.email.templates.welcome.subject,
            html: `
                <h2>🌟 Welcome to the SoulFra Universe!</h2>
                <p>Hi ${identity.displayName},</p>
                <p>Your identity has been verified! You now have access to:</p>
                <ul>
                    <li>🎮 Musical world creation and exploration</li>
                    <li>🎨 Character design and progression</li>
                    <li>🌐 Domain territory ownership</li>
                    <li>🗳️ Community governance voting</li>
                    <li>🎵 Chromatic game engine</li>
                </ul>
                <p>Ready to explore? Start by creating your first character!</p>
            `
        };
        
        await this.emailTransporter.sendMail(mailOptions);
    }
    
    async initializeWebSocketServer() {
        this.wss = new WebSocket.Server({ port: this.config.integration.websocketPort });
        
        this.wss.on('connection', (ws) => {
            console.log('🔌 Identity system client connected');
            this.activeConnections.add(ws);
            
            ws.on('close', () => {
                this.activeConnections.delete(ws);
            });
        });
        
        console.log(`🌐 Identity WebSocket server running on port ${this.config.integration.websocketPort}`);
    }
    
    startBackgroundTasks() {
        // Clean up expired verification sessions every minute
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 60000);
        
        // Apply reputation decay daily
        setInterval(() => {
            this.applyReputationDecay();
        }, 24 * 60 * 60 * 1000);
        
        console.log('🔄 Background tasks started');
    }
    
    cleanupExpiredSessions() {
        const now = new Date();
        let cleanedCount = 0;
        
        for (const [id, session] of this.verificationSessions.entries()) {
            if (session.expires < now) {
                this.verificationSessions.delete(id);
                cleanedCount++;
            }
        }
        
        for (const [id, verification] of this.domainVerifications.entries()) {
            if (verification.expires < now) {
                this.domainVerifications.delete(id);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
        }
    }
    
    applyReputationDecay() {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        for (const identity of this.identities.values()) {
            if (identity.lastActive < oneDayAgo) {
                const decay = Math.floor(identity.reputation.score * this.config.reputation.decayRate);
                if (decay > 0) {
                    identity.reputation.score = Math.max(0, identity.reputation.score - decay);
                    identity.reputation.history.push({
                        points: -decay,
                        reason: 'inactivity_decay',
                        timestamp: now,
                        oldScore: identity.reputation.score + decay,
                        newScore: identity.reputation.score
                    });
                }
            }
        }
    }
    
    calculateAverageReputation() {
        const scores = Array.from(this.identities.values())
            .map(id => id.reputation.score);
        return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    }
    
    getTopReputationUsers(limit = 10) {
        return Array.from(this.identities.values())
            .sort((a, b) => b.reputation.score - a.reputation.score)
            .slice(0, limit)
            .map(id => ({
                displayName: id.displayName,
                score: id.reputation.score,
                level: id.reputation.level,
                badges: id.reputation.badges.length
            }));
    }
    
    broadcastUpdate(message) {
        const messageStr = JSON.stringify(message);
        this.activeConnections.forEach(ws => {
            if (ws.readyState === 1) { // WebSocket.OPEN
                ws.send(messageStr);
            }
        });
    }
}

module.exports = KnowYourNameIdentitySystem;