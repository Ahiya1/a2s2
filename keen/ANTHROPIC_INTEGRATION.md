# Anthropic Claude Integration for keen

## Overview

keen now includes comprehensive Anthropic Claude integration with:

- **1M Context Window** - Full 1,000,000 token context for all agents
- **Interleaved Thinking** - Advanced reasoning with thinking blocks
- **Model Evolution Support** - Ready for Claude 4 migration
- **Cost Optimization** - Accurate pricing with 5x markup for credits
- **Production Ready** - Complete validation and testing

## Quick Start

### 1. Environment Setup

```bash
# Add to your .env file
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
CLAUDE_MODEL=claude-sonnet-4-20250514
```

### 2. Basic Usage

```typescript
import { keen, AnthropicConfigManager } from "./src/index.js";

// Initialize keen with Anthropic integration
const keenInstance = keen.getInstance();
await keenInstance.initialize();

// Get Anthropic configuration
const anthropicConfig = keenInstance.getAnthropicConfigManager();
console.log("Model:", anthropicConfig.getConfig().model);
console.log("Beta Headers:", anthropicConfig.getBetaHeaders());

// Validate platform readiness
const status = await keenInstance.validatePlatform();
if (status.ready) {
  console.log("✅ keen ready with 1M context and thinking!");
} else {
  console.error("❌ Issues found:", status.issues);
}
```

### 3. Configuration Options

```typescript
// Custom Anthropic configuration
const customConfig = {
  model: "claude-sonnet-4-20250514", // Future model
  maxTokens: 20000,
  thinkingBudget: 15000,
  enableWebSearch: true,
  enableStreaming: true,
};

const keenWithCustomConfig = new keen(undefined, customConfig);
```

## Configuration Details

### Required Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Optional (with sensible defaults)
CLAUDE_MODEL=claude-sonnet-4-20250514
```

### Core Configuration

```typescript
interface AnthropicConfig {
  // Required
  apiKey: string;
  model: string;

  // Token limits
  maxTokens: number; // Default: 16000
  thinkingBudget: number; // Default: 10000

  // keen requirements (always true)
  enableExtendedContext: boolean; // Forces 1M context
  enableInterleaved: boolean; // Forces thinking blocks

  // Optional features
  enableWebSearch: boolean; // Default: true
  enableStreaming: boolean; // Default: true

  // Advanced settings
  maxRetries: number; // Default: 3
  baseRetryDelay: number; // Default: 1000ms
}
```

### Beta Headers

keen automatically includes required beta headers:

- `interleaved-thinking-2025-05-14` - For thinking blocks
- `context-1m-2025-08-07` - For 1M context window

## Model Evolution

### Current Models (Late 2024)

- **Primary**: `claude-sonnet-4-20250514` (Latest)

### Future Claude 4 Migration

```bash
# When Claude 4 becomes available
CLAUDE_MODEL=claude-sonnet-4-20250514
```

The configuration automatically validates model names and provides warnings for non-optimal choices.

## Cost Management

### Accurate Pricing Calculation

```typescript
const config = new AnthropicConfigManager();

// Calculate costs for a request
const cost = config.calculateRequestCost(
  300000, // input tokens (triggers extended pricing)
  10000, // output tokens
  5000 // thinking tokens
);

console.log("Claude API Cost:", cost.totalCost);
console.log("keen Credit Cost:", cost.keenCreditCost); // 5x markup
console.log("Extended Pricing:", cost.isExtendedPricing);
```

### Pricing Tiers

- **Standard** (≤200K tokens): $3/M input, $15/M output
- **Extended** (>200K tokens): $6/M input, $22.50/M output
- **keen Credits**: 5x markup on all costs

## Usage Examples

### Basic Agent Configuration

```typescript
import { keen, AnthropicConfigManager } from "keen";

class AgentSession {
  constructor(vision: string) {
    this.keen = keen.getInstance();
    this.anthropic = this.keen.getAnthropicConfigManager();

    // Validate requirements
    const validation = this.anthropic.validateKeenRequirements();
    if (!validation.valid) {
      throw new Error(`Configuration issues: ${validation.issues.join(", ")}`);
    }
  }

  async makeRequest(messages: any[]) {
    const requestConfig = this.anthropic.getRequestConfig();
    const headers = this.anthropic.getBetaHeaders();

    // Your Claude API call here with:
    // - requestConfig.model
    // - requestConfig.thinking enabled
    // - headers array for beta features
  }
}
```

### Cost Tracking Integration

```typescript
class CostTracker {
  constructor(private anthropic: AnthropicConfigManager) {}

