/**
 * Candles API Integration Tests
 *
 * Tests the /api/candles endpoints for OHLCV data retrieval.
 * Requires router to be running on localhost:5001
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';

// Test suite for Candles API
module.exports = async function() {
  await suite('Candles API Integration Tests', async () => {

    // Test: Get candles for BTC
    await test('should get candles for BTC', async () => {
      const res = await axios.get(`${BASE_URL}/api/candles/BTC?timeframe=1h&limit=10`);

      assert(res.status === 200, 'Should return 200 status');
      assert(res.data.status === 'ok', 'Should return ok status');
      assert(res.data.symbol === 'BTC', 'Should return BTC symbol');
      assert(res.data.timeframe === '1h', 'Should return 1h timeframe');
      assert(Array.isArray(res.data.candles), 'Should return candles array');
    })();

    // Test: Get candles with different timeframes
    await test('should support multiple timeframes', async () => {
      const timeframes = ['5m', '1h', '1d'];

      for (const tf of timeframes) {
        const res = await axios.get(`${BASE_URL}/api/candles/BTC?timeframe=${tf}&limit=5`);

        assert(res.data.status === 'ok', `Should work for ${tf} timeframe`);
        assert(res.data.timeframe === tf, `Should return ${tf} timeframe`);
      }
    })();

    // Test: Candle data structure
    await test('should return valid candle structure', async () => {
      const res = await axios.get(`${BASE_URL}/api/candles/BTC?timeframe=1h&limit=1`);

      if (res.data.candles.length > 0) {
        const candle = res.data.candles[0];

        assert(candle.symbol !== undefined, 'Candle should have symbol');
        assert(candle.asset_type !== undefined, 'Candle should have asset_type');
        assert(candle.open_price !== undefined, 'Candle should have open_price');
        assert(candle.high_price !== undefined, 'Candle should have high_price');
        assert(candle.low_price !== undefined, 'Candle should have low_price');
        assert(candle.close_price !== undefined, 'Candle should have close_price');
        assert(candle.candle_start !== undefined, 'Candle should have candle_start');
        assert(candle.candle_end !== undefined, 'Candle should have candle_end');

        // Validate OHLC relationships
        assert(
          parseFloat(candle.high_price) >= parseFloat(candle.open_price),
          'High should be >= open'
        );
        assert(
          parseFloat(candle.high_price) >= parseFloat(candle.close_price),
          'High should be >= close'
        );
        assert(
          parseFloat(candle.low_price) <= parseFloat(candle.open_price),
          'Low should be <= open'
        );
        assert(
          parseFloat(candle.low_price) <= parseFloat(candle.close_price),
          'Low should be <= close'
        );
      }
    })();

    // Test: Limit parameter
    await test('should respect limit parameter', async () => {
      const limit = 5;
      const res = await axios.get(`${BASE_URL}/api/candles/BTC?timeframe=1h&limit=${limit}`);

      assert(
        res.data.candles.length <= limit,
        `Should return at most ${limit} candles`
      );
    })();

    // Test: From parameter for date range
    await test('should filter candles by from date', async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const res = await axios.get(
        `${BASE_URL}/api/candles/BTC?timeframe=1h&from=${oneDayAgo}&limit=100`
      );

      assert(res.data.status === 'ok', 'Should return ok status');

      if (res.data.candles.length > 0) {
        const firstCandle = res.data.candles[0];
        const candleDate = new Date(firstCandle.candle_start);
        const filterDate = new Date(oneDayAgo);

        assert(
          candleDate >= filterDate,
          'All candles should be after from date'
        );
      }
    })();

    // Test: To parameter for date range
    await test('should filter candles by to date', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      const res = await axios.get(
        `${BASE_URL}/api/candles/BTC?timeframe=1h&to=${twoDaysAgo}&limit=100`
      );

      assert(res.data.status === 'ok', 'Should return ok status');

      if (res.data.candles.length > 0) {
        const lastCandle = res.data.candles[res.data.candles.length - 1];
        const candleDate = new Date(lastCandle.candle_start);
        const filterDate = new Date(twoDaysAgo);

        assert(
          candleDate <= filterDate,
          'All candles should be before to date'
        );
      }
    })();

    // Test: Candles in chronological order
    await test('should return candles in chronological order', async () => {
      const res = await axios.get(`${BASE_URL}/api/candles/BTC?timeframe=1h&limit=10`);

      if (res.data.candles.length > 1) {
        for (let i = 1; i < res.data.candles.length; i++) {
          const prevTime = new Date(res.data.candles[i - 1].candle_start);
          const currTime = new Date(res.data.candles[i].candle_start);

          assert(
            currTime >= prevTime,
            'Candles should be in chronological order'
          );
        }
      }
    })();

    // Test: Get latest candles endpoint
    await test('should get latest candles for all symbols', async () => {
      const res = await axios.get(`${BASE_URL}/api/candles/latest?timeframe=1h`);

      assert(res.status === 200, 'Should return 200 status');
      assert(res.data.status === 'ok', 'Should return ok status');
      assert(res.data.timeframe === '1h', 'Should return 1h timeframe');
      assert(Array.isArray(res.data.candles), 'Should return candles array');
      assert(res.data.count >= 0, 'Should return count');
    })();

    // Test: Latest candles structure
    await test('should return valid latest candles', async () => {
      const res = await axios.get(`${BASE_URL}/api/candles/latest?timeframe=1h`);

      if (res.data.candles.length > 0) {
        const candle = res.data.candles[0];

        assert(candle.symbol !== undefined, 'Latest candle should have symbol');
        assert(candle.open_price !== undefined, 'Latest candle should have open_price');
        assert(candle.high_price !== undefined, 'Latest candle should have high_price');
        assert(candle.low_price !== undefined, 'Latest candle should have low_price');
        assert(candle.close_price !== undefined, 'Latest candle should have close_price');
      }
    })();

    // Test: Case insensitive symbol
    await test('should handle case insensitive symbols', async () => {
      const res1 = await axios.get(`${BASE_URL}/api/candles/btc?timeframe=1h&limit=1`);
      const res2 = await axios.get(`${BASE_URL}/api/candles/BTC?timeframe=1h&limit=1`);

      assert(res1.data.status === 'ok', 'Should work with lowercase');
      assert(res2.data.status === 'ok', 'Should work with uppercase');
      assert(res1.data.symbol === 'BTC', 'Should normalize to uppercase');
      assert(res2.data.symbol === 'BTC', 'Should normalize to uppercase');
    })();

    // Test: Invalid symbol handling
    await test('should handle non-existent symbol gracefully', async () => {
      const res = await axios.get(`${BASE_URL}/api/candles/INVALID123?timeframe=1h&limit=10`);

      assert(res.data.status === 'ok', 'Should return ok status');
      assert(res.data.candles.length === 0, 'Should return empty array for invalid symbol');
    })();

    // Test: Response time check
    await test('should respond within acceptable time', async () => {
      const startTime = Date.now();

      await axios.get(`${BASE_URL}/api/candles/BTC?timeframe=1h&limit=100`);

      const duration = Date.now() - startTime;

      assert(duration < 2000, `Should respond in under 2 seconds (took ${duration}ms)`);
    })();

    // Test: Count matches array length
    await test('should return accurate count', async () => {
      const res = await axios.get(`${BASE_URL}/api/candles/BTC?timeframe=1h&limit=10`);

      assert(
        res.data.count === res.data.candles.length,
        'Count should match candles array length'
      );
    })();

  })();
};
