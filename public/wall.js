/**
 * CalOS Activity Wall - Feed Logic
 * Fetches and displays activity from Mission Control
 */

let posts = [];
let displayedPosts = 0;
const postsPerPage = 20;
let autoRefreshInterval = null;

// Stats
let stats = {
    logs: 0,
    errors: 0,
    health: 0,
    process: 0
};

/**
 * Initialize the wall
 */
function init() {
    console.log('🎮 Initializing CalOS Activity Wall');

    // Load initial feed
    loadFeed();

    // Auto-refresh every 30 seconds
    autoRefreshInterval = setInterval(loadFeed, 30000);

    // Update timestamps every 10 seconds
    setInterval(updateTimestamps, 10000);
}

/**
 * Load feed from Mission Control
 */
async function loadFeed() {
    try {
        updateStatus('loading', 'Loading...');

        // First try Mission Control feed (if running)
        const response = await fetch('http://localhost:3003/feed/json');

        if (!response.ok) {
            throw new Error('Mission Control not running');
        }

        const data = await response.json();

        // Convert JSON Feed format to our format
        posts = data.items.map(item => ({
            type: item.tags[0] || 'log',
            title: item.title,
            content: item.content_text,
            timestamp: item.date_published,
            id: item.id
        }));

        // Calculate stats
        updateStats();

        // Render posts
        displayedPosts = 0;
        renderPosts();

        updateStatus('connected', 'Connected');
        updateLastUpdate();

    } catch (error) {
        console.error('Failed to load feed:', error);
        updateStatus('disconnected', 'Mission Control offline');

        // Show empty state
        showEmptyState();
    }
}

/**
 * Render posts to the feed
 */
function renderPosts() {
    const container = document.getElementById('feedContainer');

    // Clear if first render
    if (displayedPosts === 0) {
        container.innerHTML = '';
    }

    // Render next batch
    const end = Math.min(displayedPosts + postsPerPage, posts.length);

    for (let i = displayedPosts; i < end; i++) {
        const post = posts[i];
        const postEl = createPostElement(post);
        container.appendChild(postEl);
    }

    displayedPosts = end;

    // Show/hide load more button
    const loadMoreBtn = document.querySelector('.load-more-btn');
    if (displayedPosts < posts.length) {
        loadMoreBtn.style.display = 'block';
    } else {
        loadMoreBtn.style.display = 'none';
    }
}

/**
 * Create a post element
 * @param {object} post - Post data
 * @returns {HTMLElement} - Post element
 */
function createPostElement(post) {
    const div = document.createElement('div');
    div.className = `post ${post.type}`;

    const icon = getPostIcon(post.type);
    const typeName = getTypeName(post.type);

    div.innerHTML = `
        <div class="post-header">
            <div class="post-meta">
                <span class="post-icon">${icon}</span>
                <span class="post-type">${typeName}</span>
            </div>
            <span class="post-timestamp" data-timestamp="${post.timestamp}">
                ${formatTimestamp(post.timestamp)}
            </span>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
    `;

    return div;
}

/**
 * Get icon for post type
 * @param {string} type - Post type
 * @returns {string} - Icon emoji
 */
function getPostIcon(type) {
    const icons = {
        log: '📝',
        error: '❌',
        health: '💚',
        process: '⚙️',
        status_change: '🔄',
        error_detected: '🚨'
    };
    return icons[type] || '📌';
}

/**
 * Get human-readable type name
 * @param {string} type - Post type
 * @returns {string} - Type name
 */
function getTypeName(type) {
    const names = {
        log: 'System Log',
        error: 'Error',
        health: 'Health Check',
        process: 'Process Event',
        status_change: 'Status Change',
        error_detected: 'Error Detected'
    };
    return names[type] || type;
}

/**
 * Format timestamp
 * @param {string} timestamp - ISO timestamp
 * @returns {string} - Formatted string
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) {
        return 'Just now';
    }

    // Less than 1 hour
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    // Show date
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Update all timestamps
 */
function updateTimestamps() {
    const timestamps = document.querySelectorAll('.post-timestamp');
    timestamps.forEach(el => {
        const timestamp = el.dataset.timestamp;
        el.textContent = formatTimestamp(timestamp);
    });
}

/**
 * Update status indicator
 * @param {string} status - Status ('connected', 'disconnected', 'loading')
 * @param {string} text - Status text
 */
function updateStatus(status, text) {
    const dot = document.getElementById('statusDot');
    const textEl = document.getElementById('statusText');

    dot.className = 'status-dot';
    if (status === 'connected') {
        dot.classList.add('connected');
    }

    textEl.textContent = text;
}

/**
 * Update last update time
 */
function updateLastUpdate() {
    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

/**
 * Update stats
 */
function updateStats() {
    stats = {
        logs: 0,
        errors: 0,
        health: 0,
        process: 0
    };

    posts.forEach(post => {
        switch (post.type) {
            case 'log':
                stats.logs++;
                break;
            case 'error':
            case 'error_detected':
                stats.errors++;
                break;
            case 'health':
            case 'health_check':
                stats.health++;
                break;
            case 'process':
            case 'process_event':
                stats.process++;
                break;
        }
    });

    // Update UI
    document.getElementById('totalPosts').textContent = posts.length;
    document.getElementById('postCount').textContent = `${posts.length} posts`;
    document.getElementById('logCount').textContent = stats.logs;
    document.getElementById('errorCount').textContent = stats.errors;
    document.getElementById('healthCount').textContent = stats.health;
}

/**
 * Show empty state
 */
function showEmptyState() {
    const container = document.getElementById('feedContainer');
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <h3>No Activity Yet</h3>
            <p>Mission Control needs to be running to see activity.</p>
            <p>Start Mission Control: <code>node monitoring/mission-control.js</code></p>
        </div>
    `;
}

/**
 * Refresh feed (manual)
 */
async function refreshFeed() {
    const btn = document.querySelector('.refresh-btn');
    btn.classList.add('spinning');

    await loadFeed();

    setTimeout(() => {
        btn.classList.remove('spinning');
    }, 500);
}

/**
 * Load more posts
 */
function loadMore() {
    renderPosts();
}

/**
 * Escape HTML
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
});
