/**
 * CalOS Unified Feed
 * Simple WebSocket-based feed with chat integration
 */

// State
let ws = null;
let currentView = 'feed';
let messages = []; // All active messages
let archivedSessions = []; // Archived message sessions
let lastActivityTime = Date.now();
let archiveTimeout = 300000; // 5 minutes default

// DOM Elements
const connectionStatus = document.getElementById('connection-status');
const activityWall = document.getElementById('activity-wall');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messagesList = document.getElementById('messages-list');
const churchQuestion = document.getElementById('church-question');
const churchSendBtn = document.getElementById('church-send-btn');
const agentsGrid = document.getElementById('agents-grid');
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
const rssBtn = document.getElementById('rss-btn');

// Initialize
function init() {
  connectWebSocket();
  setupEventListeners();
  startArchiveTimer();
  loadSettings();
}

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  ws = new WebSocket(`${protocol}//${host}`);

  ws.onopen = () => {
    console.log('✓ Connected to CalOS');
    updateConnectionStatus(true);
  };

  ws.onclose = () => {
    console.log('✗ Disconnected from CalOS');
    updateConnectionStatus(false);

    // Reconnect after 3 seconds
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateConnectionStatus(false);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  };
}

// Handle incoming messages
function handleMessage(message) {
  lastActivityTime = Date.now();

  switch (message.type) {
    case 'connection':
      console.log('Connection established:', message.message);
      break;

    case 'chat':
      addMessageToFeed(message);
      break;

    case 'agent_response':
      addMessageToFeed(message);
      break;

    case 'church':
      handleChurchMessage(message);
      break;

    case 'system':
      if (shouldShowSystemEvents()) {
        addMessageToFeed(message);
      }
      break;

    case 'archive':
      archiveSession(message);
      break;

    case 'pong':
      // Keepalive response
      break;

    default:
      console.log('Unknown message type:', message.type);
  }
}

// Add message to feed
function addMessageToFeed(message) {
  messages.push(message);

  const post = document.createElement('div');
  post.className = `post ${message.type}`;

  const header = document.createElement('div');
  header.className = 'post-header';

  const type = document.createElement('span');
  type.className = 'post-type';
  type.textContent = message.type.replace('_', ' ');

  const time = document.createElement('span');
  time.className = 'post-time';
  time.textContent = formatTime(message.timestamp);

  header.appendChild(type);
  header.appendChild(time);

  const content = document.createElement('div');
  content.className = 'post-content';
  content.textContent = message.message || message.event || '';

  post.appendChild(header);
  post.appendChild(content);

  // Add agent badge if present
  if (message.agent || message.user) {
    const agent = document.createElement('span');
    agent.className = 'post-agent';
    agent.textContent = message.agent || message.user;
    post.appendChild(agent);
  }

  activityWall.appendChild(post);

  // Scroll to bottom
  activityWall.scrollTop = activityWall.scrollHeight;
}

// Handle church message
function handleChurchMessage(message) {
  if (currentView !== 'church') {
    switchView('church');
  }

  // Clear empty state
  agentsGrid.innerHTML = '';

  // Create agent cards for each agent
  (message.agents || []).forEach(agent => {
    const card = document.createElement('div');
    card.className = 'agent-card responding';
    card.dataset.agent = agent;

    const name = document.createElement('div');
    name.className = 'agent-name';
    name.textContent = agent;

    const status = document.createElement('div');
    status.className = 'agent-status';
    status.textContent = 'Thinking...';

    card.appendChild(name);
    card.appendChild(status);

    agentsGrid.appendChild(card);
  });
}

// Archive session
function archiveSession(message) {
  const session = {
    id: message.sessionId,
    messages: message.messages || [],
    timestamp: message.timestamp,
    preview: message.messages?.[0]?.message || 'No messages'
  };

  archivedSessions.push(session);
  renderArchivedSessions();

  // Clear active messages
  messages = [];
}

