/**
 * Parse CORS_ORIGIN env into a normalized allow-list.
 * Accepts comma-separated URLs; strips quotes and trailing slashes.
 */
function parseCorsOrigins(raw) {
  return String(raw || 'http://localhost:3000')
    .split(',')
    .map((o) =>
      o
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\/$/, '')
    )
    .filter(Boolean);
}

/**
 * Express/socket.io cors `origin` option: reflect allowed browser origins.
 */
function createCorsOriginChecker(raw = process.env.CORS_ORIGIN) {
  const allowed = parseCorsOrigins(raw);

  return function corsOrigin(origin, callback) {
    // curl / server-to-server (no Origin header)
    if (!origin) {
      return callback(null, true);
    }

    const normalized = String(origin).replace(/\/$/, '');
    if (allowed.includes(normalized)) {
      return callback(null, true);
    }

    console.warn(
      `[CORS] blocked origin "${origin}" — allowed: ${allowed.join(', ') || '(none)'}`
    );
    return callback(null, false);
  };
}

module.exports = {
  parseCorsOrigins,
  createCorsOriginChecker,
};
