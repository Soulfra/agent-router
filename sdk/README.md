# CalOS JavaScript SDK

Official JavaScript SDK for integrating "Sign in with CalOS" authentication into your applications.

## Features

- 🔒 **Secure OAuth 2.0** - Industry-standard authentication
- 🛡️ **PKCE Support** - Enhanced security for public clients
- 🎨 **Customizable Button** - Multiple themes and sizes
- 📦 **Lightweight** - No dependencies
- 🚀 **Easy Integration** - Works with any JavaScript app
- 🔑 **Skills API Access** - Get user's CalOS skills and XP

## Installation

### Option 1: CDN (Recommended)

```html
<script type="module" src="https://calos.dev/sdk/calos-sdk.js"></script>
```

### Option 2: Download

Download `calos-sdk.js` from this repository and include it in your project.

## Quick Start

### 1. Register Your Application

Visit the [CalOS Developer Portal](https://calos.dev/developer) to register your application and get a `client_id`.

### 2. Add the SDK

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App with CalOS</title>
</head>
<body>
  <div id="signin"></div>

  <script type="module">
    import { CalOSAuth, createSignInButton } from 'https://calos.dev/sdk/calos-sdk.js';

    const calos = new CalOSAuth({
      clientId: 'cal_your_client_id',
      redirectUri: 'http://localhost:3000/callback',
      scope: 'openid profile email skills'
    });

    // Add sign in button
    const button = createSignInButton(calos);
    document.getElementById('signin').appendChild(button);

    // Handle callback
    if (window.location.search.includes('code=')) {
      calos.handleCallback().then(result => {
        console.log('User:', result.user);
        console.log('Access Token:', result.accessToken);
      });
    }
  </script>
</body>
</html>
```

## Configuration

### CalOSAuth Options

```javascript
const calos = new CalOSAuth({
  clientId: 'cal_your_client_id',        // Required: Your app's client ID
  redirectUri: 'http://localhost:3000',  // Required: OAuth callback URL
  scope: 'openid profile email skills',  // Optional: Space-separated scopes
  calosUrl: 'https://calos.dev',         // Optional: CalOS base URL
  usePKCE: true                          // Optional: Enable PKCE (default: true)
});
```

### Available Scopes

| Scope | Description |
|-------|-------------|
| `openid` | Basic OpenID Connect (required) |
| `profile` | Username and profile information |
| `email` | User's email address |
| `skills` | User's skills and XP data |
| `skills:write` | Permission to award XP (requires approval) |

## API Reference

### `CalOSAuth`

#### Constructor

```javascript
new CalOSAuth(config)
```

Creates a new CalOS authentication instance.

#### Methods

##### `signIn()`

Starts the OAuth sign-in flow by redirecting to CalOS.

```javascript
calos.signIn();
```

##### `handleCallback()`

Handles the OAuth callback and exchanges the authorization code for tokens.

```javascript
calos.handleCallback()
  .then(result => {
    console.log(result.user);        // User information
    console.log(result.accessToken);  // Access token
    console.log(result.refreshToken); // Refresh token
    console.log(result.expiresIn);    // Token expiry (seconds)
  })
  .catch(error => {
    console.error('Login failed:', error);
  });
```

**Returns:** `Promise<{ user, accessToken, refreshToken, expiresIn }>`

##### `getCurrentUser()`

Gets the current user's information if logged in.

```javascript
const user = await calos.getCurrentUser();
if (user) {
  console.log('Logged in as:', user.username);
} else {
  console.log('Not logged in');
}
```

**Returns:** `Promise<Object|null>`

##### `isLoggedIn()`

Checks if a user is currently logged in.

```javascript
if (calos.isLoggedIn()) {
  console.log('User is logged in');
}
```

**Returns:** `boolean`

##### `getAccessToken()`

Gets the stored access token.

```javascript
const token = calos.getAccessToken();
```

**Returns:** `string|null`

##### `signOut()`

Signs out the current user by clearing stored tokens.

```javascript
calos.signOut();
```

### `createSignInButton()`

Creates a "Sign in with CalOS" button.

```javascript
createSignInButton(calosAuth, options)
```

**Parameters:**

- `calosAuth` - CalOSAuth instance
- `options` - Button options:
  - `text` - Button text (default: "Sign in with CalOS")
  - `theme` - Button theme: "light" or "dark" (default: "light")
  - `size` - Button size: "small", "medium", or "large" (default: "medium")

**Example:**

```javascript
const button = createSignInButton(calos, {
  text: 'Continue with CalOS',
  theme: 'dark',
  size: 'large'
});
document.body.appendChild(button);
```

## User Object

The user object returned by `handleCallback()` and `getCurrentUser()` contains:

```javascript
{
  sub: "uuid",              // User ID
  username: "johndoe",       // Username
  email: "john@example.com", // Email (if scope includes 'email')
  skills: [                  // Skills (if scope includes 'skills')
    {
      skill_name: "Development",
      level: 45,
      xp: 8932,
      xp_to_next: 1068
    },
    // ... more skills
  ],
  updated_at: 1234567890     // Unix timestamp
}
```

## Making API Calls

Use the access token to make authenticated API calls to CalOS:

```javascript
const token = calos.getAccessToken();

// Award XP (requires 'skills:write' scope)
await fetch('https://calos.dev/api/skills/award-xp', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    skillId: 'development-skill-id',
    xpAmount: 100
  })
});
```

## Examples

### React Integration

```jsx
import { useState, useEffect } from 'react';
import { CalOSAuth, createSignInButton } from './calos-sdk.js';

