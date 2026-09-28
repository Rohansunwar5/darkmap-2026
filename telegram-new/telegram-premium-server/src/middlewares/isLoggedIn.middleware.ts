import config from '../config';
import requireAuth from './auth/require-auth.middleware';
import getAuthMiddlewareByJWTSecret from './auth/verify-token.middleware';

const isLoggedIn = [
  getAuthMiddlewareByJWTSecret(config.JWT_SECRET),
  requireAuth,
];

export default isLoggedIn;
