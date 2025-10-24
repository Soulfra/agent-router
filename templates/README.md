# Cal Code Templates

Code templates that Cal can use when writing new files. These templates provide proven patterns with proper error handling, logging, and structure.

## Available Templates

### 1. `express-server.template.js`
**Use for:** Building web servers, APIs, OAuth redirect servers

**Features:**
- Express.js setup with middleware
- CORS and body-parser configured
- Route structure
- Error handling (404 and 500)
- Start/stop methods

**Placeholders:**
- `{{CLASS_NAME}}` - Replace with actual class name
- `{{ROUTES_PLACEHOLDER}}` - Add custom routes here

**Example usage:**
```javascript
// Cal replaces {{CLASS_NAME}} with OAuthRedirectServer
// Cal replaces {{ROUTES_PLACEHOLDER}} with OAuth routes
```

### 2. `data-processor.template.js`
**Use for:** Data transformation, validation, ETL tasks

**Features:**
- Batch processing with configurable batch size
- Async operations with Promise.allSettled
- Error handling per item
- Stats tracking (processed, succeeded, failed)
- File I/O helpers

**Placeholders:**
- `{{CLASS_NAME}}` - Replace with actual class name
- `{{PROCESS_LOGIC_PLACEHOLDER}}` - Add processing logic
- `{{VALIDATION_LOGIC_PLACEHOLDER}}` - Add validation rules
- `{{TRANSFORM_LOGIC_PLACEHOLDER}}` - Add transformation logic

**Example usage:**
```javascript
// Cal replaces {{CLASS_NAME}} with CookieExtractor
// Cal adds logic to extract cookies from sqlite
```

### 3. `api-client.template.js`
**Use for:** Building integrations with external APIs

**Features:**
- Axios-based HTTP client
- Automatic retries with exponential backoff
- Rate limiting handling (429)
- Network error handling
- Stats tracking

**Placeholders:**
- `{{CLASS_NAME}}` - Replace with actual class name

**Example usage:**
```javascript
// Cal replaces {{CLASS_NAME}} with GoogleSheetsClient
// Adds methods for reading/writing sheets
```

## How Cal Uses Templates

1. **Task Delegator** identifies task type (server, data processor, API client)
2. **Code Writer** selects matching template
3. **Ollama** generates code by:
   - Replacing placeholders with actual names
   - Adding custom logic in placeholder sections
   - Keeping proven patterns (error handling, logging, etc.)
4. **Syntax Validator** checks generated code
5. **Learning System** records if template worked

## Adding New Templates

To add a new template:

1. Create `<name>.template.js`
2. Use `{{PLACEHOLDER}}` syntax for customizable parts
3. Include comprehensive error handling
4. Add JSDoc comments
5. Document in this README

## Template Best Practices

Templates should:
- ✅ Include proper error handling (try-catch, validation)
- ✅ Have logging statements for debugging
- ✅ Use async/await for async operations
- ✅ Include JSDoc comments
- ✅ Export as module.exports
- ✅ Use clear placeholder names
- ❌ Not include TODOs or placeholder comments
- ❌ Not have syntax errors
- ❌ Not use console.log excessively

## Common Placeholders

- `{{CLASS_NAME}}` - Name of the class
- `{{METHOD_NAME}}` - Name of a method
- `{{ROUTES_PLACEHOLDER}}` - Where to add routes
- `{{LOGIC_PLACEHOLDER}}` - Where to add custom logic
- `{{VALIDATION_PLACEHOLDER}}` - Where to add validation
- `{{TRANSFORM_PLACEHOLDER}}` - Where to add data transformation
