/**
 * Example: Send email
 *
 * Run: CALOS_API_KEY=your-key node examples/send-email.js
 */

const calos = require('../index');

async function main() {
  try {
    const result = await calos.email.send({
      to: 'customer@example.com',
      subject: 'Hello from CALOS',
      body: 'This is a test email sent via CALOS Email API',
      html: '<h1>Hello from CALOS</h1><p>This is a test email sent via CALOS Email API</p>'
    });

    console.log('✓ Email sent successfully!');
    console.log('  Message ID:', result.messageId);
    console.log('  Provider:', result.provider);

  } catch (error) {
    console.error('✗ Error sending email:', error.message);
    console.error('  Code:', error.code);
  }
}

main();