const calos = new CalOSAuth({
  clientId: 'cal_your_client_id',
  redirectUri: window.location.origin + '/callback',
  scope: 'openid profile email skills'
});

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if this is a callback
    const params = new URLSearchParams(window.location.search);
    if (params.has('code')) {
      calos.handleCallback()
        .then(result => setUser(result.user))
        .catch(error => console.error(error));
    } else {
      // Check existing login
      calos.getCurrentUser().then(setUser);
    }
  }, []);

  if (user) {
    return (
      <div>
        <h1>Welcome, {user.username}!</h1>
        <button onClick={() => { calos.signOut(); window.location.reload(); }}>
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>My App</h1>
      <button onClick={() => calos.signIn()}>Sign in with CalOS</button>
    </div>
  );
}
```

### Vue Integration

```vue
<template>
  <div>
    <div v-if="user">
      <h1>Welcome, {{ user.username }}!</h1>
      <button @click="signOut">Sign Out</button>
    </div>
    <div v-else>
      <h1>My App</h1>
      <button @click="signIn">Sign in with CalOS</button>
    </div>
  </div>
</template>

<script>
import { CalOSAuth } from './calos-sdk.js';

const calos = new CalOSAuth({
  clientId: 'cal_your_client_id',
  redirectUri: window.location.origin + '/callback',
  scope: 'openid profile email skills'
});

export default {
  data() {
    return {
      user: null
    };
  },
  async mounted() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('code')) {
      const result = await calos.handleCallback();
      this.user = result.user;
    } else {
      this.user = await calos.getCurrentUser();
    }
  },
  methods: {
    signIn() {
      calos.signIn();
    },
    signOut() {
      calos.signOut();
      window.location.reload();
    }
  }
};
</script>
```

## Security Best Practices

1. **Always use HTTPS in production** - Never disable TLS
2. **Validate redirect URIs** - Register exact URIs in your app settings
3. **Use PKCE** - Enabled by default, don't disable unless necessary
4. **Don't expose client secrets** - For public apps, don't use client secrets
5. **Store tokens securely** - The SDK uses localStorage, consider using httpOnly cookies for sensitive apps

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

Requires support for:
- ES6 modules
- Fetch API
- Web Crypto API
- localStorage

## Troubleshooting

### "Invalid redirect_uri"

Make sure your `redirectUri` exactly matches one registered in your app settings. Include protocol, port, and path.

### "Invalid state parameter"

This usually means:
1. The callback was called twice
2. sessionStorage was cleared between auth and callback
3. CSRF attack (unlikely)

### Token expired

Tokens expire after 24 hours. Implement refresh token logic or have users re-authenticate.

## Support

- **Documentation**: https://docs.calos.dev
- **GitHub**: https://github.com/soulfra/calos
- **Discord**: https://discord.gg/calos
- **Email**: support@calos.dev

## License

MIT License - See [LICENSE](../LICENSE) for details.

---

**CalOS** - The Operating System for User Engagement
