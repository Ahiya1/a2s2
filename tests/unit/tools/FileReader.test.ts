import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { FileReader } from "../../../src/tools/files/FileReader";
import { TestUtils } from "../../helpers/TestUtils";
import * as path from "path";

describe("FileReader", () => {
  let reader: FileReader;
  let tempDir: string;

  beforeEach(async () => {
    reader = new FileReader();
    tempDir = await TestUtils.createTempDir();
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
  });

  test("should read single file correctly", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const content = "Hello, World!";
    await TestUtils.createTestFile(filePath, content);

    const result = await reader.execute({ paths: [filePath] });

    expect(result).toContain(`=== ${filePath} ===`);
    expect(result).toContain(content);
  });

  test("should read multiple files correctly", async () => {
    const file1 = path.join(tempDir, "file1.txt");
    const file2 = path.join(tempDir, "file2.txt");
    const content1 = "Content of file 1";
    const content2 = "Content of file 2";

    await TestUtils.createTestFile(file1, content1);
    await TestUtils.createTestFile(file2, content2);

    const result = await reader.execute({ paths: [file1, file2] });

    expect(result).toContain(`=== ${file1} ===`);
    expect(result).toContain(content1);
    expect(result).toContain(`=== ${file2} ===`);
    expect(result).toContain(content2);
  });

  test("should handle non-existent files gracefully", async () => {
    const nonExistentFile = path.join(tempDir, "does-not-exist.txt");

    const result = await reader.execute({ paths: [nonExistentFile] });

    expect(result).toContain(`=== ${nonExistentFile} ===`);
    expect(result).toContain("[Error: File not found]");
  });

  test("should handle mixed existing and non-existing files", async () => {
    const existingFile = path.join(tempDir, "exists.txt");
    const nonExistentFile = path.join(tempDir, "not-exists.txt");
    const content = "I exist!";

    await TestUtils.createTestFile(existingFile, content);

    const result = await reader.execute({
      paths: [existingFile, nonExistentFile],
    });

    expect(result).toContain(content);
    expect(result).toContain("[Error: File not found]");
  });

  test("should validate parameters correctly", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await TestUtils.createTestFile(filePath, "test content");

    // Valid parameters
    await expect(reader.execute({ paths: [filePath] })).resolves.toBeDefined();

    // Invalid parameters
    await expect(reader.execute({ paths: [] })).rejects.toThrow(
      "At least one file path is required"
    );
    await expect(reader.execute({})).rejects.toThrow();
    await expect(reader.execute({ paths: "not-an-array" })).rejects.toThrow();
  });

  test("should handle large files with size limit", async () => {
    const largeFilePath = path.join(tempDir, "large.txt");
    const largeContent = "a".repeat(20 * 1024 * 1024); // 20MB

    await TestUtils.createTestFile(largeFilePath, largeContent);

    const result = await reader.execute({ paths: [largeFilePath] });

    expect(result).toContain("[Truncated: File size exceeded");
  });
});
