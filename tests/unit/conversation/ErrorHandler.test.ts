import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  ErrorHandler,
  AnthropicError,
  RetryOptions,
} from "../../../src/conversation/ErrorHandler";

describe("ErrorHandler", () => {
  let errorHandler: ErrorHandler;
  let mockOperation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    errorHandler = new ErrorHandler();
    mockOperation = vi.fn();
  });

  test("should create with default options", () => {
    expect(errorHandler).toBeDefined();
  });

  test("should create with custom options", () => {
    const customOptions: RetryOptions = {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 30000,
      jitterFactor: 0.2,
    };

    const customHandler = new ErrorHandler(customOptions);
    expect(customHandler).toBeDefined();
  });

  test("should execute successful operation without retries", async () => {
    const expectedResult = "success";
    mockOperation.mockResolvedValueOnce(expectedResult);

    const result = await errorHandler.executeWithRetry(
      mockOperation,
      "test_operation"
    );

    expect(result).toBe(expectedResult);
    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  test("should retry on retryable errors", async () => {
    const error = new Error("Server temporarily unavailable");
    error.message = "429 rate limit exceeded";

    mockOperation
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("success after retries");

    const result = await errorHandler.executeWithRetry(
      mockOperation,
      "retry_test",
      { maxRetries: 3 }
    );

    expect(result).toBe("success after retries");
    expect(mockOperation).toHaveBeenCalledTimes(3);
  });

  test("should not retry on non-retryable errors", async () => {
    const error = new Error("Invalid API key");
    error.message = "401 authentication failed";

    mockOperation.mockRejectedValueOnce(error);

    await expect(
      errorHandler.executeWithRetry(mockOperation, "auth_test")
    ).rejects.toThrow(AnthropicError);

    expect(mockOperation).toHaveBeenCalledTimes(1);
  });

  test("should throw after max retries exceeded", async () => {
    const customHandler = new ErrorHandler({ maxRetries: 2 });
    const error = new Error("Server overloaded");
    error.message = "529 server overloaded";

    mockOperation.mockRejectedValue(error);

    await expect(
      customHandler.executeWithRetry(mockOperation, "max_retries_test")
    ).rejects.toThrow(AnthropicError);

    expect(mockOperation).toHaveBeenCalledTimes(2);
  });

  describe("AnthropicError", () => {
    test("should create AnthropicError correctly", () => {
      const error = new AnthropicError(
        "rate_limit_error",
        "Rate limit exceeded",
        429,
        5000
      );

      expect(error.code).toBe("rate_limit_error");
      expect(error.message).toBe("Rate limit exceeded");
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(5000);
      expect(error.name).toBe("AnthropicError");
    });

    test("should identify retryable errors", () => {
      const retryableError = new AnthropicError(
        "rate_limit_error",
        "Rate limited"
      );
      const nonRetryableError = new AnthropicError(
        "authentication_error",
        "Invalid API key"
      );

      expect(retryableError.isRetryable()).toBe(true);
      expect(nonRetryableError.isRetryable()).toBe(false);
    });

    test("should classify rate limit errors", async () => {
      const error = new Error("429 Too Many Requests");
      mockOperation.mockRejectedValueOnce(error);

      try {
        await errorHandler.executeWithRetry(mockOperation, "rate_limit_test");
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AnthropicError);
        expect((thrownError as AnthropicError).code).toBe("rate_limit_error");
      }
    });

    test("should classify server overload errors", async () => {
      const error = new Error("529 Server Overloaded");
      mockOperation.mockRejectedValueOnce(error);

      try {
        await errorHandler.executeWithRetry(
          mockOperation,
          "overload_test",
          undefined,
          { maxRetries: 1 }
        );
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AnthropicError);
        expect((thrownError as AnthropicError).code).toBe("overloaded_error");
      }
    });

    test("should classify context overflow errors", async () => {
      const error = new Error("Context window exceeded");
      mockOperation.mockRejectedValueOnce(error);

      try {
        await errorHandler.executeWithRetry(mockOperation, "context_test");
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AnthropicError);
        expect((thrownError as AnthropicError).code).toBe("context_overflow");
      }
    });

    test("should classify authentication errors", async () => {
      const error = new Error("401 Unauthorized");
      mockOperation.mockRejectedValueOnce(error);

      try {
        await errorHandler.executeWithRetry(mockOperation, "auth_test");
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AnthropicError);
        expect((thrownError as AnthropicError).code).toBe(
          "authentication_error"
        );
      }
    });

    test("should classify budget exceeded errors", async () => {
      const error = new Error("Budget exceeded for this request");
      mockOperation.mockRejectedValueOnce(error);

      try {
        await errorHandler.executeWithRetry(mockOperation, "budget_test");
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AnthropicError);
        expect((thrownError as AnthropicError).code).toBe("budget_exceeded");
      }
    });

    test("should classify timeout errors", async () => {
      const error = new Error("Request timeout");
      mockOperation.mockRejectedValueOnce(error);

      try {
        await errorHandler.executeWithRetry(
          mockOperation,
          "timeout_test",
          undefined,
          { maxRetries: 1 }
        );
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AnthropicError);
        expect((thrownError as AnthropicError).code).toBe("timeout_error");
      }
    });

    test("should classify unknown errors", async () => {
      const error = new Error("Some unknown error");
      mockOperation.mockRejectedValueOnce(error);

      try {
        await errorHandler.executeWithRetry(mockOperation, "unknown_test");
      } catch (thrownError) {
        expect(thrownError).toBeInstanceOf(AnthropicError);
        expect((thrownError as AnthropicError).code).toBe("unknown_error");
      }
    });
  });

  test("should extract retry-after header", async () => {
    const error = new Error("Rate limited - retry-after: 60");
    mockOperation.mockRejectedValueOnce(error);

    const customHandler = new ErrorHandler({ maxRetries: 1 });

    try {
      await customHandler.executeWithRetry(mockOperation, "retry_after_test");
    } catch (thrownError) {
      expect(thrownError).toBeInstanceOf(AnthropicError);
      expect((thrownError as AnthropicError).retryAfter).toBe(60000); // Converted to milliseconds
    }
  });

  test("should apply exponential backoff with jitter", async () => {
    vi.useFakeTimers();

    const error = new Error("Server temporarily unavailable");
    error.message = "503 service unavailable";

    mockOperation
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("success");

    const startTime = Date.now();

    const executePromise = errorHandler.executeWithRetry(
      mockOperation,
      "backoff_test"
    );

    // Fast-forward through the delays
    vi.advanceTimersByTime(1000); // First retry delay
    await Promise.resolve(); // Allow promise to continue
    vi.advanceTimersByTime(2000); // Second retry delay
    await Promise.resolve();

    const result = await executePromise;

    expect(result).toBe("success");
    expect(mockOperation).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  test("should handle retry-after delays", async () => {
    vi.useFakeTimers();

    const customHandler = new ErrorHandler({ maxRetries: 2 });
    const error = new Error("429 Rate limit - retry-after: 5");
    mockOperation
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce("success after retry-after");

    const executePromise = customHandler.executeWithRetry(
      mockOperation,
      "retry_after_delay_test"
    );

    vi.advanceTimersByTime(5000); // Wait for retry-after delay
    await Promise.resolve();

    const result = await executePromise;
    expect(result).toBe("success after retry-after");

    vi.useRealTimers();
  });

  describe("static utility methods", () => {
    test("should identify retryable errors", () => {
      const retryableError = new AnthropicError(
        "rate_limit_error",
        "Rate limited"
      );
      const nonRetryableError = new Error("Regular error");
      const authError = new AnthropicError(
        "authentication_error",
        "Auth failed"
      );

      expect(ErrorHandler.isRetryableError(retryableError)).toBe(true);
      expect(ErrorHandler.isRetryableError(nonRetryableError)).toBe(false);
      expect(ErrorHandler.isRetryableError(authError)).toBe(false);
    });

    test("should create error from response object", () => {
      const response = {
        status: 429,
        message: "Too many requests",
      };

      const error = ErrorHandler.createErrorFromResponse(response);

      expect(error).toBeInstanceOf(AnthropicError);
      expect(error.code).toBe("rate_limit_error");
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe("Too many requests");
    });

    test("should handle response without status", () => {
      const response = {
        error: { message: "Unknown error occurred" },
      };

      const error = ErrorHandler.createErrorFromResponse(response);

      expect(error).toBeInstanceOf(AnthropicError);
      expect(error.code).toBe("unknown_error");
    });
  });

  test("should include metadata in error context", async () => {
    const metadata = { userId: "test_user", operation: "test_op" };
    const error = new Error("Test error");
    mockOperation.mockRejectedValueOnce(error);

    try {
      await errorHandler.executeWithRetry(
        mockOperation,
        "metadata_test",
        metadata
      );
    } catch (thrownError) {
      expect(thrownError).toBeInstanceOf(AnthropicError);
    }
  });

  test("should handle malformed retry-after values", async () => {
    const error = new Error("Rate limited - retry-after: invalid");
    mockOperation.mockRejectedValueOnce(error);

    try {
      await errorHandler.executeWithRetry(mockOperation, "malformed_retry");
    } catch (thrownError) {
      expect(thrownError).toBeInstanceOf(AnthropicError);
      expect((thrownError as AnthropicError).retryAfter).toBeUndefined();
    }
  });
});
