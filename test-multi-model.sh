#!/bin/bash

# Test Multi-Model Comparison System

echo "Testing Multi-Model Query API..."
echo ""

# Test 1: List all available models
echo "1. Listing all 22 models:"
curl -s http://localhost:5001/api/models/list | jq '.count, .models[] | {provider, name, cost}'

echo ""
echo "2. Querying all models (JSON format):"
curl -s -X POST http://localhost:5001/api/models/query-all \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is the capital of France?",
    "format": "json",
    "maxTokens": 100,
    "temperature": 0.7
  }' | jq '.summary'

echo ""
echo "3. Open browser UI at: http://localhost:5001/model-grid.html"
