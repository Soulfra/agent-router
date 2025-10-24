# Cal's Sandbox Learning System

## Overview

Cal can now learn autonomously in a **safe, visible, and accountable** way with:

1. **Sandbox Mode** - Safe command execution
2. **WebSocket Broadcasting** - Live visual feedback
3. **Human-in-the-Loop** - Ask for help when stuck
4. **Attribution Tracking** - Skill vs luck accountability

---

## 1. Sandbox Mode (Safety)

**Problem:** Cal runs commands directly on your system
**Solution:** Sandbox mode blocks dangerous operations

### Safe Commands Whitelist
```javascript
const safeCommands = [
  'grep', 'cat', 'ls', 'head', 'tail', 'wc', 'find',
  'echo', 'pwd', 'which', 'type', 'file', 'stat',
  'jq', 'curl', 'npm run vos', 'lsof', 'ps', 'date'
];
```

### Dangerous Patterns Blocked
```javascript
const dangerousPatterns = [
  'rm ', 'mv ', 'cp ', 'chmod ', 'chown ',
  'sed -i', 'awk -i', '>>', '>',
  'sudo', 'su ', 'kill', 'shutdown'
];
```

### Usage
```javascript
const calLoop = new CalLearningLoop({
  db,
  userId: 'cal',
  sandboxMode: true  // Enable safety
});
```

---

## 2. WebSocket Broadcasting (Visibility)

**Problem:** No way to see what Cal is learning
**Solution:** Real-time events broadcast to connected clients

### Event Types

#### `cal:lesson_start`
```json
{
  "type": "cal:lesson_start",
  "userId": "cal",
  "lesson": {
    "number": 1,
    "title": "Introduction to grep",
    "exercises": 3
  }
}
```

#### `cal:exercise_start`
```json
{
  "type": "cal:exercise_start",
  "userId": "cal",
  "exercise": {
    "number": 1,
    "total": 3,
    "task": "Find all files containing 'llama2'",
    "command": "grep -r \"llama2\" lib/"
  }
}
```

#### `cal:exercise_complete` / `cal:exercise_failed`
```json
{
  "type": "cal:exercise_complete",
  "userId": "cal",
  "exercise": {
    "number": 1,
    "success": true
  }
}
```

#### `cal:exercise_blocked`
```json
{
  "type": "cal:exercise_blocked",
  "userId": "cal",
  "exercise": {
    "command": "rm -rf /",
    "reason": "unsafe in sandbox mode"
  }
}
```

#### `cal:lesson_complete`
```json
{
  "type": "cal:lesson_complete",
  "userId": "cal",
  "lesson": {
    "number": 1,
    "title": "Introduction to grep",
    "xp": 100,
    "tier": 53,
    "exercises": {
      "total": 3,
      "succeeded": 2
    },
    "attribution": {
      "type": "mixed",
      "confidence": 0.67,
      "description": "Learning in progress"
    }
  }
}
```

#### `cal:needs_help`
```json
{
  "type": "cal:needs_help",
  "userId": "cal",
  "reason": "Failed 3 consecutive exercises",
  "currentLesson": {
    "lesson_number": 5,
    "lesson_title": "Tool Combinations: The Power of Pipes"
  }
}
```

### Usage
```javascript
const calLoop = new CalLearningLoop({
  db,
  userId: 'cal',
  broadcast: (data) => {
    // Send to WebSocket clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }
});
```

---

## 3. Human-in-the-Loop (Interactive Feedback)

**Problem:** Cal can't ask for help when stuck
**Solution:** Detect failure patterns and emit help requests

### Requesting Help
```javascript
await calLoop.requestHelp('Failed lesson 5 exercise 3 times');
```

This will:
1. Set `needsHelp` flag
2. Increment `stats.helpRequests`
3. Broadcast `cal:needs_help` event
4. Emit `help_needed` event for listeners

### Example Handler
```javascript
calLoop.on('help_needed', async (data) => {
  console.log(`Cal needs help on: ${data.currentLesson.lesson_title}`);
  console.log(`Reason: ${data.reason}`);

  // Show notification to user
  // Let user provide hint or skip lesson
});
```

---

## 4. Attribution Tracking (Accountability)

