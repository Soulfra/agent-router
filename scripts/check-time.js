#!/usr/bin/env node
/**
 * Check System Time
 *
 * Diagnose and fix system time issues.
 *
 * Usage:
 *   node scripts/check-time.js
 *   node scripts/check-time.js --fix
 *   node scripts/check-time.js --ntp
 */

const { getTimeService } = require('../lib/time-service');

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const ntp = args.includes('--ntp');

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║          CALOS Time Service Check              ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const timeService = getTimeService();

  // Show current status
  const status = timeService.getStatus();

  console.log('Current Time Status:');
  console.log('─'.repeat(50));
  console.log(`Mode:             ${status.mode}`);
  console.log(`System Time:      ${status.systemTime}`);
  console.log(`Corrected Time:   ${status.correctedTime}`);
  console.log(`Offset:           ${status.offsetSeconds}s (${status.offset}ms)`);
  console.log(`Year Difference:  ${status.yearDifference} years`);
  if (status.lastNtpSync) {
    console.log(`Last NTP Sync:    ${status.lastNtpSync}`);
  }
  console.log('─'.repeat(50));

  // Check if time is wrong
  if (Math.abs(status.yearDifference) > 0) {
    console.log('\n⚠️  WARNING: Year difference detected!');
    console.log(`   System shows ${new Date(status.systemTime).getFullYear()}`);
    console.log(`   Should be ${new Date(status.correctedTime).getFullYear()}`);
  } else {
    console.log('\n✅ Time looks correct');
  }

  // Fix if requested
  if (fix) {
    console.log('\n🔧 Applying time correction...');

    // Determine correct year based on typical development timeline
    const systemYear = new Date(status.systemTime).getFullYear();

    if (systemYear > 2025) {
      // System is in future, set to 2024
      console.log(`   System shows ${systemYear}, correcting to 2024`);
      timeService.setOffsetByDate(new Date('2024-10-22T00:00:00Z'));
      console.log('   ✅ Manual offset applied');
    } else if (systemYear < 2024) {
      // System is in past, set to 2024
      console.log(`   System shows ${systemYear}, correcting to 2024`);
      timeService.setOffsetByDate(new Date('2024-10-22T00:00:00Z'));
      console.log('   ✅ Manual offset applied');
    } else {
      console.log('   Time already correct, no fix needed');
    }

    // Show new status
    const newStatus = timeService.getStatus();
    console.log('\nNew Time Status:');
    console.log('─'.repeat(50));
    console.log(`Mode:             ${newStatus.mode}`);
    console.log(`System Time:      ${newStatus.systemTime}`);
    console.log(`Corrected Time:   ${newStatus.correctedTime}`);
    console.log(`Offset:           ${newStatus.offsetSeconds}s`);
    console.log('─'.repeat(50));
  }

  // NTP sync if requested
  if (ntp) {
    console.log('\n🌐 Syncing with NTP server...');
    const ntpResult = await timeService.syncWithNTP();

    if (ntpResult.success) {
      console.log('   ✅ NTP sync successful');
      console.log(`   System: ${ntpResult.systemTime.toISOString()}`);
      console.log(`   NTP:    ${ntpResult.ntpTime.toISOString()}`);
      console.log(`   Offset: ${Math.round(ntpResult.offset / 1000)}s`);

      // Enable NTP mode
      timeService.mode = 'ntp';
      console.log('   NTP mode enabled');
    } else {
      console.log(`   ❌ NTP sync failed: ${ntpResult.error}`);
    }
  }

  // Instructions
  if (!fix && !ntp && Math.abs(status.yearDifference) > 0) {
    console.log('\nTo fix this issue, run:');
    console.log('  npm run time:fix        # Apply manual correction');
    console.log('  npm run time:fix -- --ntp    # Use NTP sync');
  }

  console.log('');
}

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
CALOS Time Service Check

Diagnose and fix system time issues (like year showing 2025 instead of 2024).

Usage:
  npm run time:check           # Check current time status
  npm run time:fix             # Fix time offset
  npm run time:fix -- --ntp    # Fix using NTP sync

Options:
  --fix      Apply manual time correction
  --ntp      Sync with NTP server (worldtimeapi.org)
  --help, -h Show this help

Examples:
  # Check if time is correct
  npm run time:check

  # Fix wrong year (e.g., 2025 → 2024)
  npm run time:fix

  # Use NTP to auto-detect correct time
  npm run time:fix -- --ntp

How It Works:
  TimeService maintains an offset that corrects system time.
  All CALOS code should use timeService.now() instead of new Date().

  If your system clock shows the wrong year, this will fix it
  without requiring admin/root to change system time.
`);
  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
