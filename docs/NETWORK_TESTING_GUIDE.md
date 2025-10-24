# Network Testing Guide

> How to verify your multi-device federation system actually works
> "Building backwards to forwards" - test the network layer!

## Overview

This guide shows you how to test the network connectivity, geolocation routing, and device pairing that makes your multi-device federation system work.

**What we're testing:**
- TCP connectivity (can devices reach the server?)
- HTTP latency (ping-like measurements)
- IP geolocation (sorting hat algorithm)
- Device pairing (QR codes, WiFi proximity)
- Multi-device sync (shared credits, preferences)

---

## Quick Start

### 1. Start your server

```bash
npm run start
```

### 2. Run the comprehensive test suite

```bash
bash scripts/test-federation-system.sh
```

This runs all 4 test phases:
- Phase 1: Network connectivity (TCP, DNS, latency)
- Phase 2: Geolocation & routing (IP → region assignment)
- Phase 3: Device pairing (QR codes, multi-device)
- Phase 4: End-to-end integration (sync, health)

---

## Individual Test Scripts

### Test 1: Regional Routing

Tests geolocation-based "sorting hat" algorithm.

```bash
bash scripts/test-regional-routing.sh
```

**What it tests:**
- IP → Location resolution (8.8.8.8 → San Francisco, CA)
- Regional server assignment (closest server wins)
- Geolocation cache performance (2nd request faster than 1st)
- User session routing (sessions stick to assigned region)

**Example output:**
```
╔══════════════════════════════════════════════════════╗
║ TEST 1: GEO RESOLVER API                            ║
╚══════════════════════════════════════════════════════╝

▶ Testing: IP geolocation resolution
ℹ INFO: Resolving US West (SF) (8.8.8.8)
✓ PASS: Resolved US West (SF) to Mountain View, United States

ℹ INFO: Resolving US East (VA) (3.218.180.1)
✓ PASS: Resolved US East (VA) to Ashburn, United States
```

---

### Test 2: Device Pairing

Tests QR code pairing, multi-device sync, trust levels.

```bash
bash scripts/test-device-pairing.sh
```

**What it tests:**
- User registration (laptop = primary device)
- QR code generation (5-minute expiry)
- QR code scanning (iPhone pairing)
- Shared user_id (RuneScape model)
- Shared credits balance (both devices see same balance)
- Trust level progression (unverified → verified → trusted)
- Voice assistant pairing (device code flow)
- Device removal (JWT invalidation)

**Example output:**
```
╔══════════════════════════════════════════════════════╗
║ TEST 2: QR CODE PAIRING (Laptop → iPhone)          ║
╚══════════════════════════════════════════════════════╝

💻 Laptop: Generating QR code for iPhone pairing
✓ PASS: QR code pairing session generated
ℹ INFO: Pairing Code: XKCD-1234-ABCD

📱 iPhone: Scanning QR code and completing pairing
✓ PASS: iPhone paired successfully
✓ PASS: Both devices share same user_id (RuneScape model working!)
```

---

### Test 3: Comprehensive Integration

Tests the entire system end-to-end.

```bash
bash scripts/test-federation-system.sh
```

**What it tests:**
- All network diagnostics
- All geolocation routing
- All device pairing
- Cross-device sync
- System health

**Example output:**
```
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║       CALOS Multi-Device Federation Test             ║
║                                                       ║
║  Testing: Network → Geo → Pairing → Sync             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝

✓ PASS: DNS resolution working
✓ PASS: TCP connection to localhost:5001 established
✓ PASS: HTTP health endpoint responding (HTTP 200)
✓ PASS: Average latency: 12.4ms, Packet loss: 0%
```

---

## Using the Network Diagnostics Library

You can also use the Node.js library directly for programmatic testing.

### Example 1: Ping a server

```javascript
const NetworkDiagnostics = require('./lib/network-diagnostics');

const diagnostics = new NetworkDiagnostics();

(async () => {
  // Ping 5 times
  const result = await diagnostics.ping('http://localhost:5001/api/health', 5);

  console.log('Latency:', result.latency);
  // { min: 10, max: 25, avg: 15.2, unit: 'ms' }

  console.log('Packet loss:', result.packetLoss + '%');
  // 0%
})();
```

### Example 2: Compare endpoint latencies

```javascript
const NetworkDiagnostics = require('./lib/network-diagnostics');

const diagnostics = new NetworkDiagnostics();

(async () => {
  const results = await diagnostics.compareEndpoints([
    'http://us-west-2.calos.ai:5001',
    'http://us-east-1.calos.ai:5001',
    'http://eu-west-1.calos.ai:5001'
  ]);

  console.log('Fastest:', results.fastest.url);
  console.log('Latency:', results.fastest.latency.avg + 'ms');

  // Rankings:
  // 🥇 1. http://us-west-2.calos.ai:5001 - 45ms avg
  // 🥈 2. http://us-east-1.calos.ai:5001 - 120ms avg
  // 🥉 3. http://eu-west-1.calos.ai:5001 - 180ms avg
})();
```

