/**
 * Scheduler Unit Tests
 *
 * Tests the Scheduler class for task scheduling, execution, and management.
 */

const Scheduler = require('../../lib/scheduler');

// Helper function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test suite for Scheduler
module.exports = async function() {
  await suite('Scheduler Unit Tests', async () => {

    // Test: Create scheduler instance
    await test('should create scheduler instance', async () => {
      const scheduler = new Scheduler();
      assert(scheduler !== null, 'Scheduler should be created');
      assert(scheduler.tasks instanceof Map, 'Scheduler should have tasks Map');
      assert(scheduler.running === false, 'Scheduler should not be running initially');
    })();

    // Test: Schedule a task
    await test('should schedule a task', async () => {
      const scheduler = new Scheduler();
      let executed = false;

      scheduler.schedule('test-task', () => {
        executed = true;
      }, { interval: 100, runImmediately: false });

      assert(scheduler.tasks.has('test-task'), 'Task should be added to scheduler');
      assert(executed === false, 'Task should not execute until started');
    })();

    // Test: Start scheduler and run tasks
    await test('should start scheduler and execute tasks', async () => {
      const scheduler = new Scheduler();
      let executionCount = 0;

      scheduler.schedule('test-task', () => {
        executionCount++;
      }, { interval: 50, runImmediately: true });

      scheduler.start();

      // Wait for task to execute
      await sleep(100);

      scheduler.stop();

      assert(scheduler.running === false, 'Scheduler should be stopped');
      assert(executionCount >= 1, 'Task should have executed at least once');
    })();

    // Test: Run task immediately
    await test('should run task immediately with runImmediately option', async () => {
      const scheduler = new Scheduler();
      let executed = false;

      scheduler.schedule('immediate-task', () => {
        executed = true;
      }, { interval: 10000, runImmediately: true });

      scheduler.start();

      // Wait a bit for immediate execution
      await sleep(50);

      scheduler.stop();

      assert(executed === true, 'Task should execute immediately');
    })();

    // Test: Disable and enable tasks
    await test('should disable and enable tasks', async () => {
      const scheduler = new Scheduler();
      let executionCount = 0;

      scheduler.schedule('toggle-task', () => {
        executionCount++;
      }, { interval: 50, runImmediately: false });

      scheduler.start();

      // Disable task
      scheduler.disable('toggle-task');

      await sleep(150);

      const countAfterDisable = executionCount;

      // Enable task
      scheduler.enable('toggle-task');

      await sleep(150);

      scheduler.stop();

      assert(countAfterDisable === 0, 'Task should not execute while disabled');
      assert(executionCount > 0, 'Task should execute after being enabled');
    })();

    // Test: Remove task
    await test('should remove task', async () => {
      const scheduler = new Scheduler();

      scheduler.schedule('removable-task', () => {}, { interval: 100 });

      assert(scheduler.tasks.has('removable-task'), 'Task should exist');

      scheduler.remove('removable-task');

      assert(!scheduler.tasks.has('removable-task'), 'Task should be removed');
    })();

    // Test: Run task on demand with runNow
    await test('should run task on demand with runNow()', async () => {
      const scheduler = new Scheduler();
      let executionCount = 0;

      scheduler.schedule('on-demand-task', () => {
        executionCount++;
      }, { interval: 10000, runImmediately: false });

      // Run task manually
      await scheduler.runNow('on-demand-task');

      assert(executionCount === 1, 'Task should execute once on demand');
    })();

    // Test: Error handling
    await test('should handle task errors gracefully', async () => {
      let errorCaught = false;

      const scheduler = new Scheduler({
        errorHandler: (taskName, error) => {
          errorCaught = true;
        }
      });

      scheduler.schedule('failing-task', () => {
        throw new Error('Intentional error');
      }, { interval: 50, runImmediately: true });

      scheduler.start();

      await sleep(100);

      scheduler.stop();

      assert(errorCaught === true, 'Error handler should be called');
    })();

    // Test: Retry logic
    await test('should retry failed tasks', async () => {
      const scheduler = new Scheduler();
      let attemptCount = 0;

      scheduler.schedule('retry-task', () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Fail on purpose');
        }
      }, { interval: 1000, runImmediately: true, maxRetries: 3, retryDelay: 50 });

      scheduler.start();

      await sleep(300);

      scheduler.stop();

      assert(attemptCount >= 3, `Task should retry (attempted ${attemptCount} times)`);
    })();

    // Test: Get task statistics
    await test('should track task statistics', async () => {
      const scheduler = new Scheduler();
      let executionCount = 0;

      scheduler.schedule('stats-task', () => {
        executionCount++;
      }, { interval: 50, runImmediately: true });

      scheduler.start();

      await sleep(150);

      scheduler.stop();

      const stats = scheduler.getStats('stats-task');

      assert(stats.runs > 0, 'Stats should show runs');
      assert(stats.lastRun !== null, 'Stats should show last run time');
      assert(stats.lastSuccess !== null, 'Stats should show last success time');
    })();

    // Test: Get all stats
    await test('should get stats for all tasks', async () => {
      const scheduler = new Scheduler();

      scheduler.schedule('task-1', () => {}, { interval: 100 });
      scheduler.schedule('task-2', () => {}, { interval: 200 });

      const allStats = scheduler.getStats();

      assert(allStats.running === false, 'Scheduler should not be running');
      assert(allStats.taskCount === 2, 'Should have 2 tasks');
      assert(allStats.tasks['task-1'] !== undefined, 'Should have stats for task-1');
      assert(allStats.tasks['task-2'] !== undefined, 'Should have stats for task-2');
    })();

    // Test: Prevent duplicate task names
    await test('should prevent duplicate task names', async () => {
      const scheduler = new Scheduler();

      scheduler.schedule('duplicate-task', () => {}, { interval: 100 });

      let errorThrown = false;
      try {
        scheduler.schedule('duplicate-task', () => {}, { interval: 200 });
      } catch (error) {
        errorThrown = true;
      }

      assert(errorThrown === true, 'Should throw error for duplicate task name');
    })();

    // Test: Task history tracking
    await test('should track task execution history', async () => {
      const scheduler = new Scheduler();

      scheduler.schedule('history-task', () => {}, { interval: 50, runImmediately: true });

      scheduler.start();

      await sleep(150);

      scheduler.stop();

      const history = scheduler.getHistory(10);

      assert(history.length > 0, 'Should have history entries');
      assert(history[0].task === 'history-task', 'History should contain task name');
      assert(history[0].status === 'success', 'History should show success status');
    })();

    // Test: Stop scheduler
    await test('should stop all tasks when scheduler stops', async () => {
      const scheduler = new Scheduler();
      let executionCount = 0;

      scheduler.schedule('stoppable-task', () => {
        executionCount++;
      }, { interval: 50, runImmediately: false });

      scheduler.start();

      await sleep(150);

      const countBeforeStop = executionCount;

      scheduler.stop();

      await sleep(150);

      assert(executionCount === countBeforeStop, 'Task should stop executing after scheduler stops');
    })();

  })();
};
