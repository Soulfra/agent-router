# Executable Documentation Example

This file demonstrates how to write executable tests directly in documentation.

## GitHub API Integration

Our system integrates with GitHub to fetch user information and repositories.

### Test: Get User Info

```test:github
GET https://api.github.com/user

assert response.status === 200
assert response.body.login exists
```

### Test: List User Repositories

```test:github
GET https://api.github.com/user/repos

assert response.status === 200
assert response.body.length > 0
```

## Shopify API Integration

We use Shopify's Admin API to manage products in the store.

### Test: Create Product (JSON Format)

```test:shopify
{
  "action": "createProduct",
  "data": {
    "title": "[TEST] Documentation Test Product",
    "body_html": "This is a test product created from executable documentation",
    "vendor": "Test Vendor",
    "product_type": "Test"
  },
  "expect": {
    "status": 201,
    "body.product.id": "exists",
    "body.product.title": "[TEST] Documentation Test Product"
  }
}
```

### Test: Create Product (HTTP Format)

```test:api
POST ${SHOPIFY_STORE_URL}/admin/api/2024-01/products.json
X-Shopify-Access-Token: ${SHOPIFY_ACCESS_TOKEN}
Content-Type: application/json

{
  "product": {
    "title": "[TEST] HTTP Format Product",
    "body_html": "Created using HTTP format test",
    "vendor": "Test Vendor"
  }
}

Expect: 201
Expect: body.product.id exists
```

## Stripe API Integration

Payment processing through Stripe.

### Test: Create Payment Intent

```test:api
POST https://api.stripe.com/v1/payment_intents
Authorization: Bearer ${STRIPE_SECRET_KEY}
Content-Type: application/x-www-form-urlencoded

amount=1000&currency=usd&payment_method_types[]=card

Expect: 200
Expect: body.id exists
Expect: body.amount exists
```

## Running These Tests

To run all tests in this file:

```bash
node lib/executable-docs-runner.js EXECUTABLE-DOCS-EXAMPLE.md
```

To run all tests in the docs directory:

```bash
node lib/executable-docs-runner.js ./docs
```

To run tests and update this file with results:

```bash
node lib/executable-docs-runner.js EXECUTABLE-DOCS-EXAMPLE.md --update-docs
```

## Test Results

When run with `--update-docs`, test results appear as comments above each test block:

```
<!-- ✓ Test passed (last run: 2025-01-15T10:30:00.000Z) -->
```test:github
...
```
```

## Benefits

1. **Living Documentation**: Tests are embedded in docs, keeping them in sync
2. **Multiple Formats**: Support JSON, HTTP, and assertion-based tests
3. **Platform Integration**: Works with Shopify, Stripe, GitHub, Figma, PayPal
4. **Automatic Validation**: Tests run on every doc change
5. **CI/CD Ready**: Exit codes indicate pass/fail for automated testing

## Advanced Features

### Environment Variables

Tests support environment variable substitution:

```test:api
GET ${API_BASE_URL}/endpoint
Authorization: Bearer ${API_TOKEN}
```

### Nested Expectations

Validate nested response fields:

```test:shopify
{
  "action": "getProduct",
  "data": { "id": "12345" },
  "expect": {
    "status": 200,
    "body.product.id": "12345",
    "body.product.variants.0.price": "exists"
  }
}
```

### Assertion Operators

Support for comparison operators:

```test:github
GET https://api.github.com/user/repos

assert response.status === 200
assert response.body.length > 0
assert response.body.length <= 100
```
