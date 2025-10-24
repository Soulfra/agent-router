-- Create 9 new lessons for debugging-mastery path
-- Teaching Cal OSS tools layer by layer
-- Path ID: 95518df4-58ab-498f-ba4b-8a9344de3c76

-- Lesson 1: Introduction to grep
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  1,
  'Introduction to grep',
  'intro-to-grep',
  'Learn to find patterns in code using grep - the fundamental search tool for debugging',
  ARRAY[
    'Understand what grep does and why it''s essential',
    'Search for simple patterns in single files',
    'Search recursively across directories',
    'Count matches and show context lines'
  ],
  'challenge',
  '{
    "challenge_type": "tool_practice",
    "tools_used": ["grep"],
    "skills_learned": ["pattern-matching", "debugging", "code-search"],
    "exercises": [
      {
        "task": "Find all files containing ''llama2'' in lib/ directory",
        "command": "grep -r \"llama2\" lib/",
        "expected_output": "List of files with line numbers"
      },
      {
        "task": "Count how many times ''axios'' appears in router.js",
        "command": "grep -o \"axios\" router.js | wc -l",
        "explanation": "-o shows only matching part, wc -l counts lines"
      },
      {
        "task": "Show 3 lines of context around each match",
        "command": "grep -C 3 \"exports\" lib/learning-engine.js",
        "explanation": "-C 3 shows 3 lines before and after match"
      }
    ],
    "completion_criteria": "Successfully complete all 3 grep exercises"
  }'::jsonb,
  15,
  100,
  'published'
);

-- Lesson 2: Advanced grep with regex
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  2,
  'Advanced grep: Regular Expressions',
  'advanced-grep-regex',
  'Master regex patterns to find complex code patterns and potential bugs',
  ARRAY[
    'Use regex metacharacters (., *, +, ?, [], {})',
    'Find function definitions and variable declarations',
    'Locate potential error patterns',
    'Combine grep with other tools using pipes'
  ],
  'challenge',
  '{
    "challenge_type": "tool_practice",
    "tools_used": ["grep"],
    "skills_learned": ["regex", "pattern-matching", "debugging"],
    "exercises": [
      {
        "task": "Find all function definitions in JavaScript files",
        "command": "grep -rE \"(function\\s+\\w+|const\\s+\\w+\\s*=.*function)\" lib/",
        "explanation": "-E enables extended regex, \\s matches whitespace, \\w matches word characters"
      },
      {
        "task": "Find console.log statements (candidates for removal)",
        "command": "grep -rn \"console\\.(log|error|warn)\" lib/ routes/",
        "explanation": "-n shows line numbers, (log|error|warn) matches any of these"
      },
      {
        "task": "Find TODO comments",
        "command": "grep -rn \"//.*TODO\" .",
        "explanation": "Useful for tracking unfinished work"
      }
    ],
    "completion_criteria": "Successfully complete all 3 regex grep exercises"
  }'::jsonb,
  20,
  150,
  'published'
);

-- Lesson 3: sed - Stream Editor Basics
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  3,
  'sed Basics: Find and Replace',
  'sed-find-replace',
  'Learn sed to make systematic code changes - essential for refactoring and bug fixes',
  ARRAY[
    'Understand sed syntax and substitution pattern',
    'Replace text in single files',
    'Use sed with grep to batch-fix issues',
    'Preview changes before applying them'
  ],
  'challenge',
  '{
    "challenge_type": "tool_practice",
    "tools_used": ["sed", "grep"],
    "skills_learned": ["refactoring", "batch-operations", "shell-scripting"],
    "exercises": [
      {
        "task": "Replace first occurrence of a word in a file",
        "command": "sed \"s/oldtext/newtext/\" file.txt",
        "explanation": "s/ means substitute, only affects first match per line"
      },
      {
        "task": "Replace ALL occurrences (global flag)",
        "command": "sed \"s/oldtext/newtext/g\" file.txt",
        "explanation": "g flag makes it global (all matches per line)"
      },
      {
        "task": "Replace in-place (modify the file)",
        "command": "sed -i '''' \"s/llama2/calos-model/g\" config.js",
        "explanation": "-i'''' edits file in-place (Mac OS syntax)"
      },
      {
        "task": "Preview changes before applying",
        "command": "grep -l \"llama2\" lib/*.js | xargs sed \"s/llama2/calos-model/g\"",
        "explanation": "grep -l lists files, xargs passes them to sed, no -i so just preview"
      }
    ],
    "completion_criteria": "Successfully complete all 4 sed exercises"
  }'::jsonb,
  25,
  200,
  'published'
);

