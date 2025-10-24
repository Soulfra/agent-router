# Lesson 2: Fetch API Basics

**Track:** RPG & Card Game Development
**Lesson:** 2 of 10
**XP Reward:** 110
**Time:** 30 minutes
**Prerequisites:** Lesson 1 (Card Game Intro)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Master the Fetch API for HTTP requests
- ✅ Handle async/await patterns
- ✅ Parse JSON responses
- ✅ Handle errors gracefully
- ✅ Call Gaming API endpoints

## The Fetch API

`fetch()` is a built-in browser API for making HTTP requests. No libraries needed!

### Basic Syntax

```javascript
// Simple GET request
fetch('https://api.example.com/data')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error(error));
```

### With async/await (Better!)

```javascript
async function getData() {
  try {
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

## HTTP Methods

### GET - Retrieve Data

```javascript
async function getPlayerCards(userId) {
  const response = await fetch(`http://localhost:5001/api/gaming/cards/${userId}`);
  const data = await response.json();
  return data;
}
```

### POST - Send Data

```javascript
async function submitCode(userId, code) {
  const response = await fetch('http://localhost:5001/api/gaming/submit-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: userId,
      code: code,
      language: 'javascript'
    })
  });

  const data = await response.json();
  return data;
}
```

### PUT - Update Data

```javascript
async function updateProfile(userId, updates) {
  const response = await fetch(`http://localhost:5001/api/gaming/profile/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });

  const data = await response.json();
  return data;
}
```

### DELETE - Remove Data

```javascript
async function deleteSubmission(submissionId) {
  const response = await fetch(`http://localhost:5001/api/gaming/submissions/${submissionId}`, {
    method: 'DELETE'
  });

  const data = await response.json();
  return data;
}
```

## Error Handling

### Check Response Status

```javascript
async function fetchWithErrorHandling(url) {
  try {
    const response = await fetch(url);

    // Check if response is OK (status 200-299)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    // Network error or JSON parse error
    console.error('Fetch error:', error);
    throw error;
  }
}
```

### Handle Different Error Types

```javascript
async function robustFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);

    // Check status codes
    if (response.status === 404) {
      throw new Error('Resource not found');
    }

    if (response.status === 401) {
      throw new Error('Unauthorized - please login');
    }

    if (response.status === 500) {
      throw new Error('Server error - try again later');
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };

  } catch (error) {
    // Network errors (server down, no internet, etc.)
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      return { success: false, error: 'Cannot connect to server' };
    }

    // Other errors
    return { success: false, error: error.message };
  }
}
```

## Gaming API Examples

### Example 1: Get Player Stats

```javascript
async function getPlayerStats(userId) {
  try {
    const response = await fetch(`http://localhost:5001/api/gaming/player/${userId}`);

    if (!response.ok) {
      throw new Error('Failed to get player stats');
    }

    const data = await response.json();

    console.log('Player Stats:');
    console.log(`  Level: ${data.level}`);
    console.log(`  XP: ${data.xp}`);
    console.log(`  Cards: ${data.totalCards}`);
    console.log(`  Win Rate: ${data.winRate}%`);

    return data;

  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Usage
getPlayerStats('user123');
```

### Example 2: Submit Code for Roasting

```javascript
async function submitCodeForRoasting(userId, code, description) {
  try {
    const response = await fetch('http://localhost:5001/api/gaming/submit-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: userId,
        code: code,
        language: 'javascript',
        description: description
      })
    });

    if (!response.ok) {
      throw new Error('Failed to submit code');
    }

    const data = await response.json();

    console.log('Code submitted!');
    console.log(`  Submission ID: ${data.submissionId}`);
    console.log(`  Status: ${data.status}`);
    console.log('  Waiting for votes...');

    return data;

  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Usage
const code = `
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
`;

submitCodeForRoasting('user123', code, 'Recursive Fibonacci');
```

### Example 3: Vote on Code

```javascript
async function voteOnCode(submissionId, voterId, score, comment) {
  try {
    const response = await fetch('http://localhost:5001/api/gaming/vote-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        submissionId: submissionId,
        voterId: voterId,
        score: score,
        comment: comment
      })
    });

    if (!response.ok) {
      throw new Error('Failed to vote');
    }

    const data = await response.json();

    console.log('Vote submitted!');
    console.log(`  Your score: ${data.yourScore}/10`);
    console.log(`  Total votes: ${data.totalVotes}`);
    console.log(`  Average: ${data.averageScore}`);

    return data;

  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}

