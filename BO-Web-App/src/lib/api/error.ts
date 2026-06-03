export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | undefined;

  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorCode = errorCode;
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }
}

export class NetworkError extends Error {
  constructor(message = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}
