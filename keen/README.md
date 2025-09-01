# keen Database Layer - Phase 1 Complete

**Production-grade multi-tenant PostgreSQL foundation with Anthropic Claude integration for the keen autonomous development platform**

## 🎯 Overview

Phase 1 implements a comprehensive database layer with **full Anthropic Claude integration**:

- **Multi-tenant PostgreSQL architecture** with complete user isolation
- **1M Context Window** - All agents use full 1,000,000 token context
- **Interleaved Thinking** - Advanced reasoning with thinking blocks
- **Admin user** (ahiya.butman@gmail.com) with unlimited privileges and bypass logic
- **Credit management system** with accurate 5x markup over Claude API costs
- **Row-level security** for tenant isolation
- **Model evolution support** - Ready for Claude 4 migration
- **Comprehensive testing suite** with 80%+ coverage requirement
- **Shell-first validation** approach with direct command verification

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Configure database and Anthropic credentials
# Edit .env with your settings:
# - PostgreSQL connection details
# - ANTHROPIC_API_KEY=sk-ant-your-api-key-here
# - CLAUDE_MODEL=claude-sonnet-4-20250514
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Database Setup

```bash
# Run migrations (create schema)
npm run db:migrate

# Run seeds (create admin user)
npm run db:seed

# Or run both
npm run db:reset
```

### 5. Validate Platform

```bash
# Run comprehensive validation
chmod +x scripts/validate.sh
./scripts/validate.sh

# Or validate programmatically
node -e "import('./src/index.js').then(async m => console.log(await m.default.validatePlatform()))"
```

## 🤖 Anthropic Integration

### Core Features

- **1M Context Window** - Full 1,000,000 token context for sophisticated reasoning
- **Interleaved Thinking** - Advanced reasoning with thinking blocks
- **Model Flexibility** - Support for current Claude 3.5 and future Claude 4
- **Cost Accuracy** - Precise cost calculation with 5x markup for keen credits
- **Production Ready** - Complete validation and error handling

### Usage Example

```typescript
import { keen, AnthropicConfigManager } from "./src/index.js";

// Initialize with Anthropic integration
const platform = keen.getInstance();
await platform.initialize();

// Get Anthropic configuration
const anthropic = platform.getAnthropicConfigManager();
console.log("Model:", anthropic.getConfig().model);
console.log("Extended Context:", anthropic.getConfig().enableExtendedContext);
console.log("Thinking Enabled:", anthropic.getConfig().enableInterleaved);

// Calculate costs for agent execution
const cost = anthropic.calculateRequestCost(
  300000, // input tokens (triggers extended pricing)
  10000, // output tokens
  5000 // thinking tokens
);

console.log("Claude API Cost:", cost.totalCost);
console.log("keen Credit Cost:", cost.keenCreditCost); // 5x markup
```

## 🏗️ Architecture

### Database Layer (7 Core Tables)

1. **`users`** - User management with admin privilege support
2. **`auth_tokens`** - JWT and API key management with admin bypass
3. **`credit_accounts`** - Credit balances with unlimited admin credits
4. **`credit_transactions`** - Immutable transaction log with admin bypass tracking
5. **`agent_sessions`** - Agent execution tracking with thinking blocks
6. **`websocket_connections`** - Real-time streaming support
7. **`daily_analytics`** - Admin dashboard metrics

### Anthropic Integration

- **AnthropicConfigManager** - Complete configuration management
- **1M Context Validation** - Ensures all agents use full context window
- **Cost Calculation** - Accurate pricing with standard/extended tiers
- **Beta Headers** - Automatic inclusion of required headers
- **Model Evolution** - Support for current and future Claude models

### Admin User Configuration

- **Email:** ahiya.butman@gmail.com
- **Password:** 2con-creator
- **Role:** super_admin
- **Privileges:**
  - Unlimited credits (no deductions)
  - Bypass all rate limits
  - Access all analytics and user data
  - Priority execution queue
  - Complete audit trail visibility

### Credit System (5x Markup)

```
Claude API Cost → ×5 Markup → keen Credits

Standard Context (≤200K tokens):
- Input: $0.015 per 1K tokens (Claude: $0.003 × 5)
- Output: $0.075 per 1K tokens (Claude: $0.015 × 5)

Extended Context (>200K tokens, 1M window):
- Input: $0.030 per 1K tokens (Claude: $0.006 × 5)
- Output: $0.1125 per 1K tokens (Claude: $0.0225 × 5)

Admin bypass: $0.00 (tracked but not charged)
```

## 📋 Complete Usage Examples

### Database Operations

