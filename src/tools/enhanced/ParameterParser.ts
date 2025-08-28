import { z } from "zod";
import { Logger } from "../../logging/Logger";

export interface ParsedParameters {
  success: boolean;
  data?: any;
  error?: string;
  originalType: string;
}

export class ParameterParser {
  /**
   * Robustly parse file array parameters that can come as either:
   * 1. Already parsed object: { files: [...] }
   * 2. JSON string: '{"files": [...]}'
   * 3. Direct array: [...]
   * 4. JSON string of array: '[...]'
   */
  static parseFileArray(params: unknown): ParsedParameters {
    const originalType = typeof params;

    try {
      // Define the expected schema
      const FileArraySchema = z.object({
        files: z
          .array(
            z.object({
              path: z.string().min(1, "File path cannot be empty"),
              content: z.string(),
            })
          )
          .min(1, "At least one file is required"),
      });

      // Case 1: Already a proper object with files property
      if (
        params &&
        typeof params === "object" &&
        !Array.isArray(params) &&
        "files" in params
      ) {
        const result = FileArraySchema.safeParse(params);
        if (result.success) {
          Logger.debug("Parsed file array from object", {
            fileCount: result.data.files.length,
          });
          return {
            success: true,
            data: result.data.files,
            originalType,
          };
        }

        // FIXED: Handle empty files array specifically
        if (
          (params as any).files &&
          Array.isArray((params as any).files) &&
          (params as any).files.length === 0
        ) {
          return {
            success: false,
            error: "At least one file is required",
            originalType,
          };
        }
      }

      // Case 2: JSON string that might contain the object
      if (typeof params === "string") {
        try {
          const parsed = JSON.parse(params);
          return this.parseFileArray(parsed); // Recursive call with parsed object
        } catch (jsonError) {
          return {
            success: false,
            error: `Invalid JSON string: ${(jsonError as Error).message}`,
            originalType,
          };
        }
      }

      // Case 3: Direct array (wrap in files property)
      if (Array.isArray(params)) {
        // FIXED: Handle empty array specifically
        if (params.length === 0) {
          return {
            success: false,
            error: "At least one file is required",
            originalType,
          };
        }

        const wrappedParams = { files: params };
        return this.parseFileArray(wrappedParams); // Recursive call
      }

      // Case 4: Object without files property (assume it's malformed)
      if (params && typeof params === "object") {
        // Try to extract files from various possible formats
        const possibleFiles =
          (params as any).file || (params as any).data || params;
        if (Array.isArray(possibleFiles)) {
          const wrappedParams = { files: possibleFiles };
          return this.parseFileArray(wrappedParams); // Recursive call
        }
      }

      return {
        success: false,
        error: `Unsupported parameter format. Expected object with 'files' property, JSON string, or array`,
        originalType,
      };
    } catch (error) {
      return {
        success: false,
        error: `Parameter parsing error: ${(error as Error).message}`,
        originalType,
      };
    }
  }

  /**
   * Parse string array parameters (for file paths, etc.)
   */
  static parseStringArray(
    params: unknown,
    fieldName: string = "paths"
  ): ParsedParameters {
    const originalType = typeof params;

    try {
      const StringArraySchema = z.object({
        [fieldName]: z
          .array(z.string().min(1, `${fieldName} cannot be empty`))
          .min(1, `At least one ${fieldName.slice(0, -1)} is required`),
      });

      // Case 1: Proper object with the field
      if (
        params &&
        typeof params === "object" &&
        !Array.isArray(params) &&
        fieldName in params
      ) {
        const result = StringArraySchema.safeParse(params);
        if (result.success) {
          Logger.debug(`Parsed string array from object`, {
            field: fieldName,
            count: (result.data as any)[fieldName].length,
          });
          return {
            success: true,
            data: (result.data as any)[fieldName],
            originalType,
          };
        }

        // FIXED: Handle empty array specifically
        if (
          (params as any)[fieldName] &&
          Array.isArray((params as any)[fieldName]) &&
          (params as any)[fieldName].length === 0
        ) {
          return {
            success: false,
            error: `At least one ${fieldName.slice(0, -1)} is required`,
            originalType,
          };
        }
      }

      // Case 2: JSON string
      if (typeof params === "string") {
        try {
          const parsed = JSON.parse(params);
          return this.parseStringArray(parsed, fieldName); // Recursive call
        } catch (jsonError) {
          return {
            success: false,
            error: `Invalid JSON string: ${(jsonError as Error).message}`,
            originalType,
          };
        }
      }

      // Case 3: Direct array
      if (Array.isArray(params)) {
        // FIXED: Handle empty array specifically
        if (params.length === 0) {
          return {
            success: false,
            error: `At least one ${fieldName.slice(0, -1)} is required`,
            originalType,
          };
        }

        const wrappedParams = { [fieldName]: params };
        return this.parseStringArray(wrappedParams, fieldName); // Recursive call
      }

      return {
        success: false,
        error: `Unsupported parameter format for ${fieldName}. Expected object with '${fieldName}' property, JSON string, or array`,
        originalType,
      };
    } catch (error) {
      return {
        success: false,
        error: `Parameter parsing error for ${fieldName}: ${(error as Error).message}`,
        originalType,
      };
    }
  }