// Usage
voteOnCode('sub_001', 'voter456', 8, 'Clean code, good structure!');
```

## Lab: Build a Code Submission Form

```html
<!DOCTYPE html>
<html>
<head>
  <title>Submit Code</title>
  <style>
    body {
      font-family: monospace;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    textarea {
      width: 100%;
      height: 300px;
      padding: 10px;
      background: #1a1a2e;
      color: #e0e0e0;
      border: 1px solid #667eea;
      border-radius: 5px;
      font-family: monospace;
      font-size: 14px;
    }

    input[type="text"] {
      width: 100%;
      padding: 10px;
      background: #1a1a2e;
      color: #e0e0e0;
      border: 1px solid #667eea;
      border-radius: 5px;
      font-family: monospace;
    }

    button {
      padding: 12px 24px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
      margin: 10px 5px 10px 0;
    }

    button:hover {
      background: #764ba2;
    }

    button:disabled {
      background: #444;
      cursor: not-allowed;
    }

    .result {
      background: #1a1a2e;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
      border-left: 3px solid #667eea;
    }

    .success {
      border-left-color: #00ff00;
    }

    .error {
      border-left-color: #ff6b6b;
    }

    label {
      display: block;
      margin: 15px 0 5px 0;
      color: #a0a0ff;
    }
  </style>
</head>
<body>
  <h1>🎮 Submit Code for Roasting</h1>

  <form id="submitForm">
    <label for="userId">Your User ID:</label>
    <input type="text" id="userId" value="demo-user" required>

    <label for="description">Description:</label>
    <input type="text" id="description" placeholder="e.g., Fibonacci calculator" required>

    <label for="code">Your Code:</label>
    <textarea id="code" placeholder="Paste your code here..." required></textarea>

    <button type="submit" id="submitBtn">Submit for Roasting</button>
    <button type="button" onclick="clearForm()">Clear</button>
  </form>

  <div id="result"></div>

  <script>
    const form = document.getElementById('submitForm');
    const resultDiv = document.getElementById('result');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const userId = document.getElementById('userId').value;
      const description = document.getElementById('description').value;
      const code = document.getElementById('code').value;

      if (!code.trim()) {
        showResult('error', 'Please enter some code');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        const response = await fetch('http://localhost:5001/api/gaming/submit-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: userId,
            code: code,
            language: 'javascript',
            description: description
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
          showResult('success', `
            <h3>✅ Code Submitted!</h3>
            <p><strong>Submission ID:</strong> ${data.submissionId}</p>
            <p><strong>Status:</strong> ${data.status}</p>
            <p>Your code is now waiting for votes. Come back later to check results!</p>
          `);

          // Clear form
          document.getElementById('code').value = '';
          document.getElementById('description').value = '';
        } else {
          showResult('error', `Submission failed: ${data.error}`);
        }

      } catch (error) {
        showResult('error', `Error: ${error.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit for Roasting';
      }
    });

    function showResult(type, message) {
      resultDiv.className = `result ${type}`;
      resultDiv.innerHTML = message;
      resultDiv.style.display = 'block';
    }

    function clearForm() {
      document.getElementById('code').value = '';
      document.getElementById('description').value = '';
      resultDiv.style.display = 'none';
    }
  </script>
</body>
</html>
```

Save as `public/labs/submit-code.html`.

## Best Practices

### 1. Always Use try/catch

```javascript
// Good
async function getData() {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}
```

### 2. Check Response Status

```javascript
// Good
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}
```

### 3. Provide User Feedback

```javascript
// Show loading state
button.textContent = 'Loading...';
button.disabled = true;

// Make request
const data = await fetch(...);

// Re-enable button
button.disabled = false;
button.textContent = 'Submit';
```

## Summary

You've learned:
- ✅ How to use fetch() for HTTP requests
- ✅ How to handle async/await patterns
- ✅ How to parse JSON responses
- ✅ How to handle errors properly
- ✅ How to call Gaming API endpoints

## Next Lesson

**Lesson 3: Opening Card Packs**

Learn how to open card packs and display the cards you get!

## Quiz

1. What does `await` do?
   - a) Waits for a Promise to resolve
   - b) Sleeps for 1 second
   - c) Makes code faster
   - d) Nothing

2. How do you send JSON data in a POST request?
   - a) In the URL
   - b) In the body as a string
   - c) JSON.stringify() in the body
   - d) In the headers

3. What status code means "OK"?
   - a) 100
   - b) 200
   - c) 300
   - d) 400

**Answers:** 1-a, 2-c, 3-b

---

**🎴 Achievement Unlocked:** Fetch Master (+110 XP)
