import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  CompletionTool,
  CompletionReport,
} from "../../../src/tools/autonomy/CompletionTool";

describe("CompletionTool", () => {
  let completionTool: CompletionTool;
  let mockCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    completionTool = new CompletionTool();
    mockCallback = vi.fn();
  });

  test("should have correct tool properties", () => {
    expect(completionTool.name).toBe("report_complete");
    expect(completionTool.description).toContain("completed its assigned task");
    expect(completionTool.schema).toBeDefined();
    expect(completionTool.schema.required).toEqual(["summary"]);
  });

  test("should execute with valid completion report", async () => {
    const completionData = {
      summary: "Successfully created README.md file",
      filesCreated: ["README.md"],
      filesModified: ["package.json"],
      testsRun: ["npm test"],
      success: true,
    };

    const result = await completionTool.execute(completionData);

    expect(result).toContain("✅ TASK COMPLETED");
    expect(result).toContain("Successfully created README.md file");
    expect(result).toContain("📄 Files Created:");
    expect(result).toContain("README.md");
    expect(result).toContain("✏️  Files Modified:");
    expect(result).toContain("package.json");
    expect(result).toContain("🧪 Tests Executed:");
    expect(result).toContain("npm test");
  });

  test("should handle minimal completion report", async () => {
    const completionData = {
      summary: "Task completed",
    };

    const result = await completionTool.execute(completionData);

    expect(result).toContain("✅ TASK COMPLETED");
    expect(result).toContain("Task completed");
    expect(result).toContain("🔄 Agent execution will now terminate");
  });

  test("should handle JSON string parameters", async () => {
    const completionData = JSON.stringify({
      summary: "JSON string test completed",
      filesCreated: ["test.txt"],
      success: true,
    });

    const result = await completionTool.execute(completionData);

    expect(result).toContain("JSON string test completed");
    expect(result).toContain("test.txt");
  });

  test("should handle unsuccessful completion", async () => {
    const completionData = {
      summary: "Task completed with some issues",
      success: false,
      filesCreated: ["partial.txt"],
    };

    const result = await completionTool.execute(completionData);

    expect(result).toContain("Task completed with some issues");
    expect(result).toContain("⚠️  Task completed with issues");
    expect(result).toContain("partial.txt");
  });

  test("should include next steps when provided", async () => {
    const completionData = {
      summary: "Initial setup completed",
      nextSteps: ["Run tests", "Deploy to production", "Monitor performance"],
      success: true,
    };

    const result = await completionTool.execute(completionData);

    expect(result).toContain("👉 Suggested Next Steps:");
    expect(result).toContain("Run tests");
    expect(result).toContain("Deploy to production");
    expect(result).toContain("Monitor performance");
  });

  test("should validate required summary", async () => {
    const invalidData = {
      filesCreated: ["test.txt"],
      // Missing summary
    };

    await expect(completionTool.execute(invalidData)).rejects.toThrow(
      "Invalid completion parameters"
    );
  });

  test("should validate summary length", async () => {
    const invalidData = {
      summary: "short", // Less than 10 characters
    };

    await expect(completionTool.execute(invalidData)).rejects.toThrow(
      "Summary must be at least 10 characters"
    );
  });

  test("should trigger completion callbacks", async () => {
    completionTool.onCompletion(mockCallback);

    const completionData = {
      summary: "Callback test completed successfully",
      filesCreated: ["callback-test.txt"],
    };

    await completionTool.execute(completionData);

    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Callback test completed successfully",
        filesCreated: ["callback-test.txt"],
        success: true,
      })
    );
  });

  test("should handle multiple completion callbacks", async () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    completionTool.onCompletion(callback1);
    completionTool.onCompletion(callback2);

    const completionData = {
      summary: "Multiple callbacks test",
    };

    await completionTool.execute(completionData);

    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  test("should remove completion callbacks", async () => {
    completionTool.onCompletion(mockCallback);
    completionTool.removeCompletionCallback(mockCallback);

    const completionData = {
      summary: "Removed callback test",
    };

    await completionTool.execute(completionData);

    expect(mockCallback).not.toHaveBeenCalled();
  });

  test("should handle callback errors gracefully", async () => {
    const errorCallback = vi.fn(() => {
      throw new Error("Callback error");
    });

    completionTool.onCompletion(errorCallback);

    const completionData = {
      summary: "Error handling test",
    };

    // Should not throw despite callback error
    await expect(completionTool.execute(completionData)).resolves.toBeDefined();
  });

  describe("static methods", () => {
    test("should identify completion tools", () => {
      expect(CompletionTool.isCompletionTool("report_complete")).toBe(true);
      expect(CompletionTool.isCompletionTool("task_complete")).toBe(true);
      expect(CompletionTool.isCompletionTool("other_tool")).toBe(false);
    });

    test("should validate completion reports", () => {
      const validReport = {
        summary: "Valid completion report",
        filesCreated: ["test.txt"],
        success: true,
      };

      const result = CompletionTool.validateCompletionReport(validReport);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);

      const invalidReport = {
        summary: "short", // Too short
        filesCreated: "not-an-array", // Wrong type
      };

      const invalidResult =
        CompletionTool.validateCompletionReport(invalidReport);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    test("should create completion reports", () => {
      const report = CompletionTool.createCompletionReport(
        "Test completion summary",
        {
          filesCreated: ["test1.txt", "test2.txt"],
          success: false,
          nextSteps: ["Fix issues", "Retry"],
        }
      );

      expect(report).toEqual({
        summary: "Test completion summary",
        filesCreated: ["test1.txt", "test2.txt"],
        filesModified: [],
        testsRun: [],
        validationResults: [],
        success: false,
        nextSteps: ["Fix issues", "Retry"],
        duration: undefined,
      });
    });
  });

  test("should provide execution statistics", () => {
    const stats = completionTool.getExecutionStats();

    expect(stats).toHaveProperty("totalCompletions");
    expect(stats).toHaveProperty("callbackCount");
    expect(stats).toHaveProperty("lastCompletion");
    expect(typeof stats.totalCompletions).toBe("number");
    expect(typeof stats.callbackCount).toBe("number");
  });

  test("should format validation results correctly", async () => {
    const completionData = {
      summary: "Validation test completed",
      validationResults: [
        "✓ All tests passed",
        "✓ Code style check passed",
        "⚠ Performance could be improved",
      ],
    };

    const result = await completionTool.execute(completionData);

    expect(result).toContain("✓ Validation Results:");
    expect(result).toContain("All tests passed");
    expect(result).toContain("Performance could be improved");
  });

  test("should handle edge cases in file arrays", async () => {
    const completionData = {
      summary: "Edge case testing completed",
      filesCreated: [], // Empty array
      filesModified: null as any, // Null value
    };

    // Should not throw error for null/empty arrays
    const result = await completionTool.execute(completionData);
    expect(result).toContain("Edge case testing completed");
  });
});
