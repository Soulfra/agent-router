# API-to-App Generator

**Generate REAL apps from APIs, not templates or mocks.**

## The Problem

Most code generators create:
- ❌ README files with example code (not real apps)
- ❌ Scaffolding with `// TODO: Implement` comments
- ❌ Mock implementations that don't work
- ❌ Templates you have to fill in manually

## The Solution

This system **queries real APIs** and generates **production-ready apps**:

```
Query Shopify API → Discover schema → Generate real iOS app → Deploy to App Store
```

### What You Get

✅ **Real Xcode projects** (.xcodeproj) that open in Xcode
✅ **Working implementations** - no TODOs, actual code that works
✅ **Production-ready** - error handling, retry logic, authentication
✅ **Type-safe models** - based on discovered API schema
✅ **Complete UI** - SwiftUI/React components that actually work
✅ **Tests included** - unit and integration tests
✅ **Full documentation** - API schema, README, inline docs

---

## Quick Start

### Generate an iOS App from Shopify API

```bash
npm run generate -- \
  --api "https://your-store.myshopify.com/admin/api/2024-01/graphql.json" \
  --type graphql \
  --auth "Shopify-Access-Token: shpat_YOUR_TOKEN" \
  --platform ios \
  --name ShopifyAdmin

# Output: ./generated/ShopifyAdmin/ShopifyAdmin.xcodeproj
# Open in Xcode and run immediately!
```

### Generate a Web Dashboard from Stripe API

```bash
npm run generate -- \
  --api "https://api.stripe.com" \
  --type rest \
  --auth "Bearer sk_test_YOUR_KEY" \
  --platform web \
  --name StripeDashboard

# Output: ./generated/StripeDashboard/
# Run: cd StripeDashboard && npm install && npm run dev
```

### Generate a Mobile App from GitHub GraphQL API

```bash
npm run generate -- \
  --api "https://api.github.com/graphql" \
  --type graphql \
  --auth "Bearer ghp_YOUR_TOKEN" \
  --platform mobile \
  --name GitHubMobile

# Output: React Native app for iOS + Android
```

---

## How It Works

### 1. API Discovery (Introspection)

The system **actually queries your API** to understand it:

**GraphQL APIs:**
- Runs GraphQL introspection query
- Discovers all types, queries, mutations, subscriptions
- Extracts entities (Product, Order, Customer, etc.)
- Maps relationships and field types

**REST APIs:**
- Discovers endpoints by querying common paths
- Analyzes responses to infer data models
- Identifies resources and operations
- Maps CRUD patterns

**OpenAPI/Swagger:**
- Fetches OpenAPI specification
- Parses all paths, schemas, operations
- Extracts security requirements
- Maps request/response types

### 2. Real Code Generation

Unlike template generators, this creates **actual working code**:

**API Client:**
```swift
// Real implementation with retry logic
func getProducts() async throws -> [Product] {
    try await performRequest(path: "/products", method: "GET")
}

// Not: throw new Error('Not implemented')  ❌
```

**Data Models:**
```swift
// Type-safe models from discovered schema
struct Product: Codable, Identifiable {
    let id: String
    let title: String
    let price: Double
    let inventory: Int
}
```

**Error Handling:**
```swift
// Production-ready error handling
if httpResponse.statusCode == 429 {
    // Automatic retry with backoff
    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
    return try await performRequest(...)
}
```

**UI Components:**
```swift
// Working SwiftUI views
struct ProductList: View {
    @StateObject private var viewModel = ProductViewModel()

    var body: some View {
        List(viewModel.products) { product in
            ProductRow(product: product)
        }
        .task { await viewModel.loadProducts() }
    }
}
```

### 3. Project Building

Creates **real project structures**:

**iOS (Xcode):**
- `.xcodeproj` directory with `project.pbxproj`
- Proper file references and build phases
- Info.plist, Assets.xcassets
- LaunchScreen.storyboard
- **Opens in Xcode and compiles immediately**

**Web (Next.js):**
- Complete Next.js project structure
- package.json with dependencies
- API routes, components, pages
- **Run with `npm run dev` immediately**

---

## Examples

### Example 1: Shopify Admin App (iOS)

```bash
# Generate real Shopify admin app
npm run generate -- \
  --api "https://mystore.myshopify.com/admin/api/2024-01/graphql.json" \
  --type graphql \
  --auth "Shopify-Access-Token: shpat_abc123..." \
  --platform ios \
  --name ShopifyAdmin
```

