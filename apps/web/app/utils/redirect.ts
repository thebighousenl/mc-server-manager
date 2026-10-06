// Only same-app absolute paths ("/x") are honoured; "//host", "/\host" and full URLs fall back to "/".
export function safeRedirect(target: unknown): string {
  return typeof target === 'string' && /^\/(?![/\\])[^\t\r\n]*$/.test(target) ? target : '/'
}
