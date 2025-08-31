# keen Database Layer - Phase 1

**Production-grade multi-tenant PostgreSQL foundation for the keen autonomous development platform**

## 🎯 Overview

Phase 1 implements a comprehensive database layer with:

- **Multi-tenant PostgreSQL architecture** with complete user isolation
- **Admin user** (ahiya.butman@gmail.com) with unlimited privileges and bypass logic
- **Credit management system** with 5x markup over Claude API costs
- **Row-level security** for tenant isolation
- **Comprehensive testing suite** with 80%+ coverage requirement
- **Shell-first validation** approach with direct command verification

## 🏗️ Architecture

### Core Tables (7 total)

1. **`users`** - User management with admin privilege support
2. **`auth_tokens`** - JWT and API key management with admin bypass
3. **`credit_accounts`** - Credit balances with unlimited admin credits
4. **`credit_transactions`** - Immutable transaction log with admin bypass tracking
5. **`agent_sessions`** - Agent execution tracking with recursive spawning
6. **`websocket_connections`** - Real-time streaming support
7. **`daily_analytics`** - Admin dashboard metrics

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

Example:
- Claude cost: $10.00
- keen credits: $50.00 (10.00 × 5)
- Admin bypass: $0.00 (tracked but not charged)
```

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Configure database credentials
# Edit .env with your PostgreSQL settings
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

### 5. Run Tests

```bash
# Run all tests with coverage
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:security
npm run test:performance
```

### 6. Validation

```bash
# Run comprehensive validation
chmod +x scripts/validate.sh
./scripts/validate.sh
```

## 📋 Shell-First Validation

As required, all validation uses direct shell commands:

```bash
# Database connection validation
psql -U $DB_USER -d $DB_NAME -c "SELECT version();" || { echo "DB connection failed"; exit 1; }

# Schema validation
psql -U $DB_USER -d $DB_NAME -c "\dt" | grep -q "users" || { echo "Users table missing"; exit 1; }

# Admin user validation
psql -U $DB_USER -d $DB_NAME -c "SELECT COUNT(*) FROM users WHERE email='ahiya.butman@gmail.com' AND is_admin=true;" | grep -q "1" || { echo "Admin user missing"; exit 1; }

# Test execution validation
npm test --silent || { echo "Tests failed"; exit 1; }

# Coverage validation
npm test -- --coverage | grep -E "All files.*[8-9][0-9]%|All files.*100%" || { echo "Coverage below 80%"; exit 1; }
```

## 🔧 Usage Examples

### Basic User Operations

```typescript
import { keen } from './src/index.js';

// Initialize database
await keen.initialize();

// Create regular user
const user = await keen.users.createUser({
  email: 'developer@example.com',
  username: 'developer',
  password: 'securepassword123'
});

// Create credit account
const creditAccount = await keen.credits.createCreditAccount(user.id);

// Add credits
await keen.credits.addCredits({
  userId: user.id,
  amount: new Decimal('100.00'),
  description: 'Initial credit purchase'
});
```

### Admin Operations

```typescript
// Admin login
const adminLogin = await keen.users.login({
  email: 'ahiya.butman@gmail.com',
  password: '2con-creator'
});

const adminContext = {
  userId: adminLogin.user.id,
  isAdmin: true,
  adminPrivileges: adminLogin.user.admin_privileges
};

// Get platform analytics (admin only)
const metrics = await keen.analytics.getPlatformMetrics(adminContext);

// View all users (admin only)
const allUsers = await keen.users.listUsers(100, 0, adminContext);

// Admin credit operations (bypassed)
const adminTransaction = await keen.credits.deductCredits({
  userId: adminContext.userId,
  claudeCostUSD: new Decimal('50.00'),
  description: 'Admin operation'
}, adminContext);
// Result: is_admin_bypass=true, amount=0, no actual charge
```

### Credit Management with 5x Markup

```typescript
const userContext = { userId: user.id, isAdmin: false };

// Deduct credits with 5x markup
const transaction = await keen.credits.deductCredits({
  userId: user.id,
  claudeCostUSD: new Decimal('8.00'), // Claude API cost
  sessionId: 'session-123',
  description: 'Agent execution'
}, userContext);

// Result:
// - Claude cost: $8.00
// - keen credits charged: $40.00 (8.00 × 5)
// - Transaction type: 'usage'
// - Balance deducted: 40.00 credits
```

### Session Management

```typescript
// Create agent session
const session = await keen.sessions.createSession(user.id, {
  sessionId: 'unique-session-id',
  gitBranch: 'main',
  vision: 'Implement authentication system',
  workingDirectory: '/workspace/project',
  agentOptions: { contextWindow: 1000000 }
}, userContext);

// Update session progress
await keen.sessions.updateSession(session.id, {
  currentPhase: 'COMPLETE',
  iterationCount: 5,
  toolCallsCount: 12,
  tokensUsed: 25000,
  executionStatus: 'completed',
  success: true
}, userContext);
```

## 📊 Testing Strategy

### Test Coverage Requirements (80%+)

- **Unit Tests** - Individual component testing with mocking
- **Integration Tests** - Complete workflow testing with real database
- **Security Tests** - Multi-tenant isolation and admin privilege validation
- **Performance Tests** - Concurrent operations and query optimization

### Test Commands

```bash
# Run all tests with coverage report
npm test