-- Lesson 4: jq - JSON Query Tool
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  4,
  'jq: Parse JSON Like a Pro',
  'jq-json-parsing',
  'Master jq to parse API responses, logs, and config files - crucial for modern debugging',
  ARRAY[
    'Extract specific fields from JSON',
    'Filter arrays and objects',
    'Parse API response data',
    'Debug JSON configuration issues'
  ],
  'challenge',
  '{
    "challenge_type": "tool_practice",
    "tools_used": ["jq", "curl"],
    "skills_learned": ["json-parsing", "api-debugging", "data-extraction"],
    "exercises": [
      {
        "task": "Pretty-print JSON from a file",
        "command": "cat logs/debug.json | jq .",
        "explanation": ". means ''the whole object'', formatted nicely"
      },
      {
        "task": "Extract a specific field",
        "command": "cat package.json | jq ''.name''",
        "explanation": ".name gets the name field"
      },
      {
        "task": "Get array length",
        "command": "cat logs/ollama-models.json | jq ''.models | length''",
        "explanation": "| length counts items in array"
      },
      {
        "task": "Parse API response",
        "command": "curl -s http://localhost:5001/health | jq ''.status''",
        "explanation": "curl -s (silent) pipes to jq to extract status field"
      },
      {
        "task": "Filter array elements",
        "command": "cat logs/lessons.json | jq ''[.[] | select(.xp_reward > 100)]''",
        "explanation": "select() filters items matching condition"
      }
    ],
    "completion_criteria": "Successfully complete all 5 jq exercises"
  }'::jsonb,
  30,
  250,
  'published'
);

-- Lesson 5: Combining Tools with Pipes
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  5,
  'Tool Combinations: The Power of Pipes',
  'tool-combinations-pipes',
  'Learn to chain tools together - this is where debugging becomes powerful and efficient',
  ARRAY[
    'Understand Unix pipe philosophy',
    'Chain grep, sed, jq, and other tools',
    'Build complex debugging workflows',
    'Create reusable diagnostic one-liners'
  ],
  'challenge',
  '{
    "challenge_type": "tool_practice",
    "tools_used": ["grep", "sed", "jq", "awk", "wc"],
    "skills_learned": ["shell-scripting", "workflow-automation", "debugging"],
    "exercises": [
      {
        "task": "Find and count specific patterns",
        "command": "grep -r ''require'' lib/ | wc -l",
        "explanation": "Pipe grep output to wc to count matches"
      },
      {
        "task": "Find files with pattern, replace in-place",
        "command": "grep -l ''llama2'' lib/*.js | xargs sed -i '''' ''s/llama2/calos-model/g''",
        "explanation": "grep finds files, xargs passes to sed for batch replacement"
      },
      {
        "task": "Parse JSON, extract field, count unique values",
        "command": "cat logs/debug.json | jq ''.fixes[].file'' | sort | uniq | wc -l",
        "explanation": "Chain: extract field -> sort -> unique -> count"
      },
      {
        "task": "Find errors in logs, extract timestamps",
        "command": "grep ERROR logs/router.log | awk ''{print $1, $2}'' | sort | uniq -c",
        "explanation": "grep finds errors, awk extracts columns, sort+uniq-c counts occurrences"
      },
      {
        "task": "API call -> parse -> filter -> format",
        "command": "curl -s http://localhost:5001/agents | jq ''[.agents[] | select(.status == \"online\") | .name]''",
        "explanation": "Full pipeline: fetch data, parse JSON, filter, extract names"
      }
    ],
    "completion_criteria": "Successfully complete all 5 pipe combination exercises"
  }'::jsonb,
  35,
  300,
  'published'
);

