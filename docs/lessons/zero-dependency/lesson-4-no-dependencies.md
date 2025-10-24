# Lesson 4: Build Without npm Dependencies

**Track:** Zero-Dependency Development
**Lesson:** 4 of 6
**XP Reward:** 140
**Time:** 45 minutes
**Prerequisites:** Lesson 3 (Licensing)

## Learning Objectives

By the end of this lesson, you will:
- ✅ Build HTTP server without Express
- ✅ Parse JSON without libraries
- ✅ Route requests manually
- ✅ Handle file uploads
- ✅ Create API endpoints

## HTTP Server (No Express)

```javascript
const http = require('http');
const url = require('url');

class SimpleServer {
  constructor() {
    this.routes = {
      GET: new Map(),
      POST: new Map(),
      PUT: new Map(),
      DELETE: new Map()
    };
  }

  get(path, handler) {
    this.routes.GET.set(path, handler);
  }

  post(path, handler) {
    this.routes.POST.set(path, handler);
  }

  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const query = parsedUrl.query;

    const handler = this.routes[req.method]?.get(path);

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      // Parse body for POST/PUT
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT') {
        body = await this.parseBody(req);
      }

      const result = await handler({ query, body, req, res });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          resolve({});
        }
      });
      req.on('error', reject);
    });
  }

  listen(port) {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  }
}

module.exports = SimpleServer;
```

### Usage

```javascript
const SimpleServer = require('./simple-server');

const app = new SimpleServer();

app.get('/api/hello', async ({ query }) => {
  return { message: 'Hello ' + (query.name || 'World') };
});

app.post('/api/user', async ({ body }) => {
  return { created: body };
});

app.listen(3000);
```

## Summary

You've learned:
- ✅ Build HTTP server without Express
- ✅ Parse requests manually
- ✅ Create routing system
- ✅ Handle JSON data

## Next Lesson

**Lesson 5: Database Design**

Learn advanced database design patterns.

## Quiz

1. What module do you use for HTTP server?
   - a) express
   - b) http (built-in)
   - c) koa
   - d) fastify

2. How do you parse JSON without libraries?
   - a) JSON.parse()
   - b) eval()
   - c) Custom parser
   - d) Can't be done

3. What's the benefit of no dependencies?
   - a) Harder to use
   - b) Security and control
   - c) Less features
   - d) Nothing

**Answers:** 1-b, 2-a, 3-b

---

**🎴 Achievement Unlocked:** Zero-Dependency Master (+140 XP)
