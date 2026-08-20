const REFRESH_COOKIE = 'refreshToken';

function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAgeMs = Number(process.env.JWT_REFRESH_COOKIE_MS) || 7 * 24 * 60 * 60 * 1000;

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    ...refreshCookieOptions(),
    maxAge: 0,
  });
}

function getRefreshTokenFromRequest(req) {
  return req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null;
}

module.exports = {
  REFRESH_COOKIE,
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshTokenFromRequest,
};