**Problem:** Can't tell if Cal learned or got lucky
**Solution:** Poker-style variance tracking

### Attribution Types

#### **Skill** (90%+ success rate)
```json
{
  "type": "skill",
  "confidence": 1.0,
  "successCount": 3,
  "totalCount": 3,
  "description": "Consistent mastery"
}
```
**Meaning:** Cal has mastered this concept

#### **Mixed** (60-90% success rate)
```json
{
  "type": "mixed",
  "confidence": 0.67,
  "successCount": 2,
  "totalCount": 3,
  "description": "Learning in progress"
}
```
**Meaning:** Cal is still learning, not yet consistent

#### **Luck** (<60% success rate)
```json
{
  "type": "luck",
  "confidence": 0.67,
  "successCount": 1,
  "totalCount": 3,
  "description": "Needs more practice"
}
```
**Meaning:** Cal passed but likely got lucky, needs review

### Stored in Metadata
```javascript
{
  "automated": true,
  "loopIteration": 5,
  "exercisesCompleted": 3,
  "attribution": {
    "type": "skill",
    "confidence": 1.0,
    "successCount": 3,
    "totalCount": 3,
    "description": "Consistent mastery"
  },
  "sandboxMode": true
}
```

---

## Complete Example

```javascript
const { Pool } = require('pg');
const WebSocket = require('ws');
const CalLearningLoop = require('./lib/cal-learning-loop');

const db = new Pool({ database: 'calos' });
const wss = new WebSocket.Server({ port: 5001 });

// Broadcast function
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Create Cal with full features
const calLoop = new CalLearningLoop({
  db,
  userId: 'cal',
  sandboxMode: true,        // Safety
  broadcast: broadcast,     // Visibility
  interval: 60000          // 1 minute per lesson
});

// Listen for help requests
calLoop.on('help_needed', (data) => {
  console.log(`🆘 Cal needs help: ${data.reason}`);
  broadcast({
    type: 'notification',
    message: `Cal needs help on ${data.currentLesson.lesson_title}`,
    action: 'show_help_dialog'
  });
});

// Start learning
await calLoop.start();

console.log('✅ Cal is now learning safely and visibly!');
console.log('   - Sandbox mode protects your system');
console.log('   - WebSocket shows real-time progress');
console.log('   - Cal can ask for help when stuck');
console.log('   - Attribution tracks skill vs luck');
```

---

## Next Steps

### Build the Dashboard (`public/cal-dashboard.html`)
```html
<!DOCTYPE html>
<html>
<head>
  <title>Cal Learning Dashboard</title>
</head>
<body>
  <h1>Cal is Learning!</h1>
  <div id="current-lesson">No lesson active</div>
  <div id="exercise-log"></div>
  <div id="attribution"></div>
  <button id="help-cal" style="display:none">Help Cal</button>

  <script>
    const ws = new WebSocket('ws://localhost:5001');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch(data.type) {
        case 'cal:lesson_start':
          document.getElementById('current-lesson').textContent =
            `Lesson ${data.lesson.number}: ${data.lesson.title}`;
          break;

        case 'cal:exercise_start':
          const log = document.getElementById('exercise-log');
          log.innerHTML += `<div>Running: ${data.exercise.command}</div>`;
          break;

        case 'cal:exercise_complete':
          log.innerHTML += `<div>✅ Exercise ${data.exercise.number} passed</div>`;
          break;

        case 'cal:lesson_complete':
          const attr = data.lesson.attribution;
          document.getElementById('attribution').innerHTML =
            `Attribution: ${attr.type} (${(attr.confidence * 100).toFixed(0)}%)`;
          break;

        case 'cal:needs_help':
          document.getElementById('help-cal').style.display = 'block';
          alert(`Cal needs help: ${data.reason}`);
          break;
      }
    };
  </script>
</body>
</html>
```

---

## Benefits

✅ **Safe**: Sandbox blocks dangerous commands
✅ **Visible**: See every command Cal runs in real-time
✅ **Interactive**: Cal can ask you for help
✅ **Accountable**: Know if Cal truly learned (skill) or got lucky
✅ **Debuggable**: Full attribution trail for every lesson

This gives you the "poker" system you wanted - tracking whether success came from skill, luck, or different "players" (tools/agents)!
