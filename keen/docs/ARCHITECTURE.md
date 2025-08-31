# keen System Architecture

## High-Level Architecture

```
┏━━━━━━━━━━━━━┓    ┏━━━━━━━━━━━━━━┓    ┏━━━━━━━━━━━━━┓
┃ keen CLI    ┃━━━━┃ API Gateway  ┃━━━━┃ Agent Core  ┃
┃ Dashboard   ┃    ┃ - Auth       ┃    ┃ - Pure      ┃
┃ Mobile App  ┃    ┃ - Credits    ┃    ┃ - Stateless ┃
┗━━━━━━━━━━━━━┛    ┃ - Streaming  ┃    ┃ - 1M Context┃
                   ┃ - Admin      ┃    ┃ - Git-aware ┃
                   ┗━━━━━━━━━━━━━━┛    ┗━━━━━━━━━━━━━┛
                          │
                   ┏━━━━━━━━━━━━━━┓
                   ┃   Database   ┃
                   ┃ - Users      ┃
                   ┃ - Sessions   ┃  
                   ┃ - Credits    ┃
                   ┃ - Analytics  ┃
                   ┗━━━━━━━━━━━━━━┛
```

## Component Responsibilities

### API Gateway Layer

**Primary Purpose:** Handle all business logic and user-facing concerns while keeping agents pure.

#### Authentication & Authorization
- **JWT Token Management** - Issue, validate, and refresh authentication tokens
- **API Key System** - Generate and manage long-lived API keys for programmatic access
- **Multi-Factor Authentication** - Support TOTP, SMS, and hardware keys
- **Admin User Management** - Special handling for ahiya.butman@gmail.com with unlimited privileges
- **Role-Based Access Control** - Different permissions for regular users vs admin
- **Session Management** - Track active sessions with automatic timeout and cleanup

#### Credit Management (No Packages)
- **Balance Tracking** - Real-time credit balance management with atomic operations
- **Usage Monitoring** - Track token consumption with Claude API cost tracking
- **5x Markup Pricing** - Apply 5x multiplier to actual Claude API costs for keen credits
- **Admin Bypass** - Unlimited credits for admin user with bypass transaction logging
- **Budget Limits** - Per-user spending controls with alerts (except admin)
- **Cost Optimization** - Intelligent routing to minimize costs while maintaining quality
- **Pure Credit System** - No subscription packages, only pay-per-use credits

#### Rate Limiting & Abuse Prevention
- **Per-User Limits** - Prevent single users from overwhelming the system
- **Admin Exemptions** - Admin user bypasses all rate limits
- **Concurrent Session Management** - Limit simultaneous agent executions (except admin)
- **Resource Quotas** - Git repository size, file count, and workspace limits  
- **Anomaly Detection** - Identify and block suspicious usage patterns
- **Fair Usage Policies** - Ensure equitable resource distribution

#### Streaming Coordination
- **WebSocket Management** - Maintain real-time connections to dashboard clients
- **Event Routing** - Route agent progress updates to appropriate clients
- **Admin Analytics** - Special streaming endpoints for admin user analytics
- **Connection Multiplexing** - Efficiently handle thousands of concurrent connections
- **Backpressure Handling** - Manage high-volume streaming without data loss
- **Message Persistence** - Store critical events for replay and recovery

#### Request Sanitization & Validation
- **Input Validation** - Sanitize all user inputs before forwarding to agents
- **Vision Filtering** - Block malicious or inappropriate agent instructions
- **File Upload Security** - Scan and validate all uploaded files
- **Command Injection Prevention** - Prevent execution of malicious commands
- **Content Security** - Filter out sensitive data from agent responses
- **Agent Purity Enforcement** - Ensure agents never see business logic or user details

#### Audit Logging & Compliance
- **Complete Operation Trail** - Log every API call, agent execution, and user action
- **Admin Activity Tracking** - Special logging for admin user activities
- **GDPR Compliance** - Handle data retention, deletion, and export requests
- **SOC 2 Requirements** - Maintain security controls and audit trails
- **Credit Transaction Auditing** - Detailed logging of all credit-related operations
- **Incident Response** - Detailed logging for security investigation

### Agent Core Layer

**Primary Purpose:** Execute autonomous development tasks with complete isolation from business logic.

#### Agent Purity Principle
Agents are completely unaware of:
- Credit balances, costs, or billing information (including 5x markup)
- User authentication details and session management  
- Multi-tenant concerns and user isolation
- Business logic and commercial aspects
- Rate limiting and usage restrictions
- Admin privileges or special user status

