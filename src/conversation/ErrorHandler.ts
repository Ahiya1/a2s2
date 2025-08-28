import { Logger } from "../logging/Logger";

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitterFactor: number;
}

export interface ErrorContext {
  operation: string;
  attempt: number;
  totalAttempts: number;
  error: Error;
  metadata?: Record<string, unknown>;
}

export type ErrorCode =
  | "rate_limit_error" // 429 - Rate limit exceeded
  | "overloaded_error" // 529 - Server overloaded
  | "context_overflow" // Context window exceeded
  | "invalid_request" // 400 - Invalid request format
  | "authentication_error" // 401 - Invalid API key
  | "permission_denied" // 403 - Permission denied
  | "not_found" // 404 - Resource not found
  | "server_error" // 500 - Internal server error
  | "timeout_error" // Request timeout
  | "network_error" // Network connectivity issues
  | "budget_exceeded" // Cost budget exceeded
  | "unknown_error"; // Unclassified error

export class AnthropicError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode?: number,
    public retryAfter?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = "AnthropicError";
  }

  isRetryable(): boolean {
    const retryableCodes: ErrorCode[] = [
      "rate_limit_error",
      "overloaded_error",
      "server_error",
      "timeout_error",
      "network_error",
    ];
    return retryableCodes.includes(this.code);
  }
}

export class ErrorHandler {
  private static readonly DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 60000,
    jitterFactor: 0.1,
  };

  constructor(
    private options: RetryOptions = ErrorHandler.DEFAULT_RETRY_OPTIONS
  ) {}

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        Logger.debug(`Executing ${operationName}`, {
          attempt,
          maxAttempts: this.options.maxRetries,
          metadata,
        });

        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const anthropicError = this.classifyError(lastError);

        const errorContext: ErrorContext = {
          operation: operationName,
          attempt,
          totalAttempts: this.options.maxRetries,
          error: anthropicError,
          metadata,
        };

        Logger.warn(`Operation ${operationName} failed`, {
          attempt,
          errorCode: anthropicError.code,
          errorMessage: anthropicError.message,
          isRetryable: anthropicError.isRetryable(),
        });

        // Don't retry on final attempt or non-retryable errors
        if (
          attempt === this.options.maxRetries ||
          !anthropicError.isRetryable()
        ) {
          throw anthropicError;
        }

        // Calculate delay for next retry
        const delay = this.calculateRetryDelay(attempt, anthropicError);

        Logger.info(`Retrying ${operationName} in ${delay}ms`, {
          attempt: attempt + 1,
          maxAttempts: this.options.maxRetries,
        });

        await this.sleep(delay);
      }
    }

    throw (
      lastError || new AnthropicError("unknown_error", "Max retries exceeded")
    );
  }

  private classifyError(error: Error): AnthropicError {
    const message = error.message.toLowerCase();

    // Check for specific Anthropic API error patterns
    if (message.includes("429") || message.includes("rate limit")) {
      const retryAfter = this.extractRetryAfter(error.message);
      return new AnthropicError(
        "rate_limit_error",
        error.message,
        429,
        retryAfter,
        error
      );
    }

    if (message.includes("529") || message.includes("overloaded")) {
      return new AnthropicError(
        "overloaded_error",
        error.message,
        529,
        undefined,
        error
      );
    }

    if (
      message.includes("context window") ||
      message.includes("too many tokens")
    ) {
      return new AnthropicError(
        "context_overflow",
        error.message,
        400,
        undefined,
        error
      );
    }

    if (message.includes("budget") && message.includes("exceeded")) {
      return new AnthropicError(
        "budget_exceeded",
        error.message,
        400,
        undefined,
        error
      );
    }

    if (message.includes("400") || message.includes("invalid request")) {
      return new AnthropicError(
        "invalid_request",
        error.message,
        400,
        undefined,
        error
      );
    }

    if (message.includes("401") || message.includes("authentication")) {
      return new AnthropicError(
        "authentication_error",
        error.message,
        401,
        undefined,
        error
      );
    }

    if (message.includes("403") || message.includes("permission")) {
      return new AnthropicError(
        "permission_denied",
        error.message,
        403,
        undefined,
        error
      );
    }

    if (message.includes("404") || message.includes("not found")) {
      return new AnthropicError(
        "not_found",
        error.message,
        404,
        undefined,
        error
      );
    }

    if (message.includes("500") || message.includes("internal server")) {
      return new AnthropicError(
        "server_error",
        error.message,
        500,
        undefined,
        error
      );
    }

    if (message.includes("timeout") || message.includes("timed out")) {
      return new AnthropicError(
        "timeout_error",
        error.message,
        undefined,
        undefined,
        error
      );
    }

    if (message.includes("network") || message.includes("connection")) {
      return new AnthropicError(
        "network_error",
        error.message,
        undefined,
        undefined,
        error
      );
    }

    return new AnthropicError(
      "unknown_error",
      error.message,
      undefined,
      undefined,
      error
    );
  }

  private extractRetryAfter(errorMessage: string): number | undefined {
    const match = errorMessage.match(/retry-after[:\s]+(\d+)/i);
    return match ? parseInt(match[1], 10) * 1000 : undefined; // Convert to milliseconds
  }

  private calculateRetryDelay(attempt: number, error: AnthropicError): number {
    let delay: number;

    // Use server-specified retry-after for rate limits
    if (error.code === "rate_limit_error" && error.retryAfter) {
      delay = error.retryAfter;
    } else {
      // Exponential backoff with jitter
      delay = Math.min(
        this.options.baseDelay * Math.pow(2, attempt - 1),
        this.options.maxDelay
      );
    }

    // Add jitter to avoid thundering herd
    const jitter = delay * this.options.jitterFactor * Math.random();
    return Math.floor(delay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Static utility methods
  static isRetryableError(error: unknown): boolean {
    if (error instanceof AnthropicError) {
      return error.isRetryable();
    }
    return false;
  }

  static createErrorFromResponse(response: any): AnthropicError {
    const status = response.status || response.statusCode;
    const message =
      response.message || response.error?.message || "Unknown error";

    switch (status) {
      case 429:
        return new AnthropicError("rate_limit_error", message, status);
      case 529:
        return new AnthropicError("overloaded_error", message, status);
      case 400:
        return new AnthropicError("invalid_request", message, status);
      case 401:
        return new AnthropicError("authentication_error", message, status);
      case 403:
        return new AnthropicError("permission_denied", message, status);
      case 404:
        return new AnthropicError("not_found", message, status);
      case 500:
        return new AnthropicError("server_error", message, status);
      default:
        return new AnthropicError("unknown_error", message, status);
    }
  }
}
