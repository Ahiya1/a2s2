# keen API Specification

## Overview

keen provides a comprehensive REST API and WebSocket interface for autonomous development platform access. The API is designed for **multi-tenant isolation**, **real-time streaming**, and **production-grade security**.

## Base URLs

- **Production**: `https://api.keen.dev`
- **Staging**: `https://api.staging.keen.dev`
- **WebSocket**: `wss://ws.keen.dev`

## Authentication

### JWT Token Authentication (Recommended)

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Lifecycle:**
- **Access Token**: 15-minute expiration
- **Refresh Token**: 30-day expiration
- **Automatic Rotation**: Tokens refreshed before expiration

### API Key Authentication

```http
Authorization: ApiKey ak_live_1234567890abcdef
```

**API Key Features:**
- **Scoped Permissions**: Fine-grained access control
- **Rate Limiting**: Configurable per-key limits
- **Usage Tracking**: Detailed analytics per key

### Authentication Endpoints

#### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "email": "developer@example.com",
  "username": "developer123",
  "password": "SecurePassword123!",
  "display_name": "John Developer",
  "subscription_tier": "individual"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "developer@example.com",
    "username": "developer123",
    "display_name": "John Developer",
    "subscription_tier": "individual",
    "email_verified": false,
    "created_at": "2024-01-15T10:30:00Z"
  },
  "tokens": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "rt_1234567890abcdef",
    "expires_in": 900
  }
}
```

#### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "developer@example.com",
  "password": "SecurePassword123!",
  "mfa_token": "123456" // Optional TOTP token
}
```

#### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "rt_1234567890abcdef"
}
```

#### Create API Key

```http
POST /auth/api-keys
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "Production API Key",
  "scopes": ["agents:execute", "sessions:read", "credits:read"],
  "rate_limit_per_hour": 1000,
  "expires_at": "2025-01-15T00:00:00Z" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "api_key": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "key": "ak_live_1234567890abcdef", // Only shown once
    "name": "Production API Key",
    "scopes": ["agents:execute", "sessions:read", "credits:read"],
    "rate_limit_per_hour": 1000,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

## Agent Execution API

### Execute Agent

**Create and execute an autonomous agent with vision-driven task completion.**

```http
POST /agents/execute
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "vision": "Create a React TypeScript todo app with authentication, real-time updates, and comprehensive tests",
  "working_directory": "/tmp/my-project",
  "options": {
    "max_iterations": 50,
    "cost_budget": 25.00,
    "enable_web_search": true,
    "enable_streaming": true,
    "starting_phase": "EXPLORE"
  },
  "webhook_url": "https://your-app.com/webhook/agent-complete" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "session_id": "session_1234567890",
    "status": "running",
    "current_phase": "EXPLORE",
    "vision": "Create a React TypeScript todo app...",
    "working_directory": "/tmp/my-project",
    "git_branch": "main",
    "estimated_cost": 2.50,
    "streaming_url": "wss://ws.keen.dev/sessions/session_1234567890",
    "created_at": "2024-01-15T10:30:00Z"
  },
  "credit_reserved": 25.00,
  "estimated_completion": "2024-01-15T11:00:00Z"
}
```

### Get Session Status

