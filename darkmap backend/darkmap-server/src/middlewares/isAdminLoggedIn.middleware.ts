import config from '../config';
import requireAdminAuth from './auth/require-admin-auth.middleware';
import getAdminAuthMiddlewareByJWTSecret from './auth/verify-admin-token.middleware';

const isAdminLoggedIn = [
    getAdminAuthMiddlewareByJWTSecret(config.ADMIN_JWT_SECRET),
    requireAdminAuth,
];

export default isAdminLoggedIn;
