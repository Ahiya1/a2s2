import { describe, test, expect } from "vitest";
import { ParameterParser } from "../../../src/tools/enhanced/ParameterParser";
import { z } from "zod";

describe("ParameterParser", () => {
  describe("parseFileArray", () => {
    test("should parse proper object with files property", () => {
      const input = {
        files: [
          { path: "test.txt", content: "test content" },
          { path: "test2.txt", content: "test content 2" },
        ],
      };

      const result = ParameterParser.parseFileArray(input);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].path).toBe("test.txt");
      expect(result.data[1].content).toBe("test content 2");
    });

    test("should parse JSON string", () => {
      const input = JSON.stringify({
        files: [{ path: "test.txt", content: "test content" }],
      });

      const result = ParameterParser.parseFileArray(input);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].path).toBe("test.txt");
    });

    test("should wrap direct array in files property", () => {
      const input = [{ path: "test.txt", content: "test content" }];

      const result = ParameterParser.parseFileArray(input);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].path).toBe("test.txt");
    });

    test("should handle invalid JSON string", () => {
      const input = "invalid json {";

      const result = ParameterParser.parseFileArray(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid JSON string");
    });

    test("should handle empty files array", () => {
      const input = { files: [] };

      const result = ParameterParser.parseFileArray(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("At least one file is required");
    });

    test("should handle missing path in file object", () => {
      const input = {
        files: [{ content: "test content" }], // Missing path
      };

      const result = ParameterParser.parseFileArray(input);

      expect(result.success).toBe(false);
    });
  });

  describe("parseStringArray", () => {
    test("should parse proper object with paths property", () => {
      const input = { paths: ["file1.txt", "file2.txt"] };

      const result = ParameterParser.parseStringArray(input, "paths");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(["file1.txt", "file2.txt"]);
    });

    test("should parse JSON string", () => {
      const input = JSON.stringify({ paths: ["file1.txt", "file2.txt"] });

      const result = ParameterParser.parseStringArray(input, "paths");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(["file1.txt", "file2.txt"]);
    });

    test("should wrap direct array", () => {
      const input = ["file1.txt", "file2.txt"];

      const result = ParameterParser.parseStringArray(input, "paths");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(["file1.txt", "file2.txt"]);
    });

    test("should handle empty array", () => {
      const input = { paths: [] };

      const result = ParameterParser.parseStringArray(input, "paths");

      expect(result.success).toBe(false);
      expect(result.error).toContain("At least one path is required");
    });

    test("should handle non-string elements", () => {
      const input = { paths: ["file1.txt", 123, "file2.txt"] };

      const result = ParameterParser.parseStringArray(input, "paths");

      expect(result.success).toBe(false);
    });
  });

  describe("parseCommand", () => {
    test("should parse proper command object", () => {
      const input = { command: "echo hello", timeout: 5000 };

      const result = ParameterParser.parseCommand(input);

      expect(result.success).toBe(true);
      expect(result.data.command).toBe("echo hello");
      expect(result.data.timeout).toBe(5000);
    });

    test("should parse command without timeout", () => {
      const input = { command: "pwd" };

      const result = ParameterParser.parseCommand(input);

      expect(result.success).toBe(true);
      expect(result.data.command).toBe("pwd");
      expect(result.data.timeout).toBeUndefined();
    });

    test("should handle direct command string", () => {
      const input = "echo hello";

      const result = ParameterParser.parseCommand(input);

      expect(result.success).toBe(true);
      expect(result.data.command).toBe("echo hello");
    });

    test("should handle JSON string", () => {
      const input = JSON.stringify({ command: "ls -la" });

      const result = ParameterParser.parseCommand(input);

      expect(result.success).toBe(true);
      expect(result.data.command).toBe("ls -la");
    });

    test("should handle empty command", () => {
      const input = { command: "" };

      const result = ParameterParser.parseCommand(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Command cannot be empty");
    });
  });

  describe("parseObject", () => {
    test("should parse object without schema", () => {
      const input = { key: "value", number: 42 };

      const result = ParameterParser.parseObject(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    test("should parse object with schema validation", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const input = { name: "John", age: 30 };

      const result = ParameterParser.parseObject(input, schema);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    test("should fail schema validation", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const input = { name: "John", age: "thirty" }; // age should be number

      const result = ParameterParser.parseObject(input, schema);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Schema validation failed");
    });

    test("should parse JSON string", () => {
      const input = JSON.stringify({ key: "value" });

      const result = ParameterParser.parseObject(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: "value" });
    });
  });

  describe("parseAny", () => {
    test("should handle null/undefined", () => {
      expect(ParameterParser.parseAny(null)).toEqual({
        success: true,
        data: {},
        originalType: "object",
      });

      expect(ParameterParser.parseAny(undefined)).toEqual({
        success: true,
        data: {},
        originalType: "undefined",
      });
    });

    test("should handle objects", () => {
      const input = { key: "value" };
      const result = ParameterParser.parseAny(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(input);
    });

    test("should handle arrays", () => {
      const input = ["item1", "item2"];
      const result = ParameterParser.parseAny(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ items: input });
    });

    test("should handle JSON strings", () => {
      const input = JSON.stringify({ key: "value" });
      const result = ParameterParser.parseAny(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: "value" });
    });

    test("should handle non-JSON strings", () => {
      const input = "plain text";
      const result = ParameterParser.parseAny(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: input });
    });

    test("should handle primitives", () => {
      const input = 42;
      const result = ParameterParser.parseAny(input);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: input });
    });
  });

  describe("validateRequired", () => {
    test("should validate all required fields present", () => {
      const data = { name: "John", age: 30, email: "john@example.com" };
      const required = ["name", "age"];

      const result = ParameterParser.validateRequired(data, required);

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    test("should identify missing fields", () => {
      const data = { name: "John" };
      const required = ["name", "age", "email"];

      const result = ParameterParser.validateRequired(data, required);

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toEqual(["age", "email"]);
    });

    test("should handle null/undefined values as missing", () => {
      const data = { name: "John", age: null, email: undefined };
      const required = ["name", "age", "email"];

      const result = ParameterParser.validateRequired(data, required);

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toEqual(["age", "email"]);
    });
  });

  describe("sanitizeFilePath", () => {
    test("should handle valid file paths", () => {
      expect(ParameterParser.sanitizeFilePath("src/index.js")).toBe(
        "src/index.js"
      );
      expect(ParameterParser.sanitizeFilePath("  /home/user/file.txt  ")).toBe(
        "/home/user/file.txt"
      );
    });

    test("should remove directory traversal", () => {
      expect(ParameterParser.sanitizeFilePath("../../../etc/passwd")).toBe(
        "etc/passwd"
      );
      expect(ParameterParser.sanitizeFilePath("src/../index.js")).toBe(
        "src/index.js"
      );
    });

    test("should normalize multiple slashes", () => {
      expect(ParameterParser.sanitizeFilePath("src//index.js")).toBe(
        "src/index.js"
      );
      expect(ParameterParser.sanitizeFilePath("src///deep//file.js")).toBe(
        "src/deep/file.js"
      );
    });

    test("should throw for invalid inputs", () => {
      expect(() => ParameterParser.sanitizeFilePath("")).toThrow();
      expect(() => ParameterParser.sanitizeFilePath(null as any)).toThrow();
      expect(() => ParameterParser.sanitizeFilePath(123 as any)).toThrow();
    });

    test("should throw for empty result after sanitization", () => {
      expect(() => ParameterParser.sanitizeFilePath("../")).toThrow(
        "File path cannot be empty after sanitization"
      );
    });
  });

  describe("inspectParameters", () => {
    test("should inspect object", () => {
      const input = { key1: "value1", key2: 42 };
      const result = ParameterParser.inspectParameters(input);

      expect(result.type).toBe("object");
      expect(result.isObject).toBe(true);
      expect(result.isArray).toBe(false);
      expect(result.keys).toEqual(["key1", "key2"]);
    });

    test("should inspect array", () => {
      const input = ["item1", "item2", "item3"];
      const result = ParameterParser.inspectParameters(input);

      expect(result.type).toBe("object");
      expect(result.isArray).toBe(true);
      expect(result.isObject).toBe(false);
      expect(result.length).toBe(3);
    });

    test("should inspect string", () => {
      const input =
        "this is a test string that is longer than 100 characters to test the sample functionality";
      const result = ParameterParser.inspectParameters(input);

      expect(result.type).toBe("string");
      expect(result.isArray).toBe(false);
      expect(result.isObject).toBe(false);
      expect(result.sample).toBe(input.substring(0, 100));
    });

    test("should inspect primitives", () => {
      expect(ParameterParser.inspectParameters(42)).toEqual({
        type: "number",
        isArray: false,
        isObject: false,
      });

      expect(ParameterParser.inspectParameters(true)).toEqual({
        type: "boolean",
        isArray: false,
        isObject: false,
      });
    });
  });
});
