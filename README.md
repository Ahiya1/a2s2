# a2s2 🤖

**Autonomous Agent System v2 - Phase 1B Claude Integration**

[![npm version](https://badge.fury.io/js/a2s2.svg)](https://badge.fury.io/js/a2s2)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

A powerful CLI tool for autonomous software development using Anthropic's Claude API. **a2s2** provides both foundation development tools and autonomous agent capabilities, enabling AI-driven project analysis, file operations, and complete task automation.

## ✨ Features

### 🔧 Foundation Tools
- **Project Analysis**: Intelligent project structure analysis with smart exclusions
- **File Operations**: Batch file reading/writing with atomic operations and rollback protection
- **Shell Integration**: Safe command execution with timeout and error handling
- **Validation**: Comprehensive input validation and error reporting

### 🤖 Autonomous Agent
- **Vision-Driven Tasks**: Natural language task execution with Claude integration
- **Three-Phase Lifecycle**: EXPLORE → SUMMON → COMPLETE workflow
- **Cost Management**: Built-in budget controls and usage tracking
- **Web Search**: Real-time information retrieval capabilities
- **Progress Tracking**: Detailed execution monitoring and reporting

### 🛡️ Enterprise-Ready
- **Comprehensive Logging**: Winston-based logging with multiple levels
- **Error Recovery**: Robust error handling with graceful degradation
- **Configuration Management**: Flexible config system with environment support
- **Testing**: Extensive test suite with unit, integration, and E2E tests

## 🚀 Quick Start

### Installation

```bash
# Install globally via npm
npm install -g a2s2

# Or install locally in your project
npm install a2s2

# Verify installation
a2s2 --version
```

### Initial Setup

```bash
# Interactive setup (recommended for first-time users)
a2s2 config --setup

# Or set your API key manually
export ANTHROPIC_API_KEY="your-api-key-here"

# Verify setup
a2s2 config --status
```

**Get your API key**: Visit [Anthropic Console](https://console.anthropic.com/) to obtain your API key.

## 📖 Usage

### Foundation Tools

```bash
# Analyze project structure
a2s2 analyze ./my-project --foundation
a2s2 analyze /path/to/codebase --detailed

# Read multiple files
a2s2 read src/App.tsx src/utils/helpers.ts
a2s2 read "src/**/*.{js,ts}" --pattern

# Validate tools and configuration
a2s2 validate --tools
a2s2 validate --config --verbose
```

### Autonomous Agent

```bash
# Execute autonomous tasks
a2s2 breathe "Create a React todo app with TypeScript and tests"
a2s2 breathe "Refactor the codebase to improve performance"
a2s2 breathe "Add comprehensive error handling to all API calls"

# Continue existing work
a2s2 continue "Add unit tests and improve documentation"

# Check agent status
a2s2 status --detailed --health-check

# Advanced options
a2s2 breathe "Build a REST API" \
  --directory ./backend \
  --max-iterations 100 \
  --cost-budget 25.0 \
  --extended-context \
  --verbose
```

## ⚙️ Configuration

### Environment Variables

a2s2 supports multiple configuration methods:

```bash
# Global configuration (recommended)
echo "ANTHROPIC_API_KEY=your-key-here" >> ~/.a2s2.env

# Project-specific configuration
echo "ANTHROPIC_API_KEY=your-key-here" >> ./.env

# System environment
export ANTHROPIC_API_KEY="your-key-here"
```

### Configuration Options

| Variable | Description | Default |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | *Required* |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `MAX_ITERATIONS` | Default max iterations for agents | `50` |
| `COST_BUDGET` | Default cost budget in USD | `50.0` |
| `ENABLE_WEB_SEARCH` | Enable web search capabilities | `true` |

### Advanced Configuration

```bash
# View current configuration
a2s2 config --status

# Interactive setup with all options
a2s2 config --setup --advanced

# Get detailed environment help
a2s2 config --help-env

# Test configuration
a2s2 validate --config --tools
```

## 🏗️ Architecture

### Core Components

```
a2s2/
├── 🤖 agent/              # Autonomous agent system
│   ├── AgentSession.ts     # Main agent orchestration
│   └── phases/             # Three-phase lifecycle
├── 🔧 tools/               # Tool ecosystem
│   ├── foundation/         # Core development tools
│   ├── autonomy/           # Agent-specific tools
│   ├── enhanced/           # Advanced capabilities
│   └── web/                # Web search integration
├── 💬 conversation/        # Claude API integration
│   ├── ConversationManager # Chat orchestration
│   ├── CostOptimizer      # Budget management
│   └── ResponseParser     # Response handling
├── 🛠️ cli/                # Command-line interface
└── ⚙️ config/             # Configuration system
```

### Agent Lifecycle

1. **EXPLORE**: Understand project structure and requirements
2. **SUMMON**: Coordinate specialists for complex tasks *(Phase 2 feature)*
3. **COMPLETE**: Implement, test, and finalize solutions

### Tool Categories

- **Foundation**: Project analysis, file I/O, shell execution
- **Enhanced**: Advanced file operations, validation, utilities
- **Autonomy**: Phase reporting, completion signaling, continuation
- **Web**: Real-time search and information retrieval

## 🧪 Development

### Prerequisites

- Node.js 18+
- TypeScript 5.1+
- Anthropic API key

### Setup

```bash
# Clone and install dependencies
git clone https://github.com/your-org/a2s2.git
cd a2s2
npm install

# Build the project
npm run build

# Run tests
npm test
npm run test:watch

# Development mode
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/unit
npm test -- tests/integration
npm test -- tests/e2e

# Test with coverage
npm test -- --coverage

# Watch mode for development
npm run test:watch
```

### Project Structure

```
src/
├── agent/           # Agent system core
├── cli/             # Command-line interface
│   └── commands/    # Individual CLI commands
├── config/          # Configuration management
├── conversation/    # Claude API integration
├── logging/         # Winston-based logging
├── tools/           # Tool ecosystem
│   ├── foundation/  # Core tools
│   ├── files/       # File operations
│   ├── shell/       # Command execution
│   ├── autonomy/    # Agent tools
│   └── web/         # Web search
├── utils/           # Shared utilities
└── validation/      # Input validation

tests/
├── unit/            # Unit tests
├── integration/     # Integration tests
├── e2e/             # End-to-end tests
├── fixtures/        # Test fixtures
└── helpers/         # Test utilities
```

## 📝 Examples

### Foundation Tool Usage

```typescript
import { ToolManager, FoundationAnalyzer, FileReader } from 'a2s2';

// Initialize tool manager
const toolManager = new ToolManager();

// Analyze project structure
const analyzer = new FoundationAnalyzer();
const structure = await analyzer.execute({ path: './my-project' });

// Read multiple files
const reader = new FileReader();
const files = await reader.execute({
  paths: ['src/index.ts', 'package.json']
});
```

### Agent Integration

```typescript
import { AgentSession } from 'a2s2';

// Create autonomous agent session
const session = new AgentSession({
  vision: "Create a REST API with authentication",
  workingDirectory: "./backend",
  maxIterations: 50,
  costBudget: 25.0,
  enableWebSearch: true
});

// Execute the task
const result = await session.execute();
console.log('Task completed:', result.success);
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Code Style

- Follow TypeScript best practices
- Use ESLint and Prettier for code formatting
- Write comprehensive tests for new features
- Update documentation for API changes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Anthropic Console](https://console.anthropic.com/) - Get your API key
- [Claude API Documentation](https://docs.anthropic.com/) - API reference
- [Issues](https://github.com/your-org/a2s2/issues) - Report bugs or request features
- [Discussions](https://github.com/your-org/a2s2/discussions) - Community discussions

## 📞 Support

- 📖 [Documentation](https://github.com/your-org/a2s2/wiki)
- 🐛 [Issue Tracker](https://github.com/your-org/a2s2/issues)
- 💬 [Discussions](https://github.com/your-org/a2s2/discussions)
- 📧 [Email Support](mailto:support@a2s2.dev)

---

<div align="center">
  
**Built with ❤️ by the a2s2 team**

*Empowering developers with autonomous AI agents*

</div>