-- Lesson 6: vos - Verify Operating System
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  6,
  'vos: 3-Step System Verification',
  'vos-system-verification',
  'Master CalOS''s custom verification tool - the foundation of system health monitoring',
  ARRAY[
    'Run 3-step verification (backend, offline, system)',
    'Interpret vos output and diagnose issues',
    'Use vos in automated monitoring',
    'Understand how vos checks server, Ollama, and platform'
  ],
  'challenge',
  '{
    "challenge_type": "tool_practice",
    "tools_used": ["vos", "curl", "lsof"],
    "skills_learned": ["system-monitoring", "health-checks", "diagnostics"],
    "exercises": [
      {
        "task": "Run basic vos check",
        "command": "npm run vos",
        "explanation": "3-step verification: backend (server+Ollama), offline (PWA), system (platform)"
      },
      {
        "task": "Check if server is running manually",
        "command": "lsof -i :5001",
        "explanation": "lsof lists open files/ports, shows if port 5001 is in use"
      },
      {
        "task": "Test server health endpoint",
        "command": "curl -s http://localhost:5001/health | jq",
        "explanation": "Direct health check, parse response with jq"
      },
      {
        "task": "Check Ollama models",
        "command": "curl -s http://localhost:11434/api/tags | jq ''.models | length''",
        "explanation": "Count how many Ollama models are loaded"
      },
      {
        "task": "Full diagnostic workflow",
        "command": "npm run vos && echo ''System OK'' || echo ''System has issues''",
        "explanation": "&& runs if success, || runs if failure"
      }
    ],
    "completion_criteria": "Successfully complete all 5 vos exercises"
  }'::jsonb,
  20,
  200,
  'published'
);

-- Lesson 8: Time Differential Tracking
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  8,
  'Time Differential Tracking',
  'time-differential-tracking',
  'Learn to measure execution time and track performance - essential for optimization and XP calculation',
  ARRAY[
    'Capture timestamps before and after operations',
    'Calculate time differentials in milliseconds',
    'Use time data for XP rewards',
    'Log timing information for analysis'
  ],
  'challenge',
  '{
    "challenge_type": "tool_practice",
    "tools_used": ["date", "bash"],
    "skills_learned": ["performance-tracking", "benchmarking", "shell-scripting"],
    "exercises": [
      {
        "task": "Get current timestamp in milliseconds",
        "command": "date +%s%3N",
        "explanation": "%s = seconds since epoch, %3N = milliseconds (3 digits)"
      },
      {
        "task": "Measure command execution time",
        "command": "START=$(date +%s%3N); ls -la; END=$(date +%s%3N); echo \"Time: $((END - START))ms\"",
        "explanation": "Capture start/end, subtract to get duration"
      },
      {
        "task": "Calculate XP from time differential",
        "command": "TIME_MS=1500; XP=$((TIME_MS / 100)); echo \"Earned: $XP XP\"",
        "explanation": "XP formula: time_ms / 100 (1.5s = 15 XP)"
      },
      {
        "task": "Save timing data to JSON",
        "command": "TIME_MS=2345; echo \"{\\\"time_ms\\\": $TIME_MS, \\\"xp\\\": $((TIME_MS/100))}\" > logs/timing.json",
        "explanation": "Store structured timing data for analysis"
      },
      {
        "task": "Benchmark a script",
        "command": "START=$(date +%s%3N); npm run vos > /dev/null 2>&1; END=$(date +%s%3N); echo \"vos took $((END - START))ms\"",
        "explanation": "Measure how long vos takes to run"
      }
    ],
    "completion_criteria": "Successfully complete all 5 timing exercises"
  }'::jsonb,
  25,
  250,
  'published'
);