```http
GET /agents/sessions/{session_id}
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "session_id": "session_1234567890",
    "status": "running",
    "current_phase": "SUMMON",
    "phase_started_at": "2024-01-15T10:45:00Z",
    "progress": {
      "phase_progress": 0.75,
      "overall_progress": 0.45,
      "current_action": "Spawning authentication agent",
      "agents_spawned": 3,
      "agent_tree": {
        "main": {
          "status": "running",
          "phase": "SUMMON",
          "children": {
            "summon-A": {
              "status": "completed",
              "phase": "COMPLETE",
              "purpose": "Authentication system"
            },
            "summon-B": {
              "status": "running",
              "phase": "PLAN",
              "purpose": "Database layer",
              "children": {
                "summon-B-A": {
                  "status": "running",
                  "phase": "COMPLETE",
                  "purpose": "Schema design"
                }
              }
            }
          }
        }
      }
    },
    "metrics": {
      "iteration_count": 15,
      "tool_calls_count": 47,
      "total_cost": 3.75,
      "tokens_used": 125000,
      "files_created": ["src/App.tsx", "src/auth/login.tsx"],
      "files_modified": ["package.json", "src/index.tsx"]
    },
    "git_operations": [
      {
        "type": "branch",
        "branch": "summon-A",
        "timestamp": "2024-01-15T10:35:00Z",
        "message": "Created branch for authentication agent"
      },
      {
        "type": "commit",
        "branch": "summon-A",
        "hash": "abc123def",
        "message": "Implement JWT authentication system",
        "files_changed": ["src/auth/jwt.ts", "src/middleware/auth.ts"]
      }
    ]
  }
}
```

### Cancel Session

```http
POST /agents/sessions/{session_id}/cancel
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "reason": "User requested cancellation"
}
```

### List User Sessions

```http
GET /agents/sessions?status=running&limit=20&offset=0
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "session_id": "session_1234567890",
      "status": "running",
      "current_phase": "SUMMON",
      "vision": "Create a React TypeScript todo app...",
      "total_cost": 3.75,
      "created_at": "2024-01-15T10:30:00Z",
      "last_activity_at": "2024-01-15T10:47:23Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

## Credit Management API

### Get Credit Balance

```http
GET /credits/balance
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "balance": {
    "current_balance": 147.50,
    "reserved_balance": 25.00, // Credits reserved for active sessions
    "available_balance": 122.50,
    "lifetime_purchased": 500.00,
    "lifetime_spent": 352.50,
    "daily_limit": 100.00,
    "daily_used": 23.75,
    "auto_recharge_enabled": true,
    "auto_recharge_threshold": 20.00
  }
}
```

### Purchase Credits

```http
POST /credits/purchase
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "amount": 100.00,
  "payment_method_id": "pm_1234567890", // Stripe payment method ID
  "description": "Credit top-up"
}
```

### Get Transaction History

```http
GET /credits/transactions?limit=50&type=usage
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "type": "usage",
      "amount": -3.75,
      "balance_after": 147.50,
      "description": "Agent execution - session_1234567890",
      "session_id": "session_1234567890",
      "created_at": "2024-01-15T10:47:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440004",
      "type": "purchase",
      "amount": 100.00,
      "balance_after": 151.25,
      "description": "Credit purchase via Stripe",
      "stripe_payment_intent_id": "pi_1234567890",
      "created_at": "2024-01-15T09:15:00Z"
    }
  ],
  "pagination": {
    "total": 127,
    "limit": 50,
    "offset": 0
  }
}
```

## Real-time WebSocket API

### Connection

```javascript
const ws = new WebSocket('wss://ws.keen.dev/sessions/{session_id}?token={access_token}');

