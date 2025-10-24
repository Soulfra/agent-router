#!/usr/bin/env node

/**
 * Simple Multi-Model API Test
 */

async function testMultiModel() {
  const question = "What is 2+2?";

  console.log("\n🧪 Testing Multi-Model Comparison API\n");
  console.log(`Question: "${question}"\n`);

  try {
    const response = await fetch('http://localhost:5001/api/models/query-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        format: 'json',
        maxTokens: 50,
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (data.success) {
      console.log("✅ Query successful!\n");
      console.log("📊 Summary:");
      console.log(`   Total Models: ${data.summary.totalModels}`);
      console.log(`   Successful: ${data.summary.successful}`);
      console.log(`   Failed: ${data.summary.failed}`);
      console.log(`   Total Time: ${data.summary.totalLatency}ms`);
      console.log(`   Avg Latency: ${data.summary.averageLatency}ms`);
      console.log(`   Total Cost: $${data.summary.totalCost.toFixed(4)}`);

      console.log("\n🎯 Model Responses:");
      data.models.forEach((model, i) => {
        if (model.status === 'success') {
          console.log(`\n${i+1}. ${model.model} (${model.provider})`);
          console.log(`   Response: ${model.response.substring(0, 60)}...`);
          console.log(`   Latency: ${model.latency}ms | Tokens: ${model.tokens}`);
        } else {
          console.log(`\n${i+1}. ${model.model} (${model.provider}) - ERROR`);
          console.log(`   Error: ${model.error}`);
        }
      });

    } else {
      console.error("❌ Query failed:", data.error);
    }

  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testMultiModel();