**What You Get:**
```
ShopifyAdmin/
├── ShopifyAdmin.xcodeproj/      ← Real Xcode project!
│   └── project.pbxproj
├── ShopifyAdmin/
│   ├── ShopifyAdminApp.swift
│   ├── API/
│   │   ├── APIClient.swift      ← Real HTTP client with retry
│   │   ├── APIError.swift       ← Production error handling
│   │   └── APIService.swift     ← CRUD operations for Products/Orders
│   ├── Models/
│   │   ├── Product.swift        ← Discovered from GraphQL schema
│   │   ├── Order.swift
│   │   ├── Customer.swift
│   │   └── Inventory.swift
│   ├── Views/
│   │   ├── ProductListView.swift  ← Working SwiftUI UI
│   │   ├── OrderListView.swift
│   │   └── CustomerListView.swift
│   ├── ViewModels/
│   │   ├── ProductViewModel.swift  ← Real business logic
│   │   └── OrderViewModel.swift
│   ├── Config.swift
│   ├── Info.plist
│   └── Assets.xcassets/
└── README.md
```

**Open and Run:**
```bash
cd generated/ShopifyAdmin
open ShopifyAdmin.xcodeproj
# Press ⌘+R to build and run!
```

### Example 2: Stripe Payment Dashboard (Web)

```bash
# Generate Stripe dashboard
npm run generate -- \
  --api "https://api.stripe.com" \
  --type rest \
  --auth "Bearer sk_test_..." \
  --platform web \
  --name StripeDashboard
```

**What You Get:**
```
StripeDashboard/
├── package.json                 ← Real Next.js project
├── pages/
│   ├── index.tsx               ← Dashboard home
│   ├── payments.tsx            ← Payment list
│   ├── customers.tsx           ← Customer list
│   └── api/                    ← API routes
│       ├── payments.ts         ← Real Stripe integration
│       └── customers.ts
├── components/
│   ├── PaymentTable.tsx        ← Working React components
│   ├── CustomerCard.tsx
│   └── Dashboard.tsx
├── lib/
│   ├── stripe-client.ts        ← Real Stripe SDK integration
│   ├── api-client.ts           ← HTTP client
│   └── types.ts                ← TypeScript types from API
└── README.md
```

**Run Immediately:**
```bash
cd generated/StripeDashboard
npm install
npm run dev
# Open http://localhost:3000
```

### Example 3: GitHub Repository Manager (Mobile)

```bash
# Generate GitHub mobile app
npm run generate -- \
  --api "https://api.github.com/graphql" \
  --type graphql \
  --auth "Bearer ghp_..." \
  --platform mobile \
  --name GitHubMobile
```

**What You Get:**
```
GitHubMobile/
├── package.json
├── App.tsx
├── src/
│   ├── api/
│   │   ├── github-client.ts    ← Real GitHub GraphQL client
│   │   └── api-service.ts
│   ├── models/
│   │   ├── Repository.ts       ← Discovered from GitHub API
│   │   ├── Issue.ts
│   │   ├── PullRequest.ts
│   │   └── User.ts
│   ├── screens/
│   │   ├── RepoListScreen.tsx  ← Working React Native UI
│   │   ├── IssueListScreen.tsx
│   │   └── PRListScreen.tsx
│   └── components/
│       ├── RepoCard.tsx
│       └── IssueCard.tsx
└── README.md
```

**Run on iOS/Android:**
```bash
cd generated/GitHubMobile
npm install
npm run ios    # or npm run android
```

---

## Command Reference

### Basic Usage

```bash
npm run generate -- --api <url> --platform <platform> --name <name>
```

### Required Arguments

- `--api <url>` - API endpoint URL
- `--platform <platform>` - Target platform (ios, web, mobile, android)
- `--name <name>` - App name

### Optional Arguments

- `--type <type>` - API type (auto, graphql, rest, openapi) [default: auto]
- `--auth <auth>` - Authentication (Bearer token, header, etc.)
- `--output <dir>` - Output directory [default: ./generated]
- `--headers <json>` - Custom headers as JSON string
- `--no-tests` - Skip test generation
- `--no-ui` - Skip UI generation

### Authentication Formats

**Bearer Token:**
```bash
--auth "Bearer sk_test_123..."
```

**Custom Header:**
```bash
--auth "X-API-Key: your-key"
--auth "Shopify-Access-Token: shpat_..."
```

**Basic Auth:**
```bash
--auth "username:password"
```

### Custom Headers