### Example 3: Trace route

```javascript
const NetworkDiagnostics = require('./lib/network-diagnostics');

const diagnostics = new NetworkDiagnostics();

(async () => {
  const result = await diagnostics.traceRoute('http://localhost:5001/api/health');

  console.log('Hops:', result.hops);
  // [
  //   { hop: 1, type: 'dns', description: 'DNS Resolution', result: { ... } },
  //   { hop: 2, type: 'tcp', description: 'TCP Connection', result: { ... } },
  //   { hop: 3, type: 'http', description: 'HTTP Request', result: { ... } }
  // ]

  console.log('Total latency:', result.totalLatency + 'ms');
})();
```

### Example 4: Continuous monitoring

```javascript
const NetworkDiagnostics = require('./lib/network-diagnostics');

const diagnostics = new NetworkDiagnostics();

// Monitor server health every 5 seconds
diagnostics.monitor('http://localhost:5001/api/health', 5000, (result, stats) => {
  if (!result.success) {
    console.error('❌ Server DOWN:', result.error);
    // Send alert to team...
  }

  // Check if latency is degrading
  if (stats.latencies.length > 10) {
    const recentAvg = stats.latencies.slice(-10).reduce((a, b) => a + b, 0) / 10;
    if (recentAvg > 500) {
      console.warn('⚠️  High latency detected:', recentAvg + 'ms');
    }
  }
});
```

---

## Network Diagnostics API

### Constructor

```javascript
const diagnostics = new NetworkDiagnostics({
  timeout: 5000,      // Request timeout in ms (default: 5000)
  maxHops: 30,        // Max traceroute hops (default: 30)
  retries: 3          // Retry attempts (default: 3)
});
```

### Methods

#### `testTCPConnection(url)`

Test if you can establish a TCP connection.

```javascript
const result = await diagnostics.testTCPConnection('http://localhost:5001');

// Returns:
// {
//   success: true,
//   hostname: 'localhost',
//   port: 5001,
//   statusCode: 200,
//   latency: 12,
//   timestamp: '2025-01-15T10:30:00.000Z'
// }
```

#### `ping(url, count)`

Measure HTTP latency (like ping).

```javascript
const result = await diagnostics.ping('http://localhost:5001', 5);

// Returns:
// {
//   url: 'http://localhost:5001',
//   success: true,
//   packetsTransmitted: 5,
//   packetsReceived: 5,
//   packetLoss: 0,
//   latency: { min: 10, max: 25, avg: 15.2, unit: 'ms' },
//   results: [ ... ]
// }
```

#### `resolveDNS(hostname)`

Resolve hostname to IP addresses.

```javascript
const result = await diagnostics.resolveDNS('google.com');

// Returns:
// {
//   success: true,
//   hostname: 'google.com',
//   addresses: ['142.250.185.78'],
//   latency: 5,
//   timestamp: '2025-01-15T10:30:00.000Z'
// }
```

#### `traceRoute(url)`

Trace the route to destination (DNS → TCP → HTTP).

```javascript
const result = await diagnostics.traceRoute('http://localhost:5001/api/health');

// Returns:
// {
//   success: true,
//   url: 'http://localhost:5001/api/health',
//   destination: {
//     hostname: 'localhost',
//     addresses: ['127.0.0.1'],
//     port: 5001
//   },
//   hops: [
//     { hop: 1, type: 'dns', result: { latency: 2 } },
//     { hop: 2, type: 'tcp', result: { latency: 10 } },
//     { hop: 3, type: 'http', result: { latency: 15 } }
//   ],
//   totalLatency: 15
// }
```

#### `compareEndpoints(urls)`

Compare latency to multiple endpoints.

```javascript
const result = await diagnostics.compareEndpoints([
  'http://server1.com',
  'http://server2.com',
  'http://server3.com'
]);

// Returns:
// {
//   results: [ ... ],
//   fastest: { url: 'http://server1.com', latency: { avg: 45 } },
//   slowest: { url: 'http://server3.com', latency: { avg: 180 } },
//   rankings: [
//     { rank: 1, url: 'http://server1.com', avgLatency: 45 },
//     { rank: 2, url: 'http://server2.com', avgLatency: 120 },
//     { rank: 3, url: 'http://server3.com', avgLatency: 180 }
//   ]
// }
```

#### `monitor(url, interval, callback)`

Continuously monitor endpoint health.

```javascript
diagnostics.monitor('http://localhost:5001/api/health', 5000, (result, stats) => {
  console.log('Uptime:', (stats.successful / stats.total * 100).toFixed(1) + '%');
});
```

---

## Troubleshooting

