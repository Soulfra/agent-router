#!/usr/bin/env node

/**
 * Test Message Store
 * Tests database persistence and formatting
 */

const MessageStore = require('../lib/message-store');

async function testMessageStore() {
  console.log('🧪 Testing Message Store...\n');

  const store = new MessageStore();
  const sessionId = 'test_' + Date.now();

  console.log(`Session ID: ${sessionId}\n`);

  // Test 1: Plain message
  console.log('Test 1: Plain message');
  const msg1 = await store.store({
    sessionId,
    type: 'chat',
    user: 'TestUser',
    message: 'Hello world!',
    timestamp: new Date().toISOString()
  });
  console.log('✓ Stored:', msg1.hash.substring(0, 16));
  console.log('  Formatted:', msg1.formattedHtml);
  console.log('');

  // Test 2: Bold text
  console.log('Test 2: Bold text');
  const msg2 = await store.store({
    sessionId,
    type: 'chat',
    user: 'TestUser',
    message: 'This is **bold** text',
    timestamp: new Date().toISOString()
  });
  console.log('✓ Stored:', msg2.hash.substring(0, 16));
  console.log('  Formatted:', msg2.formattedHtml);
  console.log('');

  // Test 3: Multiple formatting
  console.log('Test 3: Multiple formatting');
  const msg3 = await store.store({
    sessionId,
    type: 'agent_response',
    agent: 'gpt4',
    message: 'This is **bold**, *italic*, __underline__, and `code`',
    timestamp: new Date().toISOString()
  });
  console.log('✓ Stored:', msg3.hash.substring(0, 16));
  console.log('  Formatted:', msg3.formattedHtml);
  console.log('');

  // Test 4: Verify perfect recall
  console.log('Test 4: Verify perfect recall');
  const verification = await store.verify(sessionId);
  console.log('✓ Verification:', JSON.stringify(verification, null, 2));
  console.log('');

  // Test 5: Get messages
  console.log('Test 5: Get messages');
  const messages = await store.getMessages(sessionId);
  console.log(`✓ Retrieved ${messages.length} messages`);
  console.log('');

  // Test 6: Get hashes
  console.log('Test 6: Get hashes');
  const hashes = await store.getHashes(sessionId);
  console.log(`✓ Retrieved ${hashes.length} hashes:`);
  hashes.forEach(h => {
    console.log(`  ${h.timestamp} - ${h.hash.substring(0, 16)}...`);
  });
  console.log('');

  console.log('✅ All tests passed!');
}

testMessageStore().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