```typescript
import { keen } from "./src/index.js";

// Initialize database
await keen.initialize();

// Create regular user
const user = await keen.users.createUser({
  email: "developer@example.com",
  username: "developer",
  password: "securepassword123",
});

// Create credit account with 1M context pricing
const creditAccount = await keen.credits.createCreditAccount(user.id);

// Add credits
await keen.credits.addCredits({
  userId: user.id,
  amount: new Decimal("100.00"),
  description: "Initial credit purchase",
});
```

### Agent Session with Thinking

```typescript
// Create agent session with 1M context
const session = await keen.sessions.createSession(
  user.id,
  {
    sessionId: "unique-session-id",
    gitBranch: "main",
    vision: "Implement authentication system with thinking blocks",
    workingDirectory: "/workspace/project",
    agentOptions: {
      contextWindow: 1000000,
      thinkingEnabled: true,
    },
  },
  userContext
);

// Store thinking block
const thinkingBlock = {
  id: "thinking-1",
  timestamp: new Date(),
  phase: "EXPLORE",
  thinking_content: "I need to analyze the project structure first...",
  context: { current_task: "authentication", confidence_level: 0.85 },
  decision_made: {
    action: "explore_files",
    reasoning: "Understanding structure",
  },
};

await keen.sessions.updateSession(
  session.id,
  {
    thinkingBlock,
    currentPhase: "EXPLORE",
    tokensUsed: 45000, // Extended context usage
  },
  userContext
);
```

### Admin Operations

```typescript
// Admin login
const adminLogin = await keen.users.login({
  email: "ahiya.butman@gmail.com",
  password: "2con-creator",
});

const adminContext = {
  userId: adminLogin.user.id,
  isAdmin: true,
  adminPrivileges: adminLogin.user.admin_privileges,
};

// Admin agent execution (no credit deduction)
const adminTransaction = await keen.credits.deductCredits(
  {
    userId: adminContext.userId,
    claudeCostUSD: new Decimal("15.00"), // Large 1M context operation
    description: "Admin agent execution with 1M context",
  },
  adminContext
);
// Result: is_admin_bypass=true, amount=0, no actual charge

// Get platform analytics (admin only)
const analytics = await keen.analytics.getPlatformMetrics(adminContext);
console.log("Total Claude API costs:", analytics.totalClaudeCosts);
console.log("Total keen revenue (5x):", analytics.totalRevenue);
```

## 🔧 Configuration Management

### Environment Variables

```bash
# Database
DB_HOST=localhost
DB_NAME=keen_development
DB_USER=keen_user
DB_PASSWORD=secure_password

# Anthropic (Required)
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Model Configuration (Optional)
CLAUDE_MODEL=claude-sonnet-4-20250514  # Default latest

# Admin Configuration
ADMIN_EMAIL=ahiya.butman@gmail.com
ADMIN_PASSWORD=2con-creator

# Credit System
CREDIT_MARKUP_MULTIPLIER=5.0
```

### Anthropic Configuration

```typescript
// Custom configuration
const customConfig = {
  model: "claude-sonnet-4-20250514", // Future model
  maxTokens: 20000,
  thinkingBudget: 15000,
  enableExtendedContext: true, // Always true in keen
  enableInterleaved: true, // Always true in keen
  enableWebSearch: true,
  enableStreaming: true,
};

const keen = new KeenPlatform(undefined, customConfig);
```

## 🧪 Testing

### Test Coverage Requirements (80%+)

```bash
# Run all tests with coverage
npm test

# Run specific test categories
npm run test:unit        # Fast unit tests with mocks
npm run test:integration # Full database integration tests
npm run test:security    # RLS and privilege testing
npm run test:performance # Concurrent and performance tests

# Test Anthropic integration specifically
npm run test:unit -- AnthropicConfig

# Coverage validation
npm test -- --coverage --reporter=text-summary | grep -E "[8-9][0-9]%|100%"
```

### Shell Validation

```bash
# Comprehensive platform validation
./scripts/validate.sh

# Manual validation steps
psql -U $DB_USER -d $DB_NAME -c "SELECT version();" || echo "DB failed"
node -e "import('./src/index.js').then(async m => {
  const status = await m.default.validatePlatform();
  console.log(status.ready ? '✅ Platform ready' : '❌ Issues:', status.issues);
})"
```

## 🔒 Security Features

### Multi-tenant Isolation

```sql
-- Users can only access their own data
CREATE POLICY user_isolation_policy ON agent_sessions
USING (user_id = current_setting('app.current_user_id')::UUID OR
       current_setting('app.is_admin_user', true)::BOOLEAN = true);
```

### API Key Validation

```typescript
AnthropicConfigManager.validateApiKey("sk-ant-valid-key"); // true
AnthropicConfigManager.validateApiKey("invalid-key"); // false
```

