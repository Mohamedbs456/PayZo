/**
 * Mirrors the backend ApiResponse<T> envelope from payzo-backend.
 * See CLAUDE.md > API Conventions.
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  errorCode?: string;
}

/** Mirrors the backend PagedResponse<T> for list endpoints. */
export interface PagedResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
