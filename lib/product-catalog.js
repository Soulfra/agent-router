/**
 * Product Catalog System
 *
 * Generates product pages with AI-generated descriptions and images.
 * Uses visual-expert model for image generation.
 */

const VisualAssetRenderer = require('./visual-asset-renderer');

class ProductCatalog {
  constructor(ollamaClient, fileOutputService) {
    this.ollamaClient = ollamaClient;
    this.fileOutputService = fileOutputService;
    this.visualRenderer = new VisualAssetRenderer();
  }

  /**
   * Generate complete product page
   */
  async generateProductPage(productConfig) {
    const {
      name,
      category = 'general',
      price_range = 'medium',
      brand_colors = ['#667eea', '#764ba2'],
      description = null
    } = productConfig;

    try {
      // Generate product description using AI
      const generatedDescription = description || await this.generateDescription(name, category);

      // Generate product details using AI
      const details = await this.generateProductDetails(name, category, generatedDescription);

      // Generate HTML page
      const html = this.buildProductHTML({
        name,
        description: generatedDescription,
        price: details.price,
        features: details.features,
        specifications: details.specifications,
        brand_colors
      });

      return {
        name,
        description: generatedDescription,
        price: details.price,
        features: details.features,
        specifications: details.specifications,
        html
      };
    } catch (error) {
      console.error('[ProductCatalog] Failed to generate product page:', error);
      throw error;
    }
  }

  /**
   * Generate product description using AI
   */
  async generateDescription(productName, category) {
    const prompt = `Write a compelling, professional product description for: ${productName}

Category: ${category}

The description should be:
- 2-3 sentences
- Highlight key benefits
- Professional but engaging tone
- Focus on value proposition

Return only the description text, no additional formatting.`;

    try {
      const response = await this.ollamaClient.generate({
        model: 'soulfra-model',
        prompt
      });

      return response.response.trim();
    } catch (error) {
      console.error('[ProductCatalog] Description generation failed:', error);
      return `${productName} - A premium ${category} product designed for excellence.`;
    }
  }

  /**
   * Generate detailed product information
   */
  async generateProductDetails(productName, category, description) {
    const prompt = `Given this product:
Name: ${productName}
Category: ${category}
Description: ${description}

Generate product details in JSON format:
{
  "price": "$XX.XX",
  "features": ["feature 1", "feature 2", "feature 3"],
  "specifications": {
    "Material": "...",
    "Dimensions": "...",
    "Weight": "..."
  }
}`;

    try {
      const response = await this.ollamaClient.generate({
        model: 'soulfra-model',
        prompt,
        format: 'json'
      });

      return JSON.parse(response.response);
    } catch (error) {
      console.error('[ProductCatalog] Details generation failed:', error);
      return {
        price: '$99.99',
        features: ['High quality', 'Durable design', 'Easy to use'],
        specifications: {
          'Material': 'Premium materials',
          'Warranty': '1 year'
        }
      };
    }
  }

  /**
   * Build HTML product page
   */
  buildProductHTML(config) {
    const {
      name,
      description,
      price,
      features,
      specifications,
      brand_colors
    } = config;

    const [color1, color2] = brand_colors;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} - Product Page</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, ${color1} 0%, ${color2} 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    .product-header {
      background: linear-gradient(135deg, ${color1} 0%, ${color2} 100%);
      padding: 60px 40px;
      text-align: center;
      color: white;
    }

    .product-header h1 {
      font-size: 3em;
      margin-bottom: 20px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .product-header .price {
      font-size: 2.5em;
      font-weight: bold;
      margin-top: 20px;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .product-body {
      padding: 60px 40px;
    }

    .section {
      margin-bottom: 40px;
    }

    .section h2 {
      font-size: 2em;
      margin-bottom: 20px;
      color: #2c3e50;
      border-bottom: 3px solid ${color1};
      padding-bottom: 10px;
    }

    .description {
      font-size: 1.2em;
      line-height: 1.8;
      color: #555;
    }

    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .feature-card {
      background: linear-gradient(135deg, ${color1}15 0%, ${color2}15 100%);
      padding: 25px;
      border-radius: 12px;
      border-left: 4px solid ${color1};
    }

    .feature-card::before {
      content: "✓";
      display: inline-block;
      width: 30px;
      height: 30px;
      background: ${color1};
      color: white;
      border-radius: 50%;
      text-align: center;
      line-height: 30px;
      margin-right: 10px;
      font-weight: bold;
    }

    .specifications {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }

    .spec-item {
      display: flex;
      justify-content: space-between;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .spec-label {
      font-weight: bold;
      color: #2c3e50;
    }

    .spec-value {
      color: #555;
    }

    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, ${color1} 0%, ${color2} 100%);
      color: white;
      padding: 20px 50px;
      border-radius: 50px;
      text-decoration: none;
      font-size: 1.2em;
      font-weight: bold;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      margin-top: 30px;
    }

    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
    }

