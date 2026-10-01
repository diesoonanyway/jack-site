export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: {
    last_row_id?: number;
  };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]>;
}

export interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

export interface CommentsEnv {
  ASSETS: AssetsBinding;
  COMMENTS_DB?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  ADMIN_GOOGLE_SUB?: string;
}

export interface SessionUser {
  sessionId: string;
  csrfToken: string;
  userId: number;
  googleSub: string;
  displayName: string;
  blocked: boolean;
  admin: boolean;
}