#### 1M Context Window Implementation
- **Universal 1M Access** - ALL agents use full 1,000,000 token context window
- **Correct Configuration** - Uses 'context-1m-2025-08-07' beta header from a2s2 codebase
- **Model Configuration** - claude-sonnet-4-20250514 with thinking enabled
- **Context Optimization** - Intelligent pruning without reducing window size
- **Thinking Block Preservation** - Maintain reasoning continuity across iterations
- **Cost Transparency** - Gateway tracks extended pricing (>200K tokens) but agents unaware

#### Recursive Spawning Architecture
- **Git Branch Management** - Create and manage isolated branches for each spawned agent
- **Parent-Child Coordination** - Handle communication between agent hierarchies
- **Merge Conflict Resolution** - Intelligent merging with validation and rollback
- **Resource Allocation** - Distribute system resources across agent trees
- **Depth Limiting** - Prevent infinite recursion with configurable limits
- **Admin Session Tracking** - Internal tracking of admin sessions (hidden from agents)

#### Tool Ecosystem Integration
- **File Operations** - Read, write, and modify files with atomic operations and rollback
- **Shell Commands** - Execute system commands with timeout and security constraints
- **Git Integration** - Full git operations with branch management and conflict resolution
- **Web Search** - Access to real-time information and documentation
- **Validation Tools** - Code quality, security, and compliance checking

#### 4-Phase Execution Lifecycle

**EXPLORE Phase:**
- Project structure analysis with intelligent file discovery
- Technology stack detection and compatibility assessment
- Requirements extraction from vision and existing codebase
- Validation and healing of project inconsistencies
- Confidence assessment and next phase determination

**PLAN Phase:**
- Implementation strategy development with risk assessment
- Architecture decisions with technology stack selection
- File structure planning with dependency analysis
- API contract definition with validation rules
- Effort estimation and timeline planning

**SUMMON Phase:**
- Sub-task identification and agent spawning coordination
- Git branch creation and workspace isolation
- Parallel execution management with progress tracking
- Inter-agent communication and state synchronization
- Merge coordination with conflict resolution

**COMPLETE Phase:**
- Implementation execution with comprehensive testing
- Validation and quality assurance with automated checks
- Documentation generation and update
- Final integration and deployment preparation
- Success reporting with detailed metrics

#### Streaming & Progress Reporting
- **Real-time Updates** - Live progress reporting for each phase and operation
- **Git Operation Streaming** - Real-time notifications of commits, merges, and conflicts
- **Error Propagation** - Immediate error reporting with detailed context
- **Performance Metrics** - Continuous tracking of execution performance
- **Agent Tree Visualization** - Live updates of recursive agent hierarchy

### Database Layer

**Primary Purpose:** Provide scalable, secure data persistence for multi-tenant platform with admin capabilities.

#### User Management
- **Authentication Profiles** - Store user credentials, preferences, and authentication methods
- **Admin User Support** - Special handling for ahiya.butman@gmail.com with unlimited privileges
- **Permission Systems** - Role-based access control with admin overrides
- **Team Management** - Multi-user workspace coordination and collaboration
- **Audit Trails** - Complete history of user actions and admin activities

#### Session Tracking
- **Agent Session State** - Persistent storage of agent execution state for resumption
- **Progress Monitoring** - Real-time tracking of agent progress across all phases
- **Admin Session Tracking** - Special tracking for admin user sessions
- **Workspace Isolation** - Complete separation of user workspaces and data
- **Agent Tree State** - Hierarchical agent relationships and coordination state

#### Credit Accounting (5x Markup System)
- **Balance Management** - Atomic credit balance updates with transaction consistency
- **Claude Cost Tracking** - Track actual Claude API costs separately from credit charges
- **5x Markup Application** - Apply consistent 5x multiplier to all Claude costs
- **Admin Bypass Logging** - Track admin usage without credit deductions
- **Transaction History** - Detailed record of all credit usage and purchases
- **Usage Analytics** - Comprehensive reporting on resource utilization
- **No Package Schema** - Pure credit system without subscription tiers

#### Real-time State Management
- **WebSocket State** - Active connection tracking for real-time updates
- **Agent Progress** - Live status updates for dashboard streaming
- **Admin Analytics** - Real-time system metrics for admin dashboard
- **Git Operation Events** - Real-time tracking of repository changes and merges
- **Error State Management** - Immediate error detection and recovery coordination

#### Analytics & Reporting (Admin Access)
- **Usage Metrics** - Comprehensive analytics on agent performance and usage
- **Cost Analytics** - Detailed cost breakdowns with Claude vs credit pricing
- **Performance Monitoring** - System performance metrics and optimization insights
- **Admin Dashboard Data** - Special analytics for admin user oversight
- **Business Intelligence** - Revenue, user engagement, and growth analytics