    .footer {
      text-align: center;
      padding: 40px;
      background: #f8f9fa;
      color: #7f8c8d;
    }

    @media (max-width: 768px) {
      .product-header h1 {
        font-size: 2em;
      }

      .product-header .price {
        font-size: 1.8em;
      }

      .features {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="product-header">
      <h1>${name}</h1>
      <p class="description" style="margin-top: 20px; font-size: 1.2em; max-width: 800px; margin-left: auto; margin-right: auto;">
        ${description}
      </p>
      <div class="price">${price}</div>
    </div>

    <div class="product-body">
      <div class="section">
        <h2>Key Features</h2>
        <div class="features">
          ${features.map(feature => `<div class="feature-card">${feature}</div>`).join('\n          ')}
        </div>
      </div>

      <div class="section">
        <h2>Specifications</h2>
        <div class="specifications">
          ${Object.entries(specifications).map(([key, value]) => `
          <div class="spec-item">
            <span class="spec-label">${key}</span>
            <span class="spec-value">${value}</span>
          </div>`).join('\n          ')}
        </div>
      </div>

      <div class="section" style="text-align: center;">
        <a href="#buy" class="cta-button">Buy Now</a>
      </div>
    </div>

    <div class="footer">
      <p>Generated with CALOS Agent Router | Product Catalog System</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generate product catalog (multiple products)
   */
  async generateCatalog(products, catalogConfig = {}) {
    const {
      catalog_name = 'Product Catalog',
      brand_colors = ['#667eea', '#764ba2']
    } = catalogConfig;

    const generatedProducts = [];

    for (const productConfig of products) {
      const product = await this.generateProductPage({
        ...productConfig,
        brand_colors
      });
      generatedProducts.push(product);
    }

    // Generate catalog index page
    const catalogHTML = this.buildCatalogHTML(catalog_name, generatedProducts, brand_colors);

    return {
      catalog_name,
      products: generatedProducts,
      catalog_html: catalogHTML
    };
  }

  /**
   * Build catalog index HTML
   */
  buildCatalogHTML(catalogName, products, brandColors) {
    const [color1, color2] = brandColors;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${catalogName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, ${color1} 0%, ${color2} 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }

    .header {
      text-align: center;
      color: white;
      margin-bottom: 60px;
    }

    .header h1 {
      font-size: 3.5em;
      text-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    }

    .catalog-grid {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 30px;
    }

    .product-card {
      background: white;
      border-radius: 15px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .product-card:hover {
      transform: translateY(-10px);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
    }

    .product-card-header {
      background: linear-gradient(135deg, ${color1} 0%, ${color2} 100%);
      padding: 40px 20px;
      text-align: center;
      color: white;
    }

    .product-card-header h2 {
      font-size: 1.8em;
      margin-bottom: 10px;
    }

    .product-card-body {
      padding: 30px;
    }

    .product-description {
      color: #555;
      line-height: 1.6;
      margin-bottom: 20px;
    }

    .product-price {
      font-size: 2em;
      font-weight: bold;
      color: ${color1};
      margin: 20px 0;
    }

    .view-button {
      display: block;
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, ${color1} 0%, ${color2} 100%);
      color: white;
      text-align: center;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      transition: opacity 0.3s ease;
    }

    .view-button:hover {
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${catalogName}</h1>
    <p style="font-size: 1.3em; margin-top: 20px;">Explore our premium collection</p>
  </div>

  <div class="catalog-grid">
    ${products.map(product => `
    <div class="product-card">
      <div class="product-card-header">
        <h2>${product.name}</h2>
      </div>
      <div class="product-card-body">
        <p class="product-description">${product.description}</p>
        <div class="product-price">${product.price}</div>
        <a href="#" class="view-button">View Details</a>
      </div>
    </div>
    `).join('\n    ')}
  </div>
</body>
</html>`;
  }
}

module.exports = ProductCatalog;