// Or connect to user-level events
const userWs = new WebSocket('wss://ws.keen.dev/user?token={access_token}');
```

### Message Format

```json
{
  "event_type": "phase_transition",
  "timestamp": "2024-01-15T10:47:23.456Z",
  "session_id": "session_1234567890",
  "data": {
    "from_phase": "EXPLORE",
    "to_phase": "PLAN",
    "summary": "Project analysis completed successfully",
    "confidence": 0.85,
    "key_findings": [
      "Detected React TypeScript project structure",
      "Found existing authentication scaffolding",
      "Identified test framework: Jest + React Testing Library"
    ],
    "next_actions": [
      "Design component architecture",
      "Plan API integration strategy",
      "Prepare implementation roadmap"
    ]
  }
}
```

### Event Types

#### Phase Transitions

```json
{
  "event_type": "phase_transition",
  "data": {
    "from_phase": "PLAN",
    "to_phase": "SUMMON",
    "summary": "Implementation plan completed",
    "confidence": 0.92,
    "estimated_time_remaining": "15 minutes"
  }
}
```

#### Agent Spawning

```json
{
  "event_type": "agent_spawned",
  "data": {
    "parent_session": "session_1234567890",
    "child_session": "session_1234567891",
    "git_branch": "summon-A",
    "purpose": "Implement authentication system",
    "estimated_duration": "8 minutes"
  }
}
```

#### Git Operations

```json
{
  "event_type": "git_operation",
  "data": {
    "operation": "commit",
    "branch": "summon-A",
    "commit_hash": "abc123def456",
    "message": "Add JWT token validation middleware",
    "files_changed": [
      "src/middleware/auth.ts",
      "src/types/auth.ts"
    ],
    "lines_added": 87,
    "lines_deleted": 12
  }
}
```

#### Tool Executions

```json
{
  "event_type": "tool_execution",
  "data": {
    "tool_name": "write_files",
    "success": true,
    "execution_time_ms": 234,
    "files_affected": [
      "src/components/TodoList.tsx",
      "src/hooks/useTodos.ts"
    ]
  }
}
```

#### Progress Updates

```json
{
  "event_type": "progress_update",
  "data": {
    "phase": "COMPLETE",
    "phase_progress": 0.65,
    "overall_progress": 0.89,
    "current_action": "Running integration tests",
    "tokens_used": 847123,
    "cost_so_far": 12.34,
    "active_agents": 2
  }
}
```

#### Errors and Warnings

```json
{
  "event_type": "error",
  "data": {
    "severity": "warning",
    "message": "TypeScript compilation warning in src/utils/api.ts",
    "details": {
      "file": "src/utils/api.ts",
      "line": 23,
      "column": 15,
      "error_code": "TS2339"
    },
    "auto_fix_attempted": true,
    "auto_fix_successful": true
  }
}
```

#### Session Completion

```json
{
  "event_type": "session_complete",
  "data": {
    "success": true,
    "final_phase": "COMPLETE",
    "summary": "React TypeScript todo app created successfully with authentication, real-time updates, and comprehensive tests",
    "files_created": 23,
    "files_modified": 7,
    "tests_run": 45,
    "test_coverage": "94%",
    "total_cost": 18.75,
    "duration_seconds": 1247,
    "agents_spawned": 6,
    "max_recursion_depth": 3,
    "completion_report": {
      "deployment_ready": true,
      "performance_score": "A",
      "security_score": "A+",
      "maintainability_score": "A"
    }
  }
}
```

## Analytics and Monitoring API

### Dashboard Metrics

```http
GET /analytics/dashboard?period=24h
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "metrics": {
    "sessions": {
      "total_started": 15,
      "completed_successfully": 12,
      "failed": 2,
      "cancelled": 1,
      "success_rate": 80.0
    },
    "agents": {
      "total_spawned": 47,
      "max_recursion_depth": 4,
      "avg_agents_per_session": 3.1
    },
    "costs": {
      "total_spent": 127.45,
      "avg_per_session": 8.50,
      "most_expensive_session": 23.75,
      "cost_breakdown": {
        "standard_context": 89.23,
        "extended_context": 38.22
      }
    },
    "tools": {
      "most_used": [
        {"name": "write_files", "count": 145, "success_rate": 98.6},
        {"name": "read_files", "count": 134, "success_rate": 100.0},
        {"name": "run_command", "count": 89, "success_rate": 94.4}
      ]
    },
    "git_operations": {
      "commits": 67,
      "branches_created": 23,
      "merges": 19,
      "conflicts_resolved": 3
    }
  }
}
```

### Usage Analytics

```http
GET /analytics/usage?start_date=2024-01-01&end_date=2024-01-31&granularity=day
Authorization: Bearer {access_token}
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Insufficient credits for this operation. Required: 25.00, Available: 12.50",
    "details": {
      "required_credits": 25.00,
      "available_credits": 12.50,
      "shortfall": 12.50
    },
    "help_url": "https://docs.keen.dev/errors/insufficient-credits"
  },
  "request_id": "req_1234567890abcdef"
}
```

### Common Error Codes

#### Authentication Errors
- `INVALID_TOKEN` (401) - JWT token is invalid or expired
- `INSUFFICIENT_PERMISSIONS` (403) - API key lacks required scopes
- `RATE_LIMITED` (429) - Too many requests, retry after specified time

#### Resource Errors
- `INSUFFICIENT_CREDITS` (402) - Not enough credits for operation
- `SESSION_NOT_FOUND` (404) - Requested session doesn't exist
- `SESSION_LIMIT_EXCEEDED` (409) - Too many concurrent sessions

#### Validation Errors
- `INVALID_VISION` (400) - Vision text is too long or contains invalid content
- `INVALID_WORKING_DIRECTORY` (400) - Working directory path is invalid
- `WORKSPACE_ACCESS_DENIED` (403) - Cannot access specified workspace

#### System Errors
- `AGENT_EXECUTION_FAILED` (500) - Agent encountered unrecoverable error
- `GIT_OPERATION_FAILED` (500) - Git operation failed (merge conflicts, etc.)
- `SERVICE_UNAVAILABLE` (503) - System temporarily unavailable

## Rate Limiting

### Rate Limit Headers

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642262400
X-RateLimit-Window: 3600
```