### Admin Privilege System

```typescript
// Admin privileges are checked at every operation
if (context?.isAdmin && context.adminPrivileges?.unlimited_credits) {
  return this.handleAdminBypass(...);
}
```

## 📊 Performance Characteristics

- **Connection Pooling** - Configurable pool size with health monitoring
- **1M Context Optimization** - Intelligent context management and caching
- **Query Optimization** - Indexes on all common query patterns
- **Concurrent Safety** - Atomic transactions with proper locking
- **Memory Efficiency** - Decimal.js for financial precision
- **Extended Context Costs** - Accurate tracking of >200K token pricing

## 🚀 Model Evolution Support

### Current (Late 2024)

- **Primary:** `claude-sonnet-4-20250514` (Latest Claude 3.5)

### Future Migration Path

```bash
# When Claude 4 becomes available
CLAUDE_MODEL=claude-sonnet-4-20250514
```

The system automatically validates model names and provides migration paths.

## 🎯 Phase 1 Success Criteria

### ✅ Database Foundation

- [x] 7 core tables with proper relationships
- [x] Row-level security for multi-tenant isolation
- [x] Admin user with unlimited privileges
- [x] Credit system with 5x markup tracking

### ✅ Anthropic Integration

- [x] AnthropicConfigManager with keen requirements
- [x] 1M context window validation and enforcement
- [x] Interleaved thinking support with beta headers
- [x] Accurate cost calculation with extended pricing
- [x] Model evolution support (Claude 3.5 → Claude 4)

### ✅ Testing & Validation

- [x] Unit tests with mocking
- [x] Integration tests with real database
- [x] Security tests for RLS and admin privileges
- [x] Performance tests for concurrent operations
- [x] Anthropic configuration validation tests
- [x] 80%+ coverage requirement

### ✅ Shell Validation

- [x] Direct shell command validation
- [x] Database connectivity checks
- [x] Schema validation
- [x] Admin user verification
- [x] Anthropic configuration validation
- [x] Test execution validation

## 🔗 Integration Points

### Phase 2 API Gateway

- User authentication endpoints
- Credit validation APIs with accurate Claude pricing
- Admin analytics endpoints
- Rate limiting with admin bypass
- Anthropic configuration validation

### Phase 3 Agent Core

- Session persistence and management
- 1M context window utilization
- Interleaved thinking block storage
- Cost tracking and credit deduction
- Admin session priority handling
- Recursive agent hierarchy support

### Phase 4 WebSocket Streaming

- Real-time connection management
- Thinking block streaming
- Admin monitoring capabilities
- Event routing and filtering

### Phase 5 Dashboard

- Analytics API integration
- Admin interface for user management
- Credit system administration with Claude cost breakdown
- Real-time metrics display
- Anthropic usage analytics

## 📈 Ready for Production

This Phase 1 implementation provides the complete foundation for a production-grade autonomous development platform:

- **Database Layer** - Multi-tenant, secure, scalable
- **Anthropic Integration** - 1M context, thinking blocks, cost optimization
- **Admin Access** - Unlimited usage with comprehensive analytics
- **Cost Management** - Transparent 5x markup with accurate Claude API pricing
- **Model Evolution** - Ready for Claude 4 when available
- **Testing** - Comprehensive validation and monitoring

keen is now ready to scale to support thousands of concurrent users with sophisticated AI capabilities while maintaining security, performance, and cost transparency.

## CLI Commands

keen provides three main CLI commands for autonomous development:

### Quick Start

```bash
# Autonomous execution with natural language
keen breathe "Create a React todo app with TypeScript"

# Execute from vision file  
keen breath -f project-vision.md

# Interactive conversation mode
keen converse
```

### Key Features

- **`keen breathe <vision>`** - Execute autonomous agent with full tool access
- **`keen breath -f <file>`** - Execute tasks from vision files
- **`keen converse`** - Interactive chat mode with 'breathe' synthesis

### Pricing

Claude Sonnet 4 costs with 5x keen markup:
- Standard context: $0.003/$0.015 per 1K tokens (input/output) 
- Extended context: $0.006/$0.0225 per 1K tokens (>200K)
- Admin accounts bypass credit system

For detailed CLI documentation, see [CLI_COMMANDS.md](docs/CLI_COMMANDS.md).

## Recent Updates

- ✅ Fixed all unit tests (AnthropicConfig, UserDAO, CreditDAO)
- ✅ Updated Claude Sonnet 4 pricing (2024/2025 rates)
- ✅ Documented CLI commands: keen breathe, keen breath -f, keen converse  
- ✅ Improved test coverage with mock database support
- ✅ Enhanced environment variable handling for dynamic configuration

