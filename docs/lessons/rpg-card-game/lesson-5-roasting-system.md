# Lesson 5: Roasting System - Vote on Code

**Track:** RPG & Card Game Development
**Lesson:** 5 of 10
**XP Reward:** 140
**Time:** 40 minutes
**Prerequisites:** Lesson 4 (Collection UI)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Build code voting interface
- ✅ Implement 1-10 rating system
- ✅ Add comment functionality
- ✅ Display voting results
- ✅ Prevent voting abuse

## Voting API

### Submit Vote

```javascript
POST /api/gaming/vote-code
{
  submissionId: 'sub_001',
  voterId: 'user456',
  score: 8,  // 1-10
  comment: 'Clean code, good structure!'
}

// Response
{
  success: true,
  voteId: 'vote_789',
  submissionId: 'sub_001',
  totalVotes: 7,
  averageScore: 7.8
}
```

### Get Submissions to Vote On

```javascript
GET /api/gaming/submissions/pending

// Response
{
  submissions: [
    {
      submissionId: 'sub_001',
      code: 'function add(a, b) { return a + b; }',
      language: 'javascript',
      description: 'Simple addition',
      submittedAt: '2025-01-15T10:30:00Z',
      votesReceived: 3,
      votesNeeded: 10
    }
  ]
}
```

## Lab: Voting Interface

```html
<!DOCTYPE html>
<html>
<head>
  <title>Vote on Code</title>
  <style>
    body {
      font-family: monospace;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #0f0f23;
      color: #e0e0e0;
    }

    .submission {
      background: #1a1a2e;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
    }

    pre {
      background: #0f0f23;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }

    .rating {
      display: flex;
      gap: 10px;
      margin: 20px 0;
    }

    .rating-btn {
      width: 50px;
      height: 50px;
      border: 2px solid #667eea;
      background: #2a2a3e;
      color: #e0e0e0;
      border-radius: 10px;
      cursor: pointer;
      font-size: 18px;
      font-weight: bold;
      transition: all 0.2s;
    }

    .rating-btn:hover {
      background: #667eea;
      transform: scale(1.1);
    }

    .rating-btn.selected {
      background: #667eea;
      border-color: #ffd700;
    }

    textarea {
      width: 100%;
      min-height: 100px;
      padding: 10px;
      background: #2a2a3e;
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
    }

    button:hover {
      background: #764ba2;
    }
  </style>
</head>
<body>
  <h1>🔥 Code Roasting - Vote</h1>

  <div id="submissions"></div>

  <script>
    let currentSubmission = null;
    let selectedScore = null;

    async function loadSubmissions() {
      try {
        const response = await fetch('http://localhost:5001/api/gaming/submissions/pending');
        const data = await response.json();

        if (data.success && data.submissions.length > 0) {
          currentSubmission = data.submissions[0];
          displaySubmission(currentSubmission);
        } else {
          document.getElementById('submissions').innerHTML = '<p>No submissions to vote on!</p>';
        }
      } catch (error) {
        console.error('Error:', error);
      }
    }

    function displaySubmission(submission) {
      const html = `
        <div class="submission">
          <h2>${submission.description}</h2>
          <p><strong>Language:</strong> ${submission.language}</p>
          <p><strong>Votes:</strong> ${submission.votesReceived}/${submission.votesNeeded}</p>
          <pre><code>${escapeHtml(submission.code)}</code></pre>

          <h3>Rate this code (1-10):</h3>
          <div class="rating" id="rating">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `
              <button class="rating-btn" onclick="selectRating(${n})">${n}</button>
            `).join('')}
          </div>

          <h3>Leave a comment:</h3>
          <textarea id="comment" placeholder="What do you think about this code?"></textarea>

          <button onclick="submitVote()" style="margin-top: 15px;">Submit Vote</button>
        </div>
      `;

      document.getElementById('submissions').innerHTML = html;
    }

    function selectRating(score) {
      selectedScore = score;
      document.querySelectorAll('.rating-btn').forEach((btn, i) => {
        btn.classList.toggle('selected', i + 1 === score);
      });
    }

    async function submitVote() {
      if (!selectedScore) {
        alert('Please select a rating');
        return;
      }

      const comment = document.getElementById('comment').value;
      const voterId = 'demo-user'; // Replace with actual user ID

      try {
        const response = await fetch('http://localhost:5001/api/gaming/vote-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            submissionId: currentSubmission.submissionId,
            voterId: voterId,
            score: selectedScore,
            comment: comment
          })
        });

        const data = await response.json();

        if (data.success) {
          alert(`Vote submitted! Average score: ${data.averageScore.toFixed(1)}/10`);
          loadSubmissions(); // Load next submission
        }
      } catch (error) {
        alert('Error: ' + error.message);
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    loadSubmissions();
  </script>
</body>
</html>
```

Save as `public/labs/vote-code.html`.

## Anti-Abuse Measures

1. **Minimum votes required:** Must vote on 5 submissions before submitting your own
2. **No self-voting:** Can't vote on your own submissions
3. **Outlier detection:** Extreme outlier votes (all 1s or all 10s) are flagged
4. **Rate limiting:** Max 20 votes per hour per user
5. **IP tracking:** Detect multiple accounts from same IP

## Summary

You've learned:
- ✅ How to build voting interfaces
- ✅ How to submit and display votes
- ✅ How to prevent abuse
- ✅ How voting determines rewards

## Next Lesson

**Lesson 6: RPG Player Progression**

Learn about levels, XP, and player stats integration.

## Quiz

1. What's the voting scale?
   - a) 1-5
   - b) 1-10
   - c) 0-100
   - d) Binary (good/bad)

2. How many votes needed for rewards?
   - a) 1
   - b) 5
   - c) 10
   - d) 20

3. Can you vote on your own code?
   - a) Yes
   - b) No
   - c) Only once
   - d) After 24 hours

**Answers:** 1-b, 2-c, 3-b

---

**🎴 Achievement Unlocked:** Code Critic (+140 XP)