## Data Flow Architecture

### Request Processing Flow

1. **User Authentication**
   - User submits request with JWT token or API key
   - Gateway validates credentials and extracts user context
   - Check for admin user (ahiya.butman@gmail.com) and apply special privileges
   - Rate limiting and quota checks applied (bypassed for admin)
   - Request sanitization and security validation

2. **Credit & Resource Validation**
   - Check user credit balance against estimated operation cost (5x Claude markup)
   - Admin user bypasses all credit checks (unlimited)
   - Verify resource availability (concurrent sessions, workspace limits)
   - Apply any user-specific rate limiting or restrictions
   - Reserve resources for upcoming agent execution

3. **Workspace Provisioning**
   - Create or resume isolated user workspace
   - Initialize git repository with proper isolation
   - Set up agent environment with user-specific configuration (no admin indication to agent)
   - Apply security constraints and resource limits

4. **Agent Spawning with 1M Context**
   - Create new agent session with sanitized vision/instructions
   - Initialize 1M context window with 'context-1m-2025-08-07' beta header
   - Configure claude-sonnet-4-20250514 with thinking enabled
   - Set up streaming connections for real-time updates
   - Begin autonomous execution in EXPLORE phase

5. **Execution & Monitoring**
   - Agent executes 4-phase lifecycle with recursive spawning capability
   - Real-time progress streamed to dashboard via WebSocket
   - Git operations tracked and visualized in agent tree
   - Credit usage tracked continuously (actual Claude costs + 5x markup)
   - Admin sessions tracked but no credit deductions

6. **Results & Cleanup**
   - Agent completion results validated and processed
   - Credit charges applied atomically to user account (except admin)
   - Log actual Claude costs and applied markup for transparency
   - Session state persisted for potential resumption
   - Workspace cleanup or preservation based on user preferences

### Recursive Agent Coordination

```
Main Agent (Branch: main) - 1M Context
│
├── SUMMON Phase Triggered
│   │
│   ├── Create Branch: summon-A
│   │   ├── Spawn Agent A (Authentication) - 1M Context Inherited
│   │   │   ├── EXPLORE: Analyze auth requirements
│   │   │   ├── PLAN: Design JWT + API key system
│   │   │   ├── SUMMON: Spawn sub-agents
│   │   │   │   ├── Branch: summon-A-A (JWT) - 1M Context
│   │   │   │   └── Branch: summon-A-B (API Keys) - 1M Context
│   │   │   └── COMPLETE: Merge sub-agents
│   │   └── Report completion to parent
│   │
│   ├── Create Branch: summon-B
│   │   ├── Spawn Agent B (Database) - 1M Context Inherited
│   │   └── [Similar recursive pattern]
│   │
│   └── Wait for all sub-agents
│
└── Merge all branches with validation
```

### Real-time Streaming Architecture

```
Agent Execution                 API Gateway                Dashboard Client
│                               │                       │
├── Phase Update              ├── WebSocket Routing    ├── Live Updates
├── Git Operation             ├── Event Filtering      ├── Agent Tree Viz
├── Progress Report           ├── User Isolation       ├── Progress Indicators
├── 1M Context Usage          ├── Admin Analytics      ├── Cost Tracking (5x)
├── Error/Warning             ├── Rate Limiting        ├── Error Notifications
└── Tool Execution            └── Message Persistence  └── Admin Dashboard
```

### Admin User Privileges Flow

```
Admin Request (ahiya.butman@gmail.com)
│
├── Authentication
│   └── Verify admin credentials ('2con-creator')
│
├── Privilege Application
│   ├── Bypass all rate limits
│   ├── Unlimited credit access
│   ├── Analytics access granted
│   └── Priority execution queue
│
├── Agent Execution (Sanitized)
│   └── Agent receives same sanitized input as regular users
│
├── Cost Tracking
│   ├── Track actual Claude API costs
│   ├── Log admin bypass transaction
│   └── No credit deduction
│
└── Analytics & Monitoring
    ├── Full system visibility
    ├── All user session data
    └── Cost and usage analytics
```

## Security Architecture

### Multi-tenant Isolation

#### Workspace Isolation
```
/workspaces/
├── user_abc123/
│   ├── session_456/
│   │   ├── .git/                    # Isolated git repository
│   │   ├── main/                    # Main branch workspace
│   │   ├── summon-A/                # Agent A workspace  
│   │   │   ├── summon-A-A/           # Sub-agent AA workspace
│   │   │   └── summon-A-B/           # Sub-agent AB workspace
│   │   ├── summon-B/                # Agent B workspace
│   │   └── README.md                # Session coordination
│   └── session_789/
├── user_def456/
│   └── session_101/
└── admin_sessions/              # Admin sessions (same isolation)
    └── session_admin_001/
```

