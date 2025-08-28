import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { FoundationAnalyzer } from "../../../src/tools/foundation/FoundationAnalyzer";
import { TestUtils } from "../../helpers/TestUtils";

describe("FoundationAnalyzer", () => {
  let analyzer: FoundationAnalyzer;
  let tempDir: string;

  beforeEach(async () => {
    analyzer = new FoundationAnalyzer();
    tempDir = await TestUtils.createTempDir();
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
  });

  test("should analyze project structure with tree command", async () => {
    // Create test project structure
    await TestUtils.createTestFiles(tempDir, {
      "package.json": JSON.stringify({
        name: "test-project",
        dependencies: { react: "^18.0.0" },
      }),
      "src/App.jsx":
        "export default function App() { return <div>Hello</div> }",
      "src/components/Button.jsx":
        "export default function Button() { return <button>Click</button> }",
      "README.md": "# Test Project\n\nThis is a test React project.",
    });

    const result = await analyzer.execute({ path: tempDir });

    expect(result).toContain("package.json");
    expect(result).toContain("src"); // Changed from 'src/'
    expect(result).toContain("README.md");
    expect(result).not.toContain("node_modules");
  });

  test("should handle non-existent directory gracefully", async () => {
    const nonExistentPath = "/this/path/does/not/exist";

    // The fallback find command will return stderr but not throw, so we check for error indication
    const result = await analyzer.execute({ path: nonExistentPath });
    expect(result).toContain("STDERR");
    expect(result).toContain("No such file or directory");
  });

  test("should use current directory when no path provided", async () => {
    const result = await analyzer.execute({});

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  test("should exclude common ignore patterns", async () => {
    await TestUtils.createTestFiles(tempDir, {
      "package.json": "{}",
      "src/index.js": 'console.log("hello")',
      "node_modules/react/index.js": "module.exports = React",
      "dist/bundle.js": "var app = {};",
      ".git/config": "[core]",
    });

    const result = await analyzer.execute({ path: tempDir });

    expect(result).toContain("src"); // Changed from 'src/'
    expect(result).toContain("package.json");
    expect(result).not.toContain("node_modules");
    expect(result).not.toContain("dist");
    expect(result).not.toContain(".git");
  });

  test("should validate parameters correctly", async () => {
    // Valid parameters
    await expect(analyzer.execute({ path: tempDir })).resolves.toBeDefined();
    await expect(analyzer.execute({})).resolves.toBeDefined();

    // Invalid parameters
    await expect(analyzer.execute({ path: 123 })).rejects.toThrow(
      "Invalid foundation analyzer parameters"
    );

    // Empty string should work (falls back to current directory)
    await expect(analyzer.execute({ path: "" })).resolves.toBeDefined();
  });
});