  async trackUsage(
    inputTokens: number,
    outputTokens: number,
    thinkingTokens: number,
    userId: string
  ) {
    const cost = this.anthropic.calculateRequestCost(
      inputTokens,
      outputTokens,
      thinkingTokens
    );

    // Deduct keen credits (5x markup)
    await keen.credits.deductCredits({
      userId,
      claudeCostUSD: new Decimal(cost.totalCost),
      description: `Agent execution - ${cost.isExtendedPricing ? "Extended" : "Standard"} context`,
    });

    return cost;
  }
}
```

### Admin Analytics

```typescript
// For admin user (ahiya.butman@gmail.com)
class AdminAnalytics {
  async getAnthropicUsage() {
    const status = await keen.getSystemStatus();

    return {
      model: status.anthropic.model,
      extendedContext: status.anthropic.extendedContext,
      thinking: status.anthropic.thinking,
      totalCosts: await this.calculateTotalCosts(),
      keenMarkup: await this.calculateMarkupRevenue(),
    };
  }
}
```

## Validation and Testing

### Configuration Validation

```typescript
// Validate platform is ready
const platform = keen.getInstance();
const validation = await platform.validatePlatform();

if (!validation.ready) {
  console.error("Platform not ready:", validation.issues);
  process.exit(1);
}

console.log("✅ Database ready:", validation.database);
console.log("✅ Anthropic ready:", validation.anthropic);
```

### System Status Monitoring

```typescript
// Get comprehensive system status
const status = await keen.getSystemStatus();

console.log("Platform Status:", {
  database: status.database.connected,
  anthropic: status.anthropic.configured,
  model: status.anthropic.model,
  features: {
    extendedContext: status.anthropic.extendedContext,
    thinking: status.anthropic.thinking,
  },
});
```

### Running Tests

```bash
# Install dependencies
npm install

# Run Anthropic configuration tests
npm run test:unit -- AnthropicConfig

# Run all tests
npm test
```

## Migration Guide

### From Basic Database to Full Integration

1. **Update Dependencies**

   ```bash
   npm install @anthropic-ai/sdk@^0.60.0
   ```

2. **Update Environment**

   ```bash
   # Add to .env
   ANTHROPIC_API_KEY=your-key
   CLAUDE_MODEL=claude-sonnet-4-20250514
   ```

3. **Update Code**

   ```typescript
   // Before
   import { keen } from "./src/index.js";

   // After
   import { keen, AnthropicConfigManager } from "./src/index.js";

   const instance = keen.getInstance();
   const anthropic = instance.getAnthropicConfigManager();
   ```

4. **Validate Configuration**
   ```typescript
   const validation = await keen.validatePlatform();
   if (!validation.ready) {
     throw new Error("Migration incomplete");
   }
   ```

### Preparing for Claude 4

1. **Monitor Anthropic Announcements** for Claude 4 availability

2. **Update Environment Variable**

   ```bash
   CLAUDE_MODEL=claude-4-sonnet-20250315  # Future date
   ```

3. **Test Configuration**

   ```bash
   npm run test:unit -- AnthropicConfig
   ```

4. **Validate Pricing** (costs may change with new model)

## Troubleshooting

### Common Issues

1. **Missing API Key**

   ```
   Error: ANTHROPIC_API_KEY is required
   ```

   Solution: Set `ANTHROPIC_API_KEY` in your environment

2. **Invalid Model Name**

   ```
   Error: Invalid model name 'invalid-model'. keen requires Claude models.
   ```

   Solution: Use valid Claude model name or set `CLAUDE_MODEL`

3. **Configuration Validation Failed**
   ```
   Error: Extended context (1M window) is disabled
   ```
   Solution: This should not happen - keen enforces required features

### Debug Commands

```bash
# Check system status
node -e "import('./src/index.js').then(async m => console.log(await m.default.getSystemStatus()))"

# Validate configuration
node -e "import('./src/index.js').then(async m => console.log(await m.default.validatePlatform()))"

# Test database connection
npm run db:reset
```

## Support

For issues with Anthropic integration:

1. Check environment variables are set correctly
2. Validate API key format (`sk-ant-...`)
3. Run configuration tests: `npm run test:unit -- AnthropicConfig`
4. Check system status as shown above

The integration is designed to be robust and fail fast with clear error messages.
