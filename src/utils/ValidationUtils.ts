import { z } from "zod";

export class ValidationUtils {
  static validateString(value: unknown, fieldName: string): string {
    if (typeof value !== "string") {
      throw new Error(`${fieldName} must be a string`);
    }
    return value;
  }

  static validateArray(value: unknown, fieldName: string): unknown[] {
    if (!Array.isArray(value)) {
      throw new Error(`${fieldName} must be an array`);
    }
    return value;
  }

  static validateObject(
    value: unknown,
    fieldName: string
  ): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${fieldName} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  static parseJSONString<T>(jsonStr: string, schema: z.ZodSchema<T>): T {
    try {
      const parsed = JSON.parse(jsonStr);
      return schema.parse(parsed);
    } catch (error) {
      throw new Error(
        `Invalid JSON string: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