# Run specific test categories
npm run test:unit        # Fast unit tests with mocks
npm run test:integration # Full database integration tests
npm run test:security    # RLS and privilege testing
npm run test:performance # Concurrent and performance tests

# Coverage validation
npm test -- --coverage --reporter=text-summary | grep -E "[8-9][0-9]%|100%"
```

## 🔒 Security Features

### Row-Level Security (RLS)

```sql
-- Users can only access their own data
CREATE POLICY user_isolation_policy ON agent_sessions
USING (user_id = current_setting('app.current_user_id')::UUID OR 
       current_setting('app.is_admin_user', true)::BOOLEAN = true);
```

### Multi-tenant Isolation

- Complete workspace separation between users
- Database-level tenant isolation with RLS
- Admin bypass with full audit trail
- Encrypted data at rest and in transit

### Admin Privilege System

```typescript
// Admin privileges are checked at every operation
if (context?.isAdmin && context.adminPrivileges?.unlimited_credits) {
  return this.handleAdminBypass(...);
}
```

## 🎛️ Configuration

### Environment Variables

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=keen_development
DB_USER=keen_user
DB_PASSWORD=secure_password

# Admin Configuration
ADMIN_EMAIL=ahiya.butman@gmail.com
ADMIN_PASSWORD=2con-creator
ADMIN_USERNAME=ahiya_admin

# Credit System
CREDIT_MARKUP_MULTIPLIER=5.0
DEFAULT_DAILY_LIMIT=100.0
DEFAULT_MONTHLY_LIMIT=1000.0

# Security
JWT_SECRET=your-super-secure-jwt-secret-key-here
BCRYPT_ROUNDS=12
```

## 🔧 Database Operations

### Migration Management

```bash
# Run migrations
node dist/database/migrations/run.js

# Run seeds
node dist/database/seeds/run.js

# Combined
npm run db:reset
```

### Health Checks

```bash
# Test database connectivity
node dist/index.js test

# Initialize database
node dist/index.js init
```

## 📈 Performance Characteristics

- **Connection Pooling** - Configurable pool size with health monitoring
- **Query Optimization** - Indexes on all common query patterns
- **Concurrent Safety** - Atomic transactions with proper locking
- **Memory Efficiency** - Decimal.js for financial precision without floating point errors
- **Scalability** - Designed for thousands of concurrent users

## 🎯 Phase 1 Success Criteria

### ✅ Database Schema
- [x] 7 core tables with proper relationships
- [x] Row-level security for multi-tenant isolation
- [x] Admin user with unlimited privileges
- [x] Credit system with 5x markup tracking

### ✅ TypeScript Implementation  
- [x] DatabaseManager with connection pooling
- [x] DAO classes with admin handling
- [x] Multi-tenant user context
- [x] Comprehensive error handling

### ✅ Testing Suite
- [x] Unit tests with mocking
- [x] Integration tests with real database
- [x] Security tests for RLS and admin privileges
- [x] Performance tests for concurrent operations
- [x] 80%+ coverage requirement

### ✅ Shell Validation
- [x] Direct shell command validation
- [x] Database connectivity checks
- [x] Schema validation
- [x] Admin user verification
- [x] Test execution validation

## 🔗 Integration Points

### Phase 2 API Gateway
- User authentication endpoints
- Credit validation APIs
- Admin analytics endpoints
- Rate limiting with admin bypass

### Phase 3 Agent Core
- Session persistence and management
- Cost tracking and credit deduction
- Admin session priority handling
- Recursive agent hierarchy support

### Phase 4 WebSocket Streaming
- Real-time connection management
- Admin monitoring capabilities
- Event routing and filtering

### Phase 5 Dashboard
- Analytics API integration
- Admin interface for user management
- Credit system administration
- Real-time metrics display

## 📝 Development Notes

### Admin User Details
- **Created during seed process**
- **Password**: Uses bcrypt with 12 rounds
- **Privileges**: Stored as JSONB for flexibility
- **Credit Account**: Unlimited credits (unlimited_credits=true)
- **Bypass Logic**: All credit operations bypass deduction

### Credit System Design
- **Atomic Transactions**: Prevents double-spending
- **5x Markup**: Transparent pricing over Claude API costs
- **Admin Tracking**: Full audit trail of bypass operations
- **Financial Precision**: Decimal.js prevents floating point errors

### Multi-tenant Security
- **Complete Isolation**: Users cannot access other user data
- **Admin Override**: Admin can access all data for analytics
- **Context Management**: User context set per connection
- **Audit Trail**: Complete logging of all operations

## 🚀 Ready for Phase 2

This Phase 1 implementation provides the complete database foundation required for:

- **API Gateway** - Authentication, credit validation, admin endpoints
- **Agent Core** - Session persistence, cost tracking, admin bypass
- **WebSocket Layer** - Connection management, admin monitoring
- **Dashboard** - Analytics, user management, admin interface

The database layer is production-ready with comprehensive testing, security, and performance optimization.