-- Lesson 9: Writing Diagnostic Scripts
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  9,
  'Writing Diagnostic Scripts',
  'writing-diagnostic-scripts',
  'Combine everything you''ve learned to write automated diagnostic scripts like master-diagnostic.sh',
  ARRAY[
    'Structure a multi-step diagnostic script',
    'Use colors and emojis for readable output',
    'Log results to files for analysis',
    'Handle errors gracefully'
  ],
  'challenge',
  '{
    "challenge_type": "script_writing",
    "tools_used": ["bash", "grep", "sed", "jq", "vos", "curl"],
    "skills_learned": ["shell-scripting", "automation", "diagnostics", "error-handling"],
    "exercises": [
      {
        "task": "Create a simple health check script",
        "template": "#!/bin/bash\\nset -e\\necho ''Checking server...''\\ncurl -s http://localhost:5001/health | jq ''.status''\\necho ''Done''",
        "explanation": "set -e exits on error, curl tests server, jq parses response"
      },
      {
        "task": "Add color output",
        "template": "GREEN=''\\033[0;32m''\\nNC=''\\033[0m''\\necho -e \"${GREEN}✅ Success${NC}\"",
        "explanation": "ANSI color codes make output readable"
      },
      {
        "task": "Log to file with timestamp",
        "template": "TIMESTAMP=$(date +%s)\\nLOG_FILE=\"logs/diagnostic-$TIMESTAMP.log\"\\necho ''Results'' > $LOG_FILE",
        "explanation": "Unique log file per run"
      },
      {
        "task": "Handle errors",
        "template": "if curl -s http://localhost:5001/health > /dev/null 2>&1; then\\n  echo ''✅ Server OK''\\nelse\\n  echo ''❌ Server down''\\nfi",
        "explanation": "if/else handles success and failure cases"
      },
      {
        "task": "Multi-step script with time tracking",
        "template": "See master-diagnostic.sh for full example",
        "explanation": "Study master-diagnostic.sh - it combines all these techniques"
      }
    ],
    "completion_criteria": "Write a working diagnostic script that checks server, Ollama, and database"
  }'::jsonb,
  40,
  350,
  'published'
);

-- Lesson 10: Guardian-Level Automation
INSERT INTO lessons (
  path_id,
  lesson_number,
  lesson_title,
  lesson_slug,
  description,
  learning_objectives,
  content_type,
  content_data,
  estimated_minutes,
  xp_reward,
  status
) VALUES (
  '95518df4-58ab-498f-ba4b-8a9344de3c76',
  10,
  'Guardian-Level Automation',
  'guardian-automation',
  'Final challenge: Understand how Guardian Agent uses tools autonomously to monitor and heal systems',
  ARRAY[
    'Understand the ReACT pattern (Reasoning + Acting)',
    'See how Guardian chains tool calls',
    'Learn autonomous monitoring and healing',
    'Graduate to building your own automation agents'
  ],
  'challenge',
  '{
    "challenge_type": "conceptual",
    "tools_used": ["all_previous_tools"],
    "skills_learned": ["autonomous-agents", "ReACT-pattern", "system-healing", "meta-learning"],
    "exercises": [
      {
        "task": "Study Guardian Agent tool definitions",
        "file": "lib/ollama-tools.js",
        "explanation": "Guardian has 8 tools: fetch_api, query_database, run_command, read_file, write_file, run_tests, check_health, get_logs"
      },
      {
        "task": "Understand Guardian monitoring cycle",
        "file": "agents/guardian-agent.js",
        "explanation": "Every 60s: check health -> diagnose issues -> apply fixes -> verify -> log"
      },
      {
        "task": "See how tools combine in Guardian",
        "example": "Guardian uses check_health to detect issues, run_command to apply fixes, query_database to verify",
        "explanation": "Guardian chains the same tools you learned, but autonomously"
      },
      {
        "task": "Review apply-llama2-fixes.sh",
        "file": "scripts/apply-llama2-fixes.sh",
        "explanation": "This script uses grep+sed+jq+time tracking - all the tools from lessons 1-8"
      },
      {
        "task": "Understand the meta-lesson",
        "concept": "You learned individual tools (grep, sed, jq, vos, timing). Guardian combines them autonomously. You can too.",
        "explanation": "Mastery = knowing when and how to chain tools to solve complex problems"
      }
    ],
    "completion_criteria": "Explain how Guardian uses the debugging-mastery tools autonomously"
  }'::jsonb,
  45,
  500,
  'published'
);

-- Update user_progress to show Cal hasn't completed new lessons yet
-- (Lesson 7 already exists and is completed)
