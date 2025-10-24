/**
 * CAL Meta-Learning System - Example Usage
 *
 * Shows how CAL uses batch processing, failure learning, and skill tracking together
 * to learn from mistakes and improve over time.
 *
 * Run with: node examples/cal-meta-learning-example.js
 */

const CalBatchProcessor = require('../lib/cal-batch-processor');
const CalFailureLearner = require('../lib/cal-failure-learner');
const CalSkillTracker = require('../lib/cal-skill-tracker');

async function example() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  CAL Meta-Learning System - Example');
  console.log('═══════════════════════════════════════════════════════\n');

  // Initialize systems
  const batchProcessor = new CalBatchProcessor({ batchSize: 5, rateLimit: 100 });
  const failureLearner = new CalFailureLearner();
  const skillTracker = new CalSkillTracker();

  await failureLearner.load();
  await skillTracker.load();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Example 1: Learn from failures
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('\n📚 Example 1: Learning from Failures\n');

  const taskId = 'css-loading';

  // Simulate trying different approaches
  const approaches = [
    { name: 'css-variables', willFail: true },
    { name: 'css-variables', willFail: true }, // Try again
    { name: 'css-variables', willFail: true }, // Try a third time
    { name: 'inline-styles', willFail: false }  // Finally try something different
  ];

  for (const approach of approaches) {
    console.log(`\n  Trying approach: "${approach.name}"`);

    if (approach.willFail) {
      // Record failure
      const result = await failureLearner.recordFailure(
        taskId,
        'CSS variables not applying',
        { approach: approach.name }
      );

      await skillTracker.recordAttempt(taskId, false, { approach: approach.name });

      console.log(`  ❌ Failed (attempt ${result.failureCount})`);
      console.log(`  💡 Suggestion: ${result.suggestion}`);

      if (result.shouldStop) {
        console.log(`  🛑 Stopping - this approach has failed ${result.failureCount} times`);
        console.log(`  📋 Alternatives:`, await failureLearner.getAlternatives(taskId));
      }
    } else {
      // Record success
      await failureLearner.recordSuccess(taskId, approach.name);
      const skillResult = await skillTracker.recordAttempt(taskId, true, { approach: approach.name });

      console.log(`  ✅ Success!`);
      console.log(`  🎯 Skill level: ${skillResult.levelName}`);

      if (skillResult.mastered) {
        console.log(`  🎉 ${taskId} MASTERED!`);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Example 2: Batch processing with learning
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('\n\n📦 Example 2: Batch Processing with Learning\n');

  const files = [
    { name: 'file1.txt', shouldFail: false },
    { name: 'file2.txt', shouldFail: false },
    { name: 'file3.txt', shouldFail: true },  // This one fails
    { name: 'file4.txt', shouldFail: false },
    { name: 'file5.txt', shouldFail: false },
  ];

  const results = await batchProcessor.process(
    files,
    async (file, index) => {
      console.log(`  Processing: ${file.name}`);

      if (file.shouldFail) {
        // Record the failure for learning
        await failureLearner.recordFailure(
          'file-processing',
          `Failed to process ${file.name}`,
          { approach: 'standard', file: file.name }
        );

        await skillTracker.recordAttempt('file-processing', false, { file: file.name });

        throw new Error(`Failed to process ${file.name}`);
      }

      // Success
      await skillTracker.recordAttempt('file-processing', true, { file: file.name });

      return { processed: true, file: file.name };
    },
    {
      onProgress: (progress) => {
        console.log(`\n  Progress: ${progress.progress}% (${progress.processed}/${progress.total})`);
      }
    }
  );

  console.log('\n  📊 Batch Results:');
  console.log(`     Total: ${results.length}`);
  console.log(`     Succeeded: ${results.filter(r => r.success).length}`);
  console.log(`     Failed: ${results.filter(r => !r.success).length}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Example 3: Check skill progress
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('\n\n📈 Example 3: Skill Progress Summary\n');

  const summary = await skillTracker.getSummary();

  console.log('  Overall Stats:');
  console.log(`    Total skills tracked: ${summary.totalSkills}`);
  console.log(`    Mastered skills: ${summary.masteredSkills}`);
  console.log(`    Skills needing work: ${summary.skillsNeedingWork}`);
  console.log(`    Overall success rate: ${summary.overallSuccessRate}`);

  console.log('\n  Level Distribution:');
  Object.entries(summary.levelDistribution).forEach(([level, count]) => {
    if (count > 0) {
      console.log(`    ${level}: ${count}`);
    }
  });

  if (summary.nextTaskToLearn) {
    console.log(`\n  💡 Next task to practice: ${summary.nextTaskToLearn.skillId}`);
    console.log(`     Current level: ${summary.nextTaskToLearn.levelName}`);
    console.log(`     Success rate: ${summary.nextTaskToLearn.successRate}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Example 4: Get recommendations for a failing task
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('\n\n💡 Example 4: Get Recommendations for Failing Task\n');

  const cssLoadingSummary = failureLearner.getSummary('css-loading');

  if (cssLoadingSummary) {
    console.log(`  Task: ${cssLoadingSummary.taskId}`);
    console.log(`  Total failures: ${cssLoadingSummary.totalFailures}`);
    console.log(`  Total successes: ${cssLoadingSummary.totalSuccesses}`);

    if (cssLoadingSummary.mostFailedApproach) {
      console.log(`\n  ❌ Most failed approach: ${cssLoadingSummary.mostFailedApproach.approach}`);
      console.log(`     Failed ${cssLoadingSummary.mostFailedApproach.count} times`);
    }

    if (cssLoadingSummary.mostSuccessfulApproach) {
      console.log(`\n  ✅ Most successful approach: ${cssLoadingSummary.mostSuccessfulApproach.approach}`);
    }

    if (cssLoadingSummary.recommendation) {
      console.log(`\n  💡 Recommendation: ${cssLoadingSummary.recommendation.approach}`);
      console.log(`     Reason: ${cssLoadingSummary.recommendation.reason}`);
      console.log(`     Confidence: ${(cssLoadingSummary.recommendation.confidence * 100).toFixed(0)}%`);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Example 5: Check if should skip mastered tasks
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('\n\n🎯 Example 5: Skip Mastered Tasks\n');

  const tasks = ['css-loading', 'api-routing', 'file-processing'];

  tasks.forEach(task => {
    const isMastered = skillTracker.isMastered(task);
    const skill = skillTracker.getSkill(task);

    console.log(`  ${task}:`);
    console.log(`    Mastered: ${isMastered ? '✅ Yes' : '❌ No'}`);
    console.log(`    Level: ${skill.levelName}`);
    console.log(`    Should skip: ${isMastered ? 'YES - focus on other tasks' : 'NO - needs more practice'}`);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Example Complete!');
  console.log('═══════════════════════════════════════════════════════\n');
}

// Run example
if (require.main === module) {
  example().catch(console.error);
}

module.exports = { example };