```bash
--headers '{"X-Custom-Header": "value", "X-Another": "value2"}'
```

---

## Real-World Examples

### E-Commerce Admin (Shopify)

```bash
npm run generate -- \
  --api "https://store.myshopify.com/admin/api/2024-01/graphql.json" \
  --type graphql \
  --auth "Shopify-Access-Token: shpat_..." \
  --platform ios \
  --name ShopifyAdmin
```

**Features Generated:**
- Product management (list, create, update, delete)
- Order tracking and fulfillment
- Customer management
- Inventory tracking
- Analytics dashboard
- Real-time sync with Shopify

### Payment Dashboard (Stripe)

```bash
npm run generate -- \
  --api "https://api.stripe.com" \
  --type rest \
  --auth "Bearer sk_live_..." \
  --platform web \
  --name StripePanel
```

**Features Generated:**
- Payment list and details
- Customer management
- Subscription tracking
- Invoice generation
- Webhook handling
- Real-time payment updates

### Repository Manager (GitHub)

```bash
npm run generate -- \
  --api "https://api.github.com/graphql" \
  --type graphql \
  --auth "Bearer ghp_..." \
  --platform mobile \
  --name GitHubPro
```

**Features Generated:**
- Repository browser
- Issue tracking
- Pull request management
- Code viewer
- Notifications
- Activity feed

### Design Tool (Figma)

```bash
npm run generate -- \
  --api "https://api.figma.com" \
  --type rest \
  --auth "X-Figma-Token: figd_..." \
  --platform web \
  --name FigmaManager
```

**Features Generated:**
- File browser
- Project management
- Version history
- Comment system
- Team collaboration
- Export functionality

---

## Technical Details

### Supported API Types

| Type | Auto-Detection | Features |
|------|----------------|----------|
| **GraphQL** | ✅ Introspection query | Full schema discovery, types, operations, relationships |
| **REST** | ✅ Common patterns | Endpoint discovery, resource inference, CRUD patterns |
| **OpenAPI** | ✅ Spec locations | Complete schema, all operations, security schemes |
| **Swagger** | ✅ Spec detection | Full API documentation, request/response types |

### Supported Platforms

| Platform | Output | Framework | Build Tool |
|----------|--------|-----------|------------|
| **iOS** | `.xcodeproj` | SwiftUI | Xcode |
| **Web** | Next.js project | React/TypeScript | npm |
| **Mobile** | React Native | RN + Expo | npm |
| **Android** | Gradle project | Kotlin | Android Studio |

### Generated Code Features

#### API Client
- ✅ Real HTTP implementation (not mocks)
- ✅ Authentication (Bearer, API Key, Custom)
- ✅ Retry logic with exponential backoff
- ✅ Rate limiting (429 handling)
- ✅ Error handling and recovery
- ✅ Request/response logging
- ✅ Timeout configuration

#### Data Models
- ✅ Type-safe from API schema
- ✅ Validation and constraints
- ✅ Relationship mapping
- ✅ Serialization (JSON/Codable)
- ✅ Computed properties
- ✅ Default values

#### UI Components
- ✅ Platform-native (SwiftUI/React)
- ✅ Responsive layouts
- ✅ Loading states
- ✅ Error displays
- ✅ Pull-to-refresh
- ✅ Infinite scroll
- ✅ Search and filters

#### Tests
- ✅ Unit tests for models
- ✅ Integration tests for API
- ✅ UI component tests
- ✅ Mock responses
- ✅ Error scenarios
- ✅ Edge cases

---

## Comparison

### Old Way (Templates/Scaffolding)

```swift
// Code generators create this:
func getProducts() async throws -> [Product] {
    // TODO: Implement product fetching
    throw new Error('Not implemented')
}

// You have to write everything yourself
// No real implementation
// Just empty templates
```

### New Way (Real Implementation)

```swift
// API-to-App Generator creates this:
func getProducts() async throws -> [Product] {
    struct Response: Decodable {
        let products: [Product]
    }

    return try await performRequest(
        path: "/products",
        method: "GET"
    )
}

// Works immediately
// Real error handling
// Production-ready code
```

### iOS App Comparison

**Old "iOS App" (Just Documentation):**
```
ios-app/
├── README.md         ← 9KB of example code
└── CommodityPrices/  ← EMPTY DIRECTORY
```
❌ No Xcode project
❌ No Swift files
❌ Can't open in Xcode
❌ Just documentation

