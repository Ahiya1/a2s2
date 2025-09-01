/**
 * Configuration exports for keen
 * Combines database and Anthropic configurations
 */

// Database configuration exports
export {
  config as databaseConfig,
  testConfig,
  adminConfig,
  creditConfig,
  securityConfig,
  performanceConfig,
  monitoringConfig
} from './database.js';

// Anthropic configuration exports
export {
  AnthropicConfigManager,
  KEEN_DEFAULT_CONFIG,
  type AnthropicConfig,
  type ContextUtilization
} from './AnthropicConfig.js';

// Environment loader export
export { EnvLoader } from './EnvLoader.js';

// Import types for the combined config
import type { AnthropicConfig } from './AnthropicConfig.js';

// Combined configuration for keen platform
export interface KeenPlatformConfig {
  database: typeof import('./database.js').config;
  anthropic: AnthropicConfig;
  admin: typeof import('./database.js').adminConfig;
  credits: typeof import('./database.js').creditConfig;
  security: typeof import('./database.js').securityConfig;
  performance: typeof import('./database.js').performanceConfig;
  monitoring: typeof import('./database.js').monitoringConfig;
}

// Export convenience function to get complete platform config
export async function getKeenPlatformConfig(): Promise<KeenPlatformConfig> {
  const { AnthropicConfigManager, KEEN_DEFAULT_CONFIG } = await import('./AnthropicConfig.js');
  const {
    config: databaseConfig,
    adminConfig,
    creditConfig,
    securityConfig,
    performanceConfig,
    monitoringConfig
  } = await import('./database.js');

  const anthropicManager = new AnthropicConfigManager(KEEN_DEFAULT_CONFIG);
  
  return {
    database: databaseConfig,
    anthropic: anthropicManager.getConfig(),
    admin: adminConfig,
    credits: creditConfig,
    security: securityConfig,
    performance: performanceConfig,
    monitoring: monitoringConfig
  };
}