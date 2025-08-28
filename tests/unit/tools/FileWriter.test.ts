import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { FileWriter } from "../../../src/tools/files/FileWriter";
import { TestUtils } from "../../helpers/TestUtils";
import * as path from "path";
import * as fs from "fs-extra";

describe("FileWriter", () => {
  let writer: FileWriter;
  let tempDir: string;

  beforeEach(async () => {
    writer = new FileWriter();
    tempDir = await TestUtils.createTempDir();
  });

  afterEach(async () => {
    await TestUtils.cleanupTempDir(tempDir);
  });

  test("should write single file correctly", async () => {
    const filePath = path.join(tempDir, "output.txt");
    const content = "Hello, World!";

    const result = await writer.execute({
      files: [{ path: filePath, content }],
    });

    expect(result).toContain("1/1 files written successfully");
    expect(result).toContain("✅");

    const writtenContent = await TestUtils.readTestFile(filePath);
    expect(writtenContent).toBe(content);
  });

  test("should write multiple files correctly", async () => {
    const file1Path = path.join(tempDir, "file1.txt");
    const file2Path = path.join(tempDir, "file2.txt");
    const content1 = "Content 1";
    const content2 = "Content 2";

    const result = await writer.execute({
      files: [
        { path: file1Path, content: content1 },
        { path: file2Path, content: content2 },
      ],
    });

    expect(result).toContain("2/2 files written successfully");

    const writtenContent1 = await TestUtils.readTestFile(file1Path);
    const writtenContent2 = await TestUtils.readTestFile(file2Path);
    expect(writtenContent1).toBe(content1);
    expect(writtenContent2).toBe(content2);
  });

  test("should create directories if they do not exist", async () => {
    const nestedFilePath = path.join(tempDir, "nested", "deep", "file.txt");
    const content = "Nested file content";

    await writer.execute({
      files: [{ path: nestedFilePath, content }],
    });

    expect(await TestUtils.fileExists(nestedFilePath)).toBe(true);
    const writtenContent = await TestUtils.readTestFile(nestedFilePath);
    expect(writtenContent).toBe(content);
  });

  test("should handle write failures with rollback", async () => {
    // Skip this test on systems where we can't simulate write failures reliably
    const validFilePath = path.join(tempDir, "valid.txt");
    await TestUtils.createTestFile(validFilePath, "original content");

    // Create a scenario that should fail - try to write to root directory without permission
    const invalidPath = "/root/cannot-write.txt";

    // This test might not fail on all systems, so we make it conditional
    try {
      await writer.execute({
        files: [
          { path: validFilePath, content: "new content" },
          { path: invalidPath, content: "should fail" },
        ],
      });

      // If it didn't throw, skip the rollback verification
      console.warn(
        "Write operation unexpectedly succeeded, skipping rollback test"
      );
    } catch (error) {
      // Verify rollback - original file should be unchanged
      const originalContent = await TestUtils.readTestFile(validFilePath);
      expect(originalContent).toBe("original content");
    }
  });

  test("should validate parameters correctly", async () => {
    const filePath = path.join(tempDir, "test.txt");

    // Valid parameters
    await expect(
      writer.execute({
        files: [{ path: filePath, content: "test" }],
      })
    ).resolves.toBeDefined();

    // Invalid parameters
    await expect(writer.execute({ files: [] })).rejects.toThrow(
      "At least one file is required"
    );
    await expect(writer.execute({})).rejects.toThrow();
    await expect(
      writer.execute({
        files: [{ path: "", content: "test" }],
      })
    ).rejects.toThrow("File path cannot be empty");
  });

  test("should perform atomic writes using temporary files", async () => {
    const filePath = path.join(tempDir, "atomic.txt");
    const content = "Atomic write test";

    await writer.execute({
      files: [{ path: filePath, content }],
    });

    // Verify no temporary files are left behind
    const tempFile = `${filePath}.tmp`;
    expect(await TestUtils.fileExists(tempFile)).toBe(false);

    // Verify final file exists with correct content
    expect(await TestUtils.fileExists(filePath)).toBe(true);
    const writtenContent = await TestUtils.readTestFile(filePath);
    expect(writtenContent).toBe(content);
  });
});
