#!/bin/bash

# Domain Challenge Testing System - Ollama Model Setup
# This script creates 12 domain-specific AI models for the challenge system

echo "🎨 Setting up Domain-Specific Ollama Models..."
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama is not installed. Please install from https://ollama.ai"
    exit 1
fi

echo "✓ Ollama found"
echo ""

# Array of domain models
declare -a models=(
    "soulfra"
    "deathtodata"
    "finishthisidea"
    "dealordelete"
    "saveorsink"
    "cringeproof"
    "finishthisrepo"
    "ipomyagent"
    "hollowtown"
    "hookclinic"
    "businessaiclassroom"
    "roughsparks"
)

# Create each model
for domain in "${models[@]}"; do
    echo "📦 Creating ${domain}-ai model..."

    if ollama create "${domain}-ai" -f "${domain}-model"; then
        echo "✅ ${domain}-ai created successfully"
    else
        echo "❌ Failed to create ${domain}-ai"
        exit 1
    fi

    echo ""
done

echo "🎉 All 12 domain models created!"
echo ""
echo "Available models:"
ollama list | grep -E "(soulfra|deathtodata|finishthisidea|dealordelete|saveorsink|cringeproof|finishthisrepo|ipomyagent|hollowtown|hookclinic|businessaiclassroom|roughsparks)"
echo ""
echo "Test a model with:"
echo "  ollama run soulfra-ai 'Create a simple button component'"
echo ""
