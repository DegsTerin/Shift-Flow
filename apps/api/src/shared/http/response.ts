export function ok<T>(data: T, meta?: unknown) {
  return { data, meta };
}

export function created<T>(data: T) {
  return { data };
}
