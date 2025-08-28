import { describe, test, expect, beforeEach } from "vitest";
import { ShellExecutor } from "../../../src/tools/shell/ShellExecutor";

describe("ShellExecutor", () => {
  let executor: ShellExecutor;

  beforeEach(() => {
    executor = new ShellExecutor();
  });

  test("should execute simple echo command", async () => {
    const result = await executor.execute({
      command: 'echo "Hello, World!"',
    });

    expect(result.trim()).toBe("Hello, World!");
  });

  test("should handle command with timeout", async () => {
    const result = await executor.execute({
      command: 'echo "test"',
      timeout: 5000,
    });

    expect(result.trim()).toBe("test");
  });

  test("should fail for non-existent commands", async () => {
    await expect(
      executor.execute({
        command: "this-command-does-not-exist-12345",
      })
    ).rejects.toThrow("Command failed");
  });

  test("should handle commands that produce stderr", async () => {
    const result = await executor.execute({
      command: 'echo "error message" >&2 && echo "success message"',
    });

    expect(result).toContain("STDOUT");
    expect(result).toContain("STDERR");
    expect(result).toContain("success message");
    expect(result).toContain("error message");
  });

  test("should timeout long-running commands", async () => {
    await expect(
      executor.execute({
        command: "sleep 10",
        timeout: 100, // 100ms timeout
      })
    ).rejects.toThrow();
  });

  test("should validate parameters correctly", async () => {
    // Valid parameters
    await expect(
      executor.execute({
        command: 'echo "test"',
      })
    ).resolves.toBeDefined();

    // Invalid parameters
    await expect(executor.execute({ command: "" })).rejects.toThrow(
      "Command cannot be empty"
    );
    await expect(executor.execute({})).rejects.toThrow();
    await expect(
      executor.execute({
        command: 'echo "test"',
        timeout: -100,
      })
    ).rejects.toThrow();
  });

  test("should handle basic file operations", async () => {
    // Test that shell can perform basic file operations we'll need
    const result = await executor.execute({
      command: "pwd",
    });

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
