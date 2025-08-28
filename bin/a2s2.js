#!/usr/bin/env node

// Import the compiled CLI
const { runCLI } = require("../dist/cli/index");

// Run CLI with process arguments
runCLI(process.argv);