// Render archived sessions
function renderArchivedSessions() {
  if (archivedSessions.length === 0) {
    messagesList.innerHTML = '<div class="empty-state">No archived messages yet</div>';
    return;
  }

  messagesList.innerHTML = '';

  archivedSessions.reverse().forEach(session => {
    const item = document.createElement('div');
    item.className = 'message-item';
    item.dataset.sessionId = session.id;

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `Session ${session.id.substring(0, 8)}`;

    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = session.preview;

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = formatTime(session.timestamp);

    item.appendChild(title);
    item.appendChild(preview);
    item.appendChild(time);

    item.addEventListener('click', () => {
      // TODO: Load archived session
      console.log('Load session:', session.id);
    });

    messagesList.appendChild(item);
  });
}

// Send chat message
function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'chat',
      user: 'You',
      message,
      timestamp: new Date().toISOString()
    }));

    chatInput.value = '';
    lastActivityTime = Date.now();
  }
}

// Send church question
function sendChurchQuestion() {
  const question = churchQuestion.value.trim();
  if (!question) return;

  const agents = getSelectedAgents();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'church',
      message: question,
      agents,
      timestamp: new Date().toISOString()
    }));

    churchQuestion.value = '';
  }
}

// Get selected agents from settings
function getSelectedAgents() {
  const checkboxes = document.querySelectorAll('#default-agents input:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// Switch view
function switchView(viewName) {
  currentView = viewName;

  // Update nav buttons
  navBtns.forEach(btn => {
    if (btn.dataset.view === viewName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update views
  views.forEach(view => {
    if (view.id === `${viewName}-view`) {
      view.classList.remove('hidden');
    } else {
      view.classList.add('hidden');
    }
  });

  // Special handling for messages view
  if (viewName === 'messages') {
    renderArchivedSessions();
  }
}

// Update connection status
function updateConnectionStatus(connected) {
  const dot = connectionStatus.querySelector('.dot');
  const text = connectionStatus.querySelector('.text');

  if (connected) {
    dot.classList.remove('offline');
    dot.classList.add('online');
    text.textContent = 'Connected';
  } else {
    dot.classList.remove('online');
    dot.classList.add('offline');
    text.textContent = 'Disconnected';
  }
}

// Auto-archive timer
function startArchiveTimer() {
  setInterval(() => {
    const timeSinceActivity = Date.now() - lastActivityTime;

    if (timeSinceActivity > archiveTimeout && messages.length > 0) {
      console.log('Auto-archiving due to inactivity');

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'archive',
          sessionId: `session_${Date.now()}`,
          messages,
          timestamp: new Date().toISOString()
        }));
      }
    }
  }, 60000); // Check every minute
}

// Settings
function loadSettings() {
  const timeout = localStorage.getItem('archive-timeout');
  if (timeout) {
    archiveTimeout = parseInt(timeout);
    document.getElementById('archive-timeout').value = timeout;
  }

  // Load other settings
  const showSystem = localStorage.getItem('show-system-events');
  if (showSystem !== null) {
    document.getElementById('show-system-events').checked = showSystem === 'true';
  }

  const showHealth = localStorage.getItem('show-health-checks');
  if (showHealth !== null) {
    document.getElementById('show-health-checks').checked = showHealth === 'true';
  }
}

function saveSettings() {
  const timeout = document.getElementById('archive-timeout').value;
  archiveTimeout = parseInt(timeout);
  localStorage.setItem('archive-timeout', timeout);

  localStorage.setItem('show-system-events',
    document.getElementById('show-system-events').checked);

  localStorage.setItem('show-health-checks',
    document.getElementById('show-health-checks').checked);
}

function shouldShowSystemEvents() {
  return document.getElementById('show-system-events').checked;
}

// Event Listeners
function setupEventListeners() {
  // Send chat on Enter
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });

  sendBtn.addEventListener('click', sendChatMessage);

  // Church question
  churchSendBtn.addEventListener('click', sendChurchQuestion);

  // Navigation
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  // RSS button
  rssBtn.addEventListener('click', () => {
    window.open('/feed/rss', '_blank');
  });

  // Settings changes
  document.getElementById('archive-timeout').addEventListener('change', saveSettings);
  document.getElementById('show-system-events').addEventListener('change', saveSettings);
  document.getElementById('show-health-checks').addEventListener('change', saveSettings);

  // Keepalive ping every 30 seconds
  setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
}

// Utilities
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleString();
}

// Start the app
init();
