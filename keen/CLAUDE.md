# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Start development server (API Gateway)
npm run dev

# Start development with database
npm run dev:db

# Build TypeScript
npm run build

# Run production server
npm start
```

### Testing
```bash
# Run all tests with coverage
npm test

# Run specific test categories
npm run test:unit              # Unit tests only
npm run test:api                # API tests
npm run test:integration:db     # Integration tests (requires PostgreSQL)
npm run test:security:db        # Security tests (requires PostgreSQL)
npm run test:performance:db     # Performance tests (requires PostgreSQL)

# Run a single test file
npm test -- path/to/test.ts
```

### Database Management
```bash
# Run database migrations
npm run db:migrate

# Seed database (creates admin user)
npm run db:seed

# Reset database (migrate + seed)
npm run db:reset
```

### Code Quality
```bash
# Lint TypeScript files
npm run lint

# Format code with Prettier
npm run format

# Validate everything (build + tests)
npm run validate
```

### Validation Scripts
```bash
# Run comprehensive platform validation
./scripts/validate.sh

# Run Phase 2 API Gateway validation
./scripts/validate-phase2.sh
```

## Architecture

### Core Platform Design
**keen** is a production-grade autonomous development platform with three main layers:

1. **Database Layer** (`src/database/`)
   - Multi-tenant PostgreSQL with Row-Level Security (RLS)
   - 7 core tables: users, auth_tokens, credit_accounts, credit_transactions, agent_sessions, websocket_connections, daily_analytics
   - Admin user (ahiya.butman@gmail.com) with unlimited privileges
   - Credit system with 5x markup over Claude API costs
   - DAOs handle all database operations with UserContext for multi-tenancy

2. **API Gateway** (`src/api/`)
   - Express server with JWT authentication and API key support
   - WebSocket support for real-time streaming
   - Rate limiting with admin bypass
   - Comprehensive audit logging
   - Routes: `/api/v1/auth`, `/api/v1/agents`, `/api/v1/credits`, `/api/v1/admin`

3. **Agent Core** (Phase 3 - In Progress)
   - Pure agent execution system maintaining complete agent purity
   - Recursive git-based agent spawning with workspace isolation
   - 1M context window utilization for all agents
   - Sequential execution model (prevents merge conflicts)
   - Phase-driven lifecycle: EXPLORE → PLAN → SUMMON → COMPLETE

### Key Principles

**Agent Purity**: Agents must never be aware of user identity, credits, billing, or multi-tenant concerns. They only know their task, workspace, and available tools.

**Anthropic Integration**: 
- Model: claude-sonnet-4-20250514 (configurable via CLAUDE_MODEL env var)
- 1M context window always enabled
- Interleaved thinking blocks supported
- Cost tracking with extended context pricing (>200K tokens)

**Multi-tenancy**: Complete user isolation via PostgreSQL RLS policies. Admin users can access all data.

### Database Schema
The database uses PostgreSQL with strict foreign key relationships and RLS policies. Key features:
- UUID primary keys for all tables
- Automatic updated_at timestamps via triggers
- Credit validation triggers preventing negative balances
- Comprehensive indexes for query performance
- Admin bypass tracking in credit_transactions

### API Authentication Flow
1. User login via `/api/v1/auth/login` returns JWT tokens
2. Access token (15min) used for API requests
3. Refresh token (7 days) for token renewal
4. API keys available for programmatic access
5. Admin users bypass rate limits and credit checks

### Testing Strategy
- Unit tests use mocked database connections
- Integration tests require real PostgreSQL instance
- Test coverage requirement: 80%+ 
- Security tests validate RLS and admin privileges
- Performance tests check concurrent operations

## Environment Configuration

Required environment variables (see `.env.example`):
```bash
# Database
DB_HOST=localhost
DB_NAME=keen_development
DB_USER=keen_user
DB_PASSWORD=secure_password

# Anthropic (Required)
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# Optional
CLAUDE_MODEL=claude-sonnet-4-20250514
ADMIN_EMAIL=ahiya.butman@gmail.com
ADMIN_PASSWORD=2con-creator
CREDIT_MARKUP_MULTIPLIER=5.0
```

## Project Structure

```
src/
├── api/              # API Gateway (Phase 2)
│   ├── middleware/   # Auth, rate limiting, error handling
│   ├── routes/       # REST endpoints
│   ├── services/     # Business logic services
│   └── websocket/    # WebSocket management
├── config/           # Configuration management
│   ├── AnthropicConfig.ts  # Claude API configuration
│   └── database.ts          # Database config
├── database/         # Database Layer (Phase 1)
│   ├── dao/          # Data Access Objects
│   ├── migrations/   # SQL migration files
│   └── seeds/        # Database seeding
├── types/            # TypeScript type definitions
└── index.ts          # Main platform export
```

## Development Workflow

1. Always run `npm run build` before running tests or starting the server
2. Use `npm run dev` for hot-reload development
3. Database migrations are in `src/database/migrations/*.sql`
4. API routes follow RESTful conventions with consistent error responses
5. All async operations use proper error handling with try-catch blocks
6. Credit operations always track Claude API costs with 5x markup

## Common Tasks

### Adding a New API Endpoint
1. Create route handler in `src/api/routes/`
2. Add authentication middleware if required
3. Implement service logic in `src/api/services/`
4. Add audit logging for security-sensitive operations
5. Write tests in `tests/api/`

### Modifying Database Schema
1. Create new migration file in `src/database/migrations/`
2. Update corresponding DAO in `src/database/dao/`
3. Run `npm run db:migrate` to apply changes
4. Update tests to cover new functionality

### Working with Credits
- All credit operations go through CreditDAO
- Admin users have unlimited_credits flag (no deductions)
- Claude API costs are multiplied by 5 for keen credits
- Extended context (>200K tokens) has different pricing tier

## Testing Guidelines

- Mock external dependencies (database, Anthropic API) in unit tests
- Use `UserContext` for multi-tenant testing scenarios
- Test both success and error paths
- Validate admin bypass logic separately
- Check rate limiting behavior with different user roles

## Security Considerations

- Never expose user IDs or internal database IDs in API responses
- Always validate input with express-validator
- Use parameterized queries to prevent SQL injection
- Implement proper CORS headers for production
- Audit log all authentication and credit operations
- Enforce RLS policies at database level