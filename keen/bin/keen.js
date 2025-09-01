#!/usr/bin/env node

/**
 * keen CLI - Autonomous Development Platform
 * Entry point for keen commands: breathe, breath -f, converse
 */

import { KeenCLI } from '../dist/cli/index.js';

const cli = new KeenCLI();
cli.run(process.argv.slice(2))
  .catch(error => {
    console.error('❌ keen CLI Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  });