  /**
   * Parse command parameters for shell execution
   */
  static parseCommand(params: unknown): ParsedParameters {
    const originalType = typeof params;

    try {
      const CommandSchema = z.object({
        command: z.string().min(1, "Command cannot be empty"),
        timeout: z.number().positive().optional(),
      });

      // Case 1: Proper object
      if (params && typeof params === "object" && !Array.isArray(params)) {
        const result = CommandSchema.safeParse(params);
        if (result.success) {
          Logger.debug("Parsed command from object", {
            command: result.data.command,
          });
          return {
            success: true,
            data: result.data,
            originalType,
          };
        }

        // FIXED: Handle empty command specifically
        if ((params as any).command === "") {
          return {
            success: false,
            error: "Command cannot be empty",
            originalType,
          };
        }
      }

      // Case 2: JSON string
      if (typeof params === "string") {
        try {
          const parsed = JSON.parse(params);
          return this.parseCommand(parsed); // Recursive call
        } catch (jsonError) {
          // Maybe it's a direct command string
          if (params.trim().length > 0) {
            return {
              success: true,
              data: { command: params },
              originalType,
            };
          } else {
            return {
              success: false,
              error: "Command cannot be empty",
              originalType,
            };
          }
        }
      }

      return {
        success: false,
        error: "Unsupported command parameter format",
        originalType,
      };
    } catch (error) {
      return {
        success: false,
        error: `Command parsing error: ${(error as Error).message}`,
        originalType,
      };
    }
  }

  /**
   * Parse simple object parameters with optional schema validation
   */
  static parseObject<T>(
    params: unknown,
    schema?: z.ZodSchema<T>
  ): ParsedParameters {
    const originalType = typeof params;

    try {
      // Case 1: Already an object
      if (params && typeof params === "object" && !Array.isArray(params)) {
        if (schema) {
          const result = schema.safeParse(params);
          if (result.success) {
            return {
              success: true,
              data: result.data,
              originalType,
            };
          } else {
            return {
              success: false,
              error: `Schema validation failed: ${result.error.message}`,
              originalType,
            };
          }
        } else {
          return {
            success: true,
            data: params,
            originalType,
          };
        }
      }

      // Case 2: JSON string
      if (typeof params === "string") {
        try {
          const parsed = JSON.parse(params);
          return this.parseObject(parsed, schema); // Recursive call
        } catch (jsonError) {
          return {
            success: false,
            error: `Invalid JSON string: ${(jsonError as Error).message}`,
            originalType,
          };
        }
      }

      return {
        success: false,
        error: "Expected object or JSON string",
        originalType,
      };
    } catch (error) {
      return {
        success: false,
        error: `Object parsing error: ${(error as Error).message}`,
        originalType,
      };
    }
  }

  /**
   * Universal parameter parser that tries to intelligently handle any input
   */
  static parseAny(params: unknown): ParsedParameters {
    const originalType = typeof params;

    // Null/undefined
    if (params === null || params === undefined) {
      return {
        success: true,
        data: {},
        originalType,
      };
    }

    // Already an object
    if (typeof params === "object" && !Array.isArray(params)) {
      return {
        success: true,
        data: params,
        originalType,
      };
    }

    // Array
    if (Array.isArray(params)) {
      return {
        success: true,
        data: { items: params },
        originalType,
      };
    }

    // String (try JSON parsing)
    if (typeof params === "string") {
      try {
        const parsed = JSON.parse(params);
        Logger.debug("Successfully parsed JSON string parameter");
        return {
          success: true,
          data: parsed,
          originalType,
        };
      } catch (error) {
        // Return as string value if not valid JSON
        return {
          success: true,
          data: { value: params },
          originalType,
        };
      }
    }

    // Primitive types
    return {
      success: true,
      data: { value: params },
      originalType,
    };
  }

  /**
   * Validate that required fields are present in parsed parameters
   */
  static validateRequired(
    data: any,
    requiredFields: string[]
  ): { isValid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      if (
        !(field in data) ||
        data[field] === null ||
        data[field] === undefined
      ) {
        missingFields.push(field);
      }
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  }

  /**
   * Sanitize file paths to prevent directory traversal
   * FIXED: Preserve absolute paths correctly
   */
  static sanitizeFilePath(filePath: string): string {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("File path must be a non-empty string");
    }

    // Track if original path was absolute
    const wasAbsolute = filePath.startsWith("/");

    // Remove dangerous patterns and normalize slashes
    let sanitized = filePath
      .replace(/\.\./g, "") // Remove directory traversal
      .replace(/\/+/g, "/") // Normalize multiple slashes
      .trim();

    // FIXED: Preserve absolute paths - only remove leading slash if it wasn't originally absolute
    if (sanitized.startsWith("/") && !wasAbsolute) {
      sanitized = sanitized.substring(1);
    }

    if (sanitized.length === 0) {
      throw new Error("File path cannot be empty after sanitization");
    }

    return sanitized;
  }

  /**
   * Debug utility to inspect parameter structure
   */
  static inspectParameters(params: unknown): {
    type: string;
    isArray: boolean;
    isObject: boolean;
    keys?: string[];
    length?: number;
    sample?: string;
  } {
    const type = typeof params;
    const isArray = Array.isArray(params);
    const isObject = params !== null && typeof params === "object" && !isArray;

    const inspection: any = {
      type,
      isArray,
      isObject,
    };

    if (isObject) {
      inspection.keys = Object.keys(params as object);
    }

    if (isArray) {
      inspection.length = (params as any[]).length;
    }

    if (typeof params === "string") {
      inspection.sample = params.substring(0, 100);
    }

    return inspection;
  }
}
