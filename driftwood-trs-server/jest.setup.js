// Jest sets NODE_ENV='test' by default, but src/libs/config.ts validates NODE_ENV against
// ['development', 'staging', 'production'] at import time and calls process.exit(1) if it
// doesn't match — which would otherwise crash every single test file that transitively
// imports config.ts (nearly all of them). This runs before any test file's imports, so it
// takes effect before config.ts's own module-level validation runs.
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'test') {
  process.env.NODE_ENV = 'development';
}
