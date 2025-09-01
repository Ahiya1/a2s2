/**
 * AnthropicConfig Tests
 * Validates Anthropic configuration for keen requirements
 */

import { describe, test, expect, beforeEach } from "@jest/globals";
import {
  AnthropicConfigManager,
  getKeenDefaultConfig,
  type AnthropicConfig,
} from "../../src/config/AnthropicConfig";

describe("AnthropicConfigManager", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv, NODE_ENV: "test" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Configuration Validation", () => {
    test("should enforce keen requirements", () => {
      const config = new AnthropicConfigManager();
      const actualConfig = config.getConfig();

      // keen requirements that cannot be disabled
      expect(actualConfig.enableExtendedContext).toBe(true);
      expect(actualConfig.enableInterleaved).toBe(true);
    });

    test("should not allow disabling critical features", () => {
      const config = new AnthropicConfigManager();

      // Attempt to disable critical features
      config.updateConfig({
        enableExtendedContext: false,
        enableInterleaved: false,
      });

      const actualConfig = config.getConfig();

      // Should still be enabled despite attempt to disable
      expect(actualConfig.enableExtendedContext).toBe(true);
      expect(actualConfig.enableInterleaved).toBe(true);
    });

    test("should validate model names", () => {
      expect(() => {
        new AnthropicConfigManager({
          model: "invalid-model",
        });
      }).toThrow("Invalid model name");

      expect(() => {
        new AnthropicConfigManager({
          model: "claude-sonnet-4-20250514",
        });
      }).not.toThrow();
    });

    test("should support environment model override", () => {
      process.env.CLAUDE_MODEL = "claude-sonnet-4-20250514";

      const config = new AnthropicConfigManager();
      expect(config.getConfig().model).toBe("claude-sonnet-4-20250514");

      delete process.env.CLAUDE_MODEL;
    });
  });

  describe("Beta Headers", () => {
    test("should include required beta headers", () => {
      const config = new AnthropicConfigManager();
      const headers = config.getBetaHeaders();

      expect(headers).toContain("context-1m-2025-08-07");
      expect(headers).toContain("interleaved-thinking-2025-05-14");
    });

    test("should validate keen requirements", () => {
      const config = new AnthropicConfigManager();
      const validation = config.validateKeenRequirements();

      expect(validation.valid).toBe(true);
      expect(validation.issues).toHaveLength(0);
      expect(validation.betaHeaders).toContain("context-1m-2025-08-07");
      expect(validation.betaHeaders).toContain(
        "interleaved-thinking-2025-05-14"
      );
    });
  });

  describe("Request Configuration", () => {
    test("should generate proper request config", () => {
      const config = new AnthropicConfigManager({
        model: "claude-sonnet-4-20250514",
        maxTokens: 16000,
        thinkingBudget: 10000,
      });

      const requestConfig = config.getRequestConfig();

      expect(requestConfig).toMatchObject({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        thinking: {
          type: "enabled",
          budget_tokens: 10000,
        },
        stream: true,
      });
    });
  });

  describe("Cost Calculations", () => {
    test("should calculate costs correctly for standard context", () => {
      const config = new AnthropicConfigManager();

      const costBreakdown = config.calculateRequestCost(
        100000, // input tokens (under 200K)
        5000, // output tokens
        2000 // thinking tokens
      );

      // Standard pricing
      expect(costBreakdown.isExtendedPricing).toBe(false);
      expect(costBreakdown.inputCost).toBe(100000 * 0.000003);
      expect(costBreakdown.outputCost).toBe(5000 * 0.000015);
      expect(costBreakdown.thinkingCost).toBe(2000 * 0.000003);

      // 5x markup for keen credits
      expect(costBreakdown.keenCreditCost).toBe(costBreakdown.totalCost * 5.0);
    });

    test("should calculate costs correctly for extended context", () => {
      const config = new AnthropicConfigManager();

      const costBreakdown = config.calculateRequestCost(
        300000, // input tokens (over 200K)
        10000, // output tokens
        5000 // thinking tokens
      );

      // Extended pricing
      expect(costBreakdown.isExtendedPricing).toBe(true);
      expect(costBreakdown.inputCost).toBe(300000 * 0.000006);
      expect(costBreakdown.outputCost).toBe(10000 * 0.0000225);
      expect(costBreakdown.thinkingCost).toBe(5000 * 0.000006);
    });
  });

  describe("Default Configuration", () => {
    test("getKeenDefaultConfig should have correct values", () => {
      expect(getKeenDefaultConfig().enableExtendedContext).toBe(true);
      expect(getKeenDefaultConfig().enableInterleaved).toBe(true);
      expect(getKeenDefaultConfig().enableWebSearch).toBe(true);
      expect(getKeenDefaultConfig().enableStreaming).toBe(true);
      expect(getKeenDefaultConfig().maxTokens).toBe(16000);
      expect(getKeenDefaultConfig().thinkingBudget).toBe(10000);
    });

    test("should use CLAUDE_MODEL environment variable", () => {
      process.env.CLAUDE_MODEL = "claude-4-sonnet-test";

      const config = new AnthropicConfigManager(getKeenDefaultConfig());
      expect(config.getConfig().model).toBe("claude-4-sonnet-test");

      delete process.env.CLAUDE_MODEL;
    });

    test("should fall back to default model", () => {
      delete process.env.CLAUDE_MODEL;

      const config = new AnthropicConfigManager(getKeenDefaultConfig());
      expect(config.getConfig().model).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("Production Readiness", () => {
    test("should validate production readiness", () => {
      const config = new AnthropicConfigManager({
        apiKey: "sk-ant-valid-key-1234567890abcdef",
      });

      expect(config.isProductionReady()).toBe(true);
    });

    test("should detect invalid API key format", () => {
      expect(AnthropicConfigManager.validateApiKey("invalid-key")).toBe(false);
      expect(
        AnthropicConfigManager.validateApiKey("sk-ant-valid-key-1234567890")
      ).toBe(true);
    });
  });

  describe("Model Evolution Support", () => {
    test("should support Claude 3.5 Sonnet models", () => {
      const models = ["claude-sonnet-4-20250514"];

      models.forEach((model) => {
        expect(() => {
          new AnthropicConfigManager({ model });
        }).not.toThrow();
      });
    });

    test("should support future Claude 4 models", () => {
      const futureModels = [
        "claude-4-sonnet-20250315",
        "claude-4-opus-20250420",
      ];

      futureModels.forEach((model) => {
        expect(() => {
          new AnthropicConfigManager({ model });
        }).not.toThrow();
      });
    });
  });
});
