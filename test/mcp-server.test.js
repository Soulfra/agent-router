/**
 * CalOS MCP Server Tests
 *
 * Test privacy-first MCP server functionality
 */

const CalOSMCPServer = require('../lib/mcp-server/calos-mcp-server');
const CalOSMCPClient = require('../lib/mcp-server/mcp-client');
const http = require('http');

describe('CalOS MCP Server', () => {
  let server;
  let client;
  const testPort = 3101;

  beforeAll(async () => {
    // Mock database
    const mockDb = {
      query: async (sql, params) => {
        if (sql.includes('rpg_players')) {
          return {
            rows: [{
              user_id: 'test-user',
              level: 1,
              xp: 0,
              total_xp: 0,
              achievements: []
            }],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      }
    };

    server = new CalOSMCPServer({ db: mockDb, port: testPort });
    await server.start();

    client = new CalOSMCPClient(`http://localhost:${testPort}`);
  });

  afterAll(async () => {
    await server.stop();
  });

  test('Server starts and responds to health check', async () => {
    const health = await client.health();
    expect(health.status).toBe('healthy');
    expect(health.privacy.telemetry).toBe(false);
    expect(health.privacy.externalCalls).toBe(false);
  });

  test('Lists available tools', async () => {
    const response = await client.listTools();
    expect(response.tools).toBeDefined();
    expect(response.tools.length).toBeGreaterThan(0);
    expect(response.privacy.localOnly).toBe(true);

    // Check for expected tools
    const toolNames = response.tools.map(t => t.name);
    expect(toolNames).toContain('database_query');
    expect(toolNames).toContain('filesystem_read');
    expect(toolNames).toContain('code_grep');
    expect(toolNames).toContain('rpg_get_player');
  });

  test('File system read (within project)', async () => {
    const content = await client.readFile('./package.json');
    expect(content).toContain('agent-router');
  });

  test('File system read (outside project) throws error', async () => {
    await expect(
      client.readFile('/etc/passwd')
    ).rejects.toThrow('Access denied');
  });

  test('Code grep tool', async () => {
    const result = await client.grep('CalOSMCPServer', './lib/mcp-server');
    expect(result.pattern).toBe('CalOSMCPServer');
    expect(result.matches).toBeDefined();
    expect(result.count).toBeGreaterThan(0);
  });

  test('Code find tool', async () => {
    const result = await client.find('*.js', './lib/mcp-server');
    expect(result.pattern).toBe('*.js');
    expect(result.files).toBeDefined();
    expect(result.count).toBeGreaterThan(0);
  });

  test('RPG: Get player stats', async () => {
    const player = await client.getPlayer('test-user');
    expect(player.userId).toBe('test-user');
    expect(player.level).toBeDefined();
    expect(player.xp).toBeDefined();
    expect(player.totalXp).toBeDefined();
  });

  test('Privacy: No telemetry headers', async () => {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: testPort,
        path: '/mcp/health',
        method: 'GET'
      }, (res) => {
        // Check that NO tracking headers are present
        expect(res.headers['x-telemetry']).toBeUndefined();
        expect(res.headers['x-tracking-id']).toBeUndefined();
        expect(res.headers['x-analytics']).toBeUndefined();
        resolve();
      });
      req.end();
    });
  });

  test('Privacy: CORS only allows localhost', async () => {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: testPort,
        path: '/mcp/health',
        method: 'GET'
      }, (res) => {
        const corsOrigin = res.headers['access-control-allow-origin'];
        expect(corsOrigin).toContain('localhost');
        resolve();
      });
      req.end();
    });
  });
});