### Test fails: "Cannot connect to localhost:5001"

**Problem:** Server is not running.

**Solution:**
```bash
npm run start
```

### Test fails: "DNS resolution failed"

**Problem:** Hostname cannot be resolved.

**Solution:**
- Check your internet connection
- Try using IP address instead of hostname
- Check `/etc/hosts` if using local domains

### Test fails: "Request timeout"

**Problem:** Server is taking too long to respond (> 5s).

**Solution:**
- Increase timeout: `new NetworkDiagnostics({ timeout: 10000 })`
- Check server logs for errors
- Check if Ollama/LLM is running (may be slow)

### Test fails: "Geolocation cache not working"

**Problem:** Both requests take same amount of time.

**Solution:**
- Check database connection
- Verify `ip_locations` table exists:
  ```sql
  SELECT * FROM ip_locations LIMIT 1;
  ```
- Check cache TTL (default: 30 days)

### Test fails: "Devices have different user_ids"

**Problem:** Device pairing not working correctly.

**Solution:**
- Check `user_devices` table:
  ```sql
  SELECT * FROM user_devices WHERE user_id = 'your-user-id';
  ```
- Verify pairing code hasn't expired (5 min)
- Check server logs for pairing errors

---

## Advanced Testing

### Test with Remote IPs

Use ngrok or localtunnel to expose your local server and test with real remote IPs:

```bash
# Install ngrok
brew install ngrok

# Expose server
ngrok http 5001

# Test with ngrok URL
API_URL=https://abc123.ngrok.io bash scripts/test-federation-system.sh
```

### Test Regional Routing

Set up multiple regional servers and configure them in `test-regional-routing.sh`:

```bash
# In test-regional-routing.sh
REGIONAL_SERVERS=(
  ["us-west-2"]="http://us-west-2.yourapp.com:5001"
  ["us-east-1"]="http://us-east-1.yourapp.com:5001"
  ["eu-west-1"]="http://eu-west-1.yourapp.com:5001"
)
```

### Load Testing

Test how system performs under load:

```bash
# Install Apache Bench
brew install httpd

# Load test (100 requests, 10 concurrent)
ab -n 100 -c 10 http://localhost:5001/api/health
```

---

## Monitoring in Production

### Set up continuous monitoring

```javascript
// monitoring/network-monitor.js
const NetworkDiagnostics = require('../lib/network-diagnostics');
const diagnostics = new NetworkDiagnostics();

const endpoints = [
  'http://us-west-2.calos.ai:5001/api/health',
  'http://us-east-1.calos.ai:5001/api/health',
  'http://eu-west-1.calos.ai:5001/api/health'
];

// Monitor all endpoints
endpoints.forEach(url => {
  diagnostics.monitor(url, 30000, (result, stats) => {
    // Log to monitoring system (Datadog, New Relic, etc.)
    if (!result.success) {
      alertTeam(`${url} is DOWN: ${result.error}`);
    }

    if (result.latency > 1000) {
      alertTeam(`${url} high latency: ${result.latency}ms`);
    }

    // Send metrics
    metrics.gauge('server.latency', result.latency, { server: url });
    metrics.gauge('server.uptime', stats.successful / stats.total, { server: url });
  });
});
```

---

## Summary

```
┌──────────────────────────────────────────────────────────┐
│  Network Testing Workflow                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Start server: npm run start                          │
│                                                          │
│  2. Run tests:                                           │
│     • Full suite: ./scripts/test-federation-system.sh    │
│     • Regional:   ./scripts/test-regional-routing.sh     │
│     • Pairing:    ./scripts/test-device-pairing.sh       │
│                                                          │
│  3. Use library programmatically:                        │
│     const NetworkDiagnostics = require('./lib/...')     │
│                                                          │
│  4. Monitor in production:                               │
│     diagnostics.monitor(url, interval, callback)         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Files Created:**
- `lib/network-diagnostics.js` - Core testing library
- `scripts/test-regional-routing.sh` - Geolocation tests
- `scripts/test-device-pairing.sh` - Device pairing tests
- `scripts/test-federation-system.sh` - Comprehensive integration test

**Next Steps:**
1. Run `bash scripts/test-federation-system.sh` to verify everything works
2. Review test output and fix any failures
3. Set up continuous monitoring for production
4. Add tests to CI/CD pipeline

---

## Related Documentation

- [MULTI_DEVICE_FEDERATION_GUIDE.md](./MULTI_DEVICE_FEDERATION_GUIDE.md) - Architecture overview
- [SYSTEM_OPERATIONS_MANUAL.md](../SYSTEM_OPERATIONS_MANUAL.md) - Operations guide
- [lib/geo-resolver.js](../lib/geo-resolver.js) - Geolocation implementation
- [lib/device-pairing.js](../lib/device-pairing.js) - Device pairing implementation