### Rate Limit Tiers

| Tier | Requests/Hour | Concurrent Sessions | Agent Spawning |
|------|---------------|--------------------|-----------------|
| Individual | 1,000 | 2 | 10 agents/session |
| Team | 5,000 | 10 | 20 agents/session |
| Enterprise | 50,000 | 100 | 50 agents/session |

## SDKs and Integration

### JavaScript/TypeScript SDK

```bash
npm install @keen/sdk
```

```typescript
import { KeenClient } from '@keen/sdk';

const keen = new KeenClient({
  apiKey: 'ak_live_1234567890abcdef',
  // or use JWT authentication
  // accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
});

// Execute an agent
const session = await keen.agents.execute({
  vision: 'Create a React todo app',
  workingDirectory: './my-project',
  options: {
    enableStreaming: true,
    costBudget: 25.00
  }
});

// Listen to real-time updates
session.on('phase_transition', (event) => {
  console.log(`Phase changed: ${event.data.from_phase} -> ${event.data.to_phase}`);
});

session.on('git_operation', (event) => {
  console.log(`Git ${event.data.operation} on ${event.data.branch}`);
});

session.on('complete', (event) => {
  console.log('Session completed:', event.data.summary);
});
```

### Python SDK

```bash
pip install keen-sdk
```

```python
from keen import KeenClient

client = KeenClient(api_key='ak_live_1234567890abcdef')

# Execute agent
session = client.agents.execute(
    vision="Create a Flask API with authentication",
    working_directory="./flask-api",
    options={
        "enable_streaming": True,
        "cost_budget": 30.0
    }
)

# Stream updates
for event in session.stream():
    if event.event_type == 'phase_transition':
        print(f"Phase: {event.data.to_phase}")
    elif event.event_type == 'complete':
        print(f"Completed: {event.data.summary}")
        break
```

### CLI Integration

```bash
# Install keen CLI
npm install -g @keen/cli

# Authenticate
keen auth login

# Execute agent
keen agent execute "Create a Node.js API with TypeScript and tests" \
  --directory ./my-api \
  --budget 20 \
  --stream

# Monitor session
keen session status session_1234567890

# View credit balance
keen credits balance
```

This API specification provides everything needed to integrate with keen's autonomous development platform, supporting both real-time streaming and batch operations while maintaining security and performance at scale.