# keen CLI Commands

This document describes the main CLI commands for the keen autonomous development platform.

## Overview

The keen CLI provides three primary modes of operation:
1. **Autonomous Execution** (`keen breathe`) - Execute tasks autonomously with full tool access
2. **File-based Execution** (`keen breath -f`) - Execute tasks from vision files  
3. **Interactive Conversation** (`keen converse`) - Chat with the agent before executing

## Commands

### `keen breathe <vision>`

Execute autonomous agent with vision-driven task completion.

**Usage:**
```bash
keen breathe "Create a React todo app with TypeScript and tests"
keen breathe "Fix the database connection issues and add error handling"
keen breathe "Optimize the API performance and add caching"
```

**Options:**
- `--directory <dir>` - Working directory for the agent (default: current directory)
- `--phase <phase>` - Starting phase: EXPLORE, SUMMON, or COMPLETE (default: EXPLORE)
- `--max-iterations <num>` - Maximum conversation iterations (default: 100)
- `--cost-budget <amount>` - Maximum cost budget in USD (default: $50.00)
- `--no-web-search` - Disable web search capability
- `--extended-context` - Enable 1M token context window (requires tier 4+)
- `--dry-run` - Plan execution without making changes
- `--verbose` - Enable verbose output

### `keen breath -f <vision-file>`

Execute autonomous agent using vision from a file.

**Usage:**
```bash
keen breath -f vision.md
keen breath -f project-requirements.txt
keen breath -f ./docs/sprint-goals.md
```

### `keen converse`

Interactive conversation mode - chat with Claude agent before autonomous execution.

**Usage:**
```bash
keen converse
```

**Features:**
- **Limited Agent**: Conversation agent can ONLY read files and analyze projects (no writing/execution)
- **Breathe Integration**: Type 'breathe' during conversation to synthesize and execute autonomously
- **Persistent Sessions**: Conversations are automatically saved and can be resumed
- **Project Analysis**: No re-analysis needed when continuing conversations

## Pricing and Costs

### Claude Sonnet 4 Pricing (2024/2025)

**Standard Context (≤200K tokens):**
- Input: $0.003 per 1K tokens  
- Output: $0.015 per 1K tokens
- Thinking: $0.003 per 1K tokens (same as input)

**Extended Context (>200K tokens):**
- Input: $0.006 per 1K tokens
- Output: $0.0225 per 1K tokens  
- Thinking: $0.006 per 1K tokens

**keen Credit System:**
- 5x markup applied to all Claude costs
- Admin accounts bypass credit system
- Regular users are charged in keen credits

## Configuration

### Environment Variables

Required:
- `ANTHROPIC_API_KEY` - Your Anthropic API key

Optional:
- `CLAUDE_MODEL` - Override default Claude model (default: claude-sonnet-4-20250514)
- `LOG_LEVEL` - Logging level (debug, info, warn, error)

---

*This documentation is based on the a2s2 CLI implementation and adapted for the keen platform.*
