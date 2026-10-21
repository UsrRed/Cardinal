export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

export type PublicErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'csrf_failed'
  | 'forbidden_origin'
  | 'not_found'
  | 'run_already_active'
  | 'rate_limited'
  | 'destination_blocked'
  | 'internal_error';