**Complete Isolation Guarantees:**
- No shared files, directories, or git history between users (including admin)
- Process-level isolation with containerization
- Network isolation preventing cross-user communication
- Database-level tenant isolation with encryption
- Resource limits preventing resource exhaustion attacks
- Admin sessions follow same isolation but with unlimited resources

#### Authentication & Authorization
- **JWT Token Security** - Short-lived tokens with automatic rotation
- **Admin Token Security** - Longer-lived admin tokens with enhanced privileges
- **API Key Management** - Scoped keys with configurable permissions and admin bypass flags
- **Multi-Factor Authentication** - TOTP, SMS, and hardware key support (optional for admin)
- **Session Security** - Secure session handling with automatic timeout
- **Permission Boundaries** - Fine-grained access control with admin overrides

#### Data Protection
- **Encryption at Rest** - All user data encrypted with AES-256
- **Admin Data Encryption** - Same encryption standards for admin data
- **Encryption in Transit** - TLS 1.3 for all communications
- **Key Management** - Hardware security modules for key storage
- **Data Retention** - Automated data cleanup and GDPR compliance
- **Backup Security** - Encrypted backups with air-gapped storage

## Scalability Architecture

### Horizontal Scaling
- **Agent Core Clusters** - Auto-scaling agent execution nodes with 1M context support
- **Database Sharding** - User-based sharding for data distribution
- **Load Balancing** - Intelligent routing based on resource availability
- **CDN Integration** - Global content distribution for dashboard assets
- **Edge Computing** - Regional agent execution for reduced latency
- **Admin Analytics Scaling** - Dedicated resources for admin dashboard analytics

### Performance Optimization
- **1M Context Caching** - Intelligent caching of large context windows
- **Git Operations** - Optimized git operations with shallow clones
- **Database Optimization** - Query optimization and connection pooling
- **Streaming Efficiency** - Compressed WebSocket communications
- **Resource Preallocation** - Predictive resource provisioning
- **Admin Priority Queuing** - Priority execution for admin sessions

### Monitoring & Observability
- **Real-time Metrics** - Comprehensive system and application metrics
- **Admin Analytics** - Special monitoring for admin user activities
- **Distributed Tracing** - Request tracing across all system components
- **Log Aggregation** - Centralized logging with intelligent search
- **Error Tracking** - Automated error detection and alerting
- **Performance Profiling** - Continuous performance monitoring and optimization
- **Cost Monitoring** - Real-time tracking of Claude API costs vs credit revenue

## Integration Points

### External Services
- **Claude API** - Anthropic's language model with 1M context configuration
- **Payment Processing** - Stripe integration for credit purchases (no packages)
- **Authentication Providers** - OAuth integration with GitHub, Google, etc.
- **Monitoring Services** - DataDog, New Relic, or similar APM tools
- **Email Services** - SendGrid or similar for transactional emails
- **Admin Notifications** - Special alerting for admin user activities

### API Endpoints
- **RESTful APIs** - Standard REST endpoints for all operations
- **Admin APIs** - Special endpoints for admin user analytics and management
- **WebSocket APIs** - Real-time streaming and communication
- **Webhook Support** - Event notifications for external integrations
- **GraphQL Gateway** - Flexible data querying for dashboard clients
- **SDK Support** - Official SDKs for popular programming languages

### Deployment Architecture
- **Kubernetes Orchestration** - Container orchestration and management
- **Infrastructure as Code** - Terraform for reproducible deployments
- **CI/CD Pipelines** - Automated testing and deployment
- **Multi-region Deployment** - Global availability and disaster recovery
- **Blue-Green Deployments** - Zero-downtime updates and rollbacks
- **Admin Environment** - Dedicated admin dashboard and analytics infrastructure

## Credit System Architecture (No Packages)

### Pricing Model
```
Claude API Cost -> 5x Markup -> keen Credits

Example:
- Claude Input (1M tokens): $6.00
- keen Credit Cost: $30.00 (6.00 × 5)
- Admin Bypass: $0.00 (tracked but not charged)
```

### Credit Flow
```
User Purchase -> Credits Added -> Agent Execution -> Credits Deducted
                                                  -> Claude Cost Tracked
                                                  -> 5x Markup Applied

Admin Flow:   -> Unlimited     -> Agent Execution -> No Deduction
                                                  -> Usage Logged
                                                  -> Cost Tracked
```

This architecture ensures keen can scale to support thousands of concurrent users while maintaining the security, performance, and reliability required for production development workloads. The 1M context window, credit-based pricing with 5x markup, and special admin privileges create a sustainable and transparent platform for autonomous development.