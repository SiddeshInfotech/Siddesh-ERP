/**
 * Structured logging.
 *
 * The rule this enforces: errors are *generic to the user, specific in the log*. Generic
 * everywhere means nobody can ever debug a report from an office; specific in the UI leaks
 * internals to a storekeeper. So detail goes here, and a short sentence goes on screen.
 *
 * Never log secrets, tokens, or whole user records — ids and codes only.
 */

type LogContext = Record<string, string | number | boolean | null | undefined>

const isDev = import.meta.env.DEV

function emit(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: LogContext) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context
  }

  // Dev: readable. Production: one JSON line per entry, so a support engineer can grep a
  // log file shipped back from an office.
  if (isDev) {
    console[level](`[${level}] ${message}`, context ?? '')
    return
  }
  console[level](JSON.stringify(entry))
}

export const logger = {
  /** Verbose tracing. Stripped from the user's view in production consoles. */
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  /** Notable but expected events (login, save succeeded). */
  info: (message: string, context?: LogContext) => emit('info', message, context),
  /** Something recoverable that a human should eventually look at. */
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  /** A failure. Always pair with a generic on-screen message. */
  error: (message: string, context?: LogContext) => emit('error', message, context)
}
