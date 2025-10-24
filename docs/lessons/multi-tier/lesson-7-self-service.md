# Lesson 7: Self-Service Portal

**Track:** Multi-Tier System Architecture
**Lesson:** 7 of 7
**XP Reward:** 140
**Time:** 45 minutes
**Prerequisites:** All previous lessons (1-6)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Build self-service account portal
- ✅ Implement settings management
- ✅ Create billing interface
- ✅ Display usage analytics
- ✅ Handle account operations

## Self-Service Portal Structure

### Portal Features

1. **Account Management**
   - View profile
   - Update settings
   - Change password
   - Delete account

2. **Subscription Management**
   - View current plan
   - Upgrade/downgrade
   - Cancel subscription
   - View billing history

3. **Usage Dashboard**
   - API usage metrics
   - Cost breakdown
   - Rate limit status
   - Usage trends

4. **API Keys**
   - Generate keys
   - Rotate keys
   - View key usage
   - Revoke keys

5. **Projects**
   - Create projects
   - Switch projects
   - Manage members
   - Project settings

## Complete Portal Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>CalOS Portal</title>
  <style>
    body {
      font-family: monospace;
      background: #0f0f23;
      color: #e0e0e0;
      margin: 0;
      padding: 0;
    }

    .portal {
      display: grid;
      grid-template-columns: 250px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      background: #1a1a2e;
      padding: 20px;
    }

    .sidebar-item {
      padding: 12px;
      margin: 5px 0;
      border-radius: 5px;
      cursor: pointer;
    }

    .sidebar-item:hover,
    .sidebar-item.active {
      background: #667eea;
    }

    .content {
      padding: 40px;
    }

    .card {
      background: #1a1a2e;
      padding: 25px;
      border-radius: 10px;
      margin: 20px 0;
    }

    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }

    .stat-card {
      background: #2a2a3e;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }

    .stat-value {
      font-size: 36px;
      font-weight: bold;
      color: #64ffda;
    }

    button {
      padding: 12px 24px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-family: monospace;
    }

    button:hover {
      background: #764ba2;
    }

    .view {
      display: none;
    }

    .view.active {
      display: block;
    }
  </style>
</head>
<body>
  <div class="portal">
    <div class="sidebar">
      <h2>CalOS Portal</h2>
      <div class="sidebar-item active" onclick="showView('dashboard')">Dashboard</div>
      <div class="sidebar-item" onclick="showView('subscription')">Subscription</div>
      <div class="sidebar-item" onclick="showView('usage')">Usage</div>
      <div class="sidebar-item" onclick="showView('api-keys')">API Keys</div>
      <div class="sidebar-item" onclick="showView('projects')">Projects</div>
      <div class="sidebar-item" onclick="showView('settings')">Settings</div>
    </div>

    <div class="content">
      <!-- Dashboard View -->
      <div id="dashboard" class="view active">
        <h1>Dashboard</h1>

        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-value" id="apiCalls">0</div>
            <div>API Calls Today</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="currentTier">Free</div>
            <div>Current Tier</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="projects">0</div>
            <div>Projects</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="totalCost">$0.00</div>
            <div>Month Cost</div>
          </div>
        </div>

        <div class="card">
          <h3>Quick Actions</h3>
          <button onclick="showView('subscription')">Upgrade Plan</button>
          <button onclick="showView('api-keys')">Generate API Key</button>
          <button onclick="showView('projects')">New Project</button>
        </div>
      </div>

      <!-- Subscription View -->
      <div id="subscription" class="view">
        <h1>Subscription</h1>
        <div class="card">
          <h3>Current Plan: <span id="planName">Free</span></h3>
          <p>API Calls: <span id="planLimit">100/day</span></p>
          <button>Upgrade to Standard ($10/mo)</button>
          <button>Upgrade to Pro ($50/mo)</button>
        </div>
      </div>

      <!-- Usage View -->
      <div id="usage" class="view">
        <h1>Usage Analytics</h1>
        <div class="card">
          <h3>This Month</h3>
          <p>Requests: <span id="monthRequests">0</span></p>
          <p>Tokens: <span id="monthTokens">0</span></p>
          <p>Cost: $<span id="monthCost">0.00</span></p>
        </div>
      </div>

      <!-- Other views... -->
      <div id="api-keys" class="view">
        <h1>API Keys</h1>
        <button onclick="generateKey()">Generate New Key</button>
        <div id="keysList"></div>
      </div>

      <div id="projects" class="view">
        <h1>Projects</h1>
        <button onclick="createProject()">Create Project</button>
        <div id="projectsList"></div>
      </div>

      <div id="settings" class="view">
        <h1>Settings</h1>
        <div class="card">
          <h3>Account Settings</h3>
          <button>Change Password</button>
          <button style="background: #ff6b6b;" onclick="deleteAccount()">Delete Account</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    function showView(viewName) {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(viewName).classList.add('active');

      document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
      event.target.classList.add('active');
    }

    async function loadDashboard() {
      const userId = 'demo-user';

      try {
        const res = await fetch(`http://localhost:5001/api/usage/${userId}`);
        const data = await res.json();

        document.getElementById('apiCalls').textContent = data.today_calls;
        document.getElementById('currentTier').textContent = data.tier;
        document.getElementById('projects').textContent = data.project_count;
        document.getElementById('totalCost').textContent = `$${data.month_cost.toFixed(2)}`;
      } catch (error) {
        console.error('Error:', error);
      }
    }

    loadDashboard();
  </script>
</body>
</html>
```

Save as `public/portal/index.html`.

## Summary

**Congratulations! You've completed the Multi-Tier System track!**

You've learned:
- ✅ Multi-tier architecture
- ✅ BYOK implementation
- ✅ Usage tracking
- ✅ Billing systems
- ✅ Rate limiting
- ✅ Multi-project management
- ✅ Self-service portal

## Final Quiz

1. What's the most important feature of a self-service portal?
   - a) Good design
   - b) User control
   - c) Many features
   - d) Fast loading

2. Should users be able to delete their account?
   - a) Yes, always
   - b) No, never
   - c) After 30 days
   - d) Only admins

3. What makes a good portal?
   - a) Easy to use
   - b) Complete information
   - c) Self-service capabilities
   - d) All of the above

**Answers:** 1-b, 2-a, 3-d

---

**🎴 Achievement Unlocked:** Portal Builder (+140 XP)
**🏆 Track Complete:** Multi-Tier System Architecture (Total: 910 XP)

## What's Next?

- Build your own complete application
- Combine all tracks into one project
- Deploy to production
- Share with the community!
