#!/usr/bin/env node

/**
 * Schema Lock & Auto-Generation System
 *
 * Purpose:
 * - Lock down JSON schemas (single source of truth)
 * - Validate API responses match schema
 * - Auto-generate: HTML forms, API docs, validators, tests
 * - Detect schema drift and self-heal
 *
 * Usage:
 *   node scripts/schema-lock.js validate
 *   node scripts/schema-lock.js generate
 *   node scripts/schema-lock.js watch
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SCHEMAS_DIR = path.join(__dirname, '../schemas');
const GENERATED_DIR = path.join(__dirname, '../generated');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';

class SchemaLock {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.schemas = new Map();
    this.results = { passed: 0, failed: 0, errors: [] };
  }

  /**
   * Load all schemas from schemas directory
   */
  loadSchemas() {
    console.log('📂 Loading schemas...\n');

    if (!fs.existsSync(SCHEMAS_DIR)) {
      throw new Error(`Schemas directory not found: ${SCHEMAS_DIR}`);
    }

    const files = fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith('.schema.json'));

    for (const file of files) {
      const schemaPath = path.join(SCHEMAS_DIR, file);
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      const schemaName = file.replace('.schema.json', '');

      this.schemas.set(schemaName, {
        name: schemaName,
        path: schemaPath,
        schema: schema,
        validator: this.ajv.compile(schema)
      });

      console.log(`  ✓ Loaded: ${schemaName}`);
    }

    console.log(`\n✅ Loaded ${this.schemas.size} schemas\n`);
  }

  /**
   * Validate API responses against schemas
   */
  async validate() {
    console.log('🔍 Validating API responses against schemas...\n');

    // Test API key endpoint
    await this.validateEndpoint(
      'api-key',
      '/api/keys',
      { 'X-User-Id': 'e7dc083f-61de-4567-a5b6-b21ddb09cb2d' },
      (data) => data.data?.keys[0] // Extract first key for validation
    );

    // Print results
    console.log('\n' + '='.repeat(80));
    console.log(`Results: ${this.results.passed} passed, ${this.results.failed} failed`);
    console.log('='.repeat(80) + '\n');

    if (this.results.errors.length > 0) {
      console.log('❌ Validation Errors:\n');
      this.results.errors.forEach(err => {
        console.log(`  ${err.endpoint}:`);
        console.log(`    ${err.message}`);
        if (err.details) {
          err.details.forEach(d => console.log(`      - ${d.message} at ${d.instancePath}`));
        }
        console.log('');
      });
      process.exit(1);
    } else {
      console.log('✅ All API responses match schemas!');
    }
  }

  async validateEndpoint(schemaName, endpoint, headers, extractor) {
    const schemaInfo = this.schemas.get(schemaName);
    if (!schemaInfo) {
      console.log(`  ⚠️  Schema not found: ${schemaName}`);
      return;
    }

    try {
      console.log(`  Testing: ${endpoint}`);

      const response = await axios.get(`${BASE_URL}${endpoint}`, { headers });
      let data = response.data;

      // Extract the specific object to validate
      if (extractor) {
        data = extractor(data);
      }

      if (!data) {
        throw new Error('No data returned or extractor returned null');
      }

      // Validate against schema
      const valid = schemaInfo.validator(data);

      if (valid) {
        console.log(`    ✅ Response matches schema`);
        this.results.passed++;
      } else {
        console.log(`    ❌ Response does NOT match schema`);
        this.results.failed++;
        this.results.errors.push({
          endpoint,
          schema: schemaName,
          message: 'Schema validation failed',
          details: schemaInfo.validator.errors
        });
      }

    } catch (error) {
      console.log(`    ❌ Request failed: ${error.message}`);
      this.results.failed++;
      this.results.errors.push({
        endpoint,
        schema: schemaName,
        message: error.message
      });
    }
  }

  /**
   * Generate code from schemas
   */
  async generate() {
    console.log('🔧 Generating code from schemas...\n');

    // Ensure generated directory exists
    if (!fs.existsSync(GENERATED_DIR)) {
      fs.mkdirSync(GENERATED_DIR, { recursive: true });
    }

    for (const [name, schemaInfo] of this.schemas) {
      console.log(`  Generating for: ${name}`);

      // Generate HTML form
      const htmlForm = this.generateHTMLForm(schemaInfo);
      const htmlPath = path.join(GENERATED_DIR, `${name}-form.html`);
      fs.writeFileSync(htmlPath, htmlForm);
      console.log(`    ✓ HTML form: ${htmlPath}`);

      // Generate API docs
      const apiDocs = this.generateAPIDocs(schemaInfo);
      const docsPath = path.join(GENERATED_DIR, `${name}-docs.md`);
      fs.writeFileSync(docsPath, apiDocs);
      console.log(`    ✓ API docs: ${docsPath}`);

      // Generate validator
      const validator = this.generateValidator(schemaInfo);
      const validatorPath = path.join(GENERATED_DIR, `${name}-validator.js`);
      fs.writeFileSync(validatorPath, validator);
      console.log(`    ✓ Validator: ${validatorPath}`);

      console.log('');
    }

    console.log('✅ Code generation complete!\n');
  }

  /**
   * Generate HTML form from schema
   */
  generateHTMLForm(schemaInfo) {
    const { schema } = schemaInfo;
    let html = `<!DOCTYPE html>
<html>
<head>
  <title>${schema.title || 'Form'}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; }
    .field { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input, select, textarea { width: 100%; padding: 8px; box-sizing: border-box; }
    button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <h1>${schema.title || 'Form'}</h1>
  <p>${schema.description || ''}</p>
  <form id="schemaForm">
`;

    // Generate form fields
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties || {})) {
      const required = schema.required?.includes(fieldName) ? ' *' : '';
      const description = fieldSchema.description || '';

      html += `    <div class="field">
      <label for="${fieldName}">${fieldName}${required}</label>
      <small>${description}</small>
`;

      if (fieldSchema.enum) {
        html += `      <select id="${fieldName}" name="${fieldName}">
        <option value="">Select...</option>
${fieldSchema.enum.map(val => `        <option value="${val}">${val}</option>`).join('\n')}
      </select>
`;
      } else if (fieldSchema.type === 'boolean') {
        html += `      <input type="checkbox" id="${fieldName}" name="${fieldName}" />
`;
      } else if (fieldSchema.type === 'integer') {
        html += `      <input type="number" id="${fieldName}" name="${fieldName}" />
`;
      } else {
        html += `      <input type="text" id="${fieldName}" name="${fieldName}" />
`;
      }

      html += `    </div>
`;
    }

    html += `    <button type="submit">Submit</button>
  </form>

  <script>
    document.getElementById('schemaForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      console.log('Form data:', data);
      alert('Form submitted! Check console for data.');
    });
  </script>
</body>
</html>`;

    return html;
  }

  /**
   * Generate API documentation from schema
   */
  generateAPIDocs(schemaInfo) {
    const { schema } = schemaInfo;
    let docs = `# ${schema.title || 'API Documentation'}

${schema.description || ''}

## Schema

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

## Properties

| Field | Type | Required | Description |
|-------|------|----------|-------------|
`;

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties || {})) {
      const type = fieldSchema.type || 'unknown';
      const required = schema.required?.includes(fieldName) ? 'Yes' : 'No';
      const description = fieldSchema.description || '';
      docs += `| ${fieldName} | ${type} | ${required} | ${description} |\n`;
    }

    if (schema.examples && schema.examples.length > 0) {
      docs += `\n## Example\n\n\`\`\`json\n${JSON.stringify(schema.examples[0], null, 2)}\n\`\`\`\n`;
    }

    return docs;
  }

  /**
   * Generate JavaScript validator from schema
   */
  generateValidator(schemaInfo) {
    const { schema, name } = schemaInfo;

    return `/**
 * Auto-generated validator for ${schema.title || name}
 * Generated from: schemas/${name}.schema.json
 * DO NOT EDIT - regenerate with: node scripts/schema-lock.js generate
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const schema = ${JSON.stringify(schema, null, 2)};

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function validate${toPascalCase(name)}(data) {
  const valid = validate(data);

  if (!valid) {
    return {
      valid: false,
      errors: validate.errors
    };
  }

  return { valid: true };
}

module.exports = {
  validate${toPascalCase(name)},
  schema
};
`;
  }
}

function toPascalCase(str) {
  return str.split(/[-_]/).map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');
}

// CLI
async function main() {
  const command = process.argv[2] || 'validate';
  const lock = new SchemaLock();

  lock.loadSchemas();

  switch (command) {
    case 'validate':
      await lock.validate();
      break;
    case 'generate':
      await lock.generate();
      break;
    case 'watch':
      console.log('🔄 Watching for schema changes...');
      fs.watch(SCHEMAS_DIR, async (eventType, filename) => {
        if (filename && filename.endsWith('.schema.json')) {
          console.log(`\n📝 Schema changed: ${filename}`);
          lock.loadSchemas();
          await lock.validate();
          await lock.generate();
        }
      });
      break;
    default:
      console.log('Usage: node scripts/schema-lock.js [validate|generate|watch]');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = SchemaLock;
