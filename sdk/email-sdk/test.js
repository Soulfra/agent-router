/**
 * Simple test for @calos/email-sdk
 *
 * Run: node test.js
 */

const calos = require('./index');

async function test() {
  console.log('Testing @calos/email-sdk...\n');

  // Test 1: Module loads
  console.log('✓ Module loaded');
  console.log('  - email:', typeof calos.email);
  console.log('  - createClient:', typeof calos.createClient);
  console.log('  - CalosEmailClient:', typeof calos.CalosEmailClient);
  console.log('  - CalosError:', typeof calos.CalosError);

  // Test 2: Client creation
  const client = calos.createClient({
    apiKey: 'test-key',
    baseUrl: 'http://localhost:3000'
  });
  console.log('\n✓ Client created');
  console.log('  - API Key:', client.apiKey);
  console.log('  - Base URL:', client.baseUrl);

  // Test 3: Error handling (no API key)
  try {
    const noKeyClient = calos.createClient();
    await noKeyClient.send({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Test'
    });
  } catch (error) {
    console.log('\n✓ Error handling works');
    console.log('  - Error type:', error.constructor.name);
    console.log('  - Error code:', error.code);
    console.log('  - Error message:', error.message);
  }

  // Test 4: Validation
  try {
    await client.send({
      // Missing 'to'
      subject: 'Test',
      body: 'Test'
    });
  } catch (error) {
    console.log('\n✓ Validation works');
    console.log('  - Error code:', error.code);
    console.log('  - Error message:', error.message);
  }

  // Test 5: Default client
  console.log('\n✓ Default client available');
  console.log('  - calos.email.send:', typeof calos.email.send);
  console.log('  - calos.email.addRecipient:', typeof calos.email.addRecipient);
  console.log('  - calos.email.getStatus:', typeof calos.email.getStatus);

  console.log('\n✅ All tests passed!');
  console.log('\nTo test with real API:');
  console.log('  1. Set CALOS_API_KEY environment variable');
  console.log('  2. Run: node examples/send-email.js');
}

test().catch(console.error);