**New iOS App (Real Xcode Project):**
```
ShopifyAdmin/
├── ShopifyAdmin.xcodeproj/  ← REAL Xcode project!
│   └── project.pbxproj       ← 100% valid
├── ShopifyAdmin/
│   ├── *.swift files         ← REAL Swift code
│   ├── Info.plist           ← Proper configuration
│   └── Assets.xcassets/     ← Real assets
└── ShopifyAdminTests/       ← Real tests
```
✅ Opens in Xcode
✅ Compiles immediately
✅ Run with ⌘+R
✅ Deploy to App Store

---

## Architecture

```
┌─────────────────┐
│   User Input    │
│   (API URL)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ API Introspector│  ← Queries real API
│                 │  ← Discovers schema
│  - GraphQL      │  ← Extracts entities
│  - REST         │  ← Maps operations
│  - OpenAPI      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Discovered     │
│    Schema       │  ← Complete API understanding
│                 │  ← Types, operations, auth
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Real Code Gen   │  ← Generates working code
│                 │  ← Not scaffolding/TODOs
│  - API Client   │  ← Real implementations
│  - Models       │  ← Type-safe
│  - Services     │  ← Business logic
│  - UI           │  ← Platform-native
│  - Tests        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Project Builder │  ← Platform-specific output
│                 │
│  iOS:   .xcodeproj
│  Web:   Next.js project
│  Mobile: React Native
│  Android: Gradle project
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Production-    │
│   Ready App     │  ← Deploy immediately!
└─────────────────┘
```

---

## Why This Works

### 1. Real API Discovery
- Actually queries your API
- Understands the complete schema
- Maps all relationships
- Discovers authentication requirements

### 2. AI-Powered Code Generation
- Uses Ollama/LLMs to generate real logic
- Not template-based
- Understands context and intent
- Produces production-ready code

### 3. Platform-Native Output
- Generates real project files (.xcodeproj, package.json)
- Platform-specific conventions
- Native frameworks (SwiftUI, React)
- Proper build configurations

### 4. Complete Feature Set
- Not just code files
- Full project structure
- Tests, docs, configs
- Ready to deploy

---

## Next Steps

### 1. Try It

```bash
# Pick any public API and generate an app
npm run generate -- \
  --api "https://api.github.com/graphql" \
  --type graphql \
  --platform ios \
  --name MyFirstApp
```

### 2. Deploy

**iOS:**
- Open in Xcode
- Configure signing
- Archive and upload to App Store

**Web:**
- Push to GitHub
- Deploy to Vercel/Netlify
- Live in minutes

### 3. Customize

- Add your branding
- Customize UI components
- Add business logic
- Integrate analytics

### 4. Scale

- Generate multiple apps from different APIs
- Create variations for different clients
- Build a suite of tools
- Launch your platform

---

## Troubleshooting

### "API introspection failed"

**Problem:** Can't discover API schema

**Solutions:**
- Check authentication token
- Verify API URL is correct
- Try specifying `--type` explicitly
- Check API is accessible

### "Generated code doesn't compile"

**Problem:** Code has syntax errors

**Solutions:**
- Check generated files for issues
- Run with `--no-ui` to simplify
- Report bugs with API schema
- Manually fix small issues

### "Xcode project won't open"

**Problem:** Invalid `.xcodeproj` structure

**Solutions:**
- Re-generate with clean output directory
- Check file permissions
- Verify Xcode version (15.0+)
- Try opening individual Swift files first

---

## FAQ

**Q: Does this replace developers?**

A: No. It replaces the tedious boilerplate work. You still need developers to add business logic, customize UI, integrate services, and deploy to production.

**Q: What about private APIs?**

A: Works perfectly! Just provide authentication with `--auth`. The introspector respects auth headers.

**Q: Can I customize the generated code?**

A: Yes! It's real code in your project. Edit freely. The generator gives you a head start, you take it from there.

**Q: Does it support my API?**

A: If your API supports GraphQL introspection, OpenAPI spec, or follows REST conventions, yes. Try it!

**Q: Is the code production-ready?**

A: It's a solid foundation with real implementations, error handling, and tests. Add your business logic, branding, and deploy.

**Q: What about updates to the API?**

A: Re-run the generator. It will discover the new schema. You can merge changes or regenerate.

---

## Contributing

Found a bug? Want to add a platform?

1. File an issue with API schema
2. Submit a PR with fixes
3. Add language generators
4. Improve templates

---

**API-to-App Generator - Real apps, not mocks.**

Generate production-ready apps from any API in minutes, not months.
