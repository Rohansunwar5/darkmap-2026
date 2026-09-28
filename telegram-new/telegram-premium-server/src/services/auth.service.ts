import config from '../config';
import { BadRequestError } from '../errors/bad-request.error';
import { InternalServerError } from '../errors/internal-server.error';
import { NotFoundError } from '../errors/not-found.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { UserRepository } from '../repository/user.repository';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { customAlphabet } from 'nanoid';
import { encode, encryptionKey } from './crypto.service';
import { encodedJWTCacheManager, profileCacheManager } from './cache/entities';
import twoFactorService from './twoFactor.service';
import { activityLogRepository } from '../repository/activityLog.repository';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 16);
const numericNanoid = customAlphabet('0123456789', 6);

class AuthService {
  constructor(private readonly _userRepository: UserRepository) {
  }


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async login(params: { email: string, password: string }) {
    const { email, password } = params;
    const user = await this._userRepository.getUserByEmailId(email);
    if (!user) throw new NotFoundError('User not found');
    if (!user.password) throw new BadRequestError('Reset password');

    // password is validation;
    const success = await this.verifyHashPassword(password, user.password);
    if (!success) throw new UnauthorizedError('Invalid Email or Password');

    // ── 2FA Gate ──
    if (user.is2faEnabled) {
      // Fetch the user with twoFactorSecret (select: false by default)
      const userWith2FA = await this._userRepository.getUserWithTwoFactorData(user._id);

      if (!userWith2FA?.twoFactorSecret) {
        // Setup phase: user has 2FA enabled but hasn't set up their authenticator yet
        const secret = twoFactorService.generateTOTPSecret();
        const qrCode = await twoFactorService.generateSetupData(secret, user.email);
        const challengeId = await twoFactorService.createChallenge(user._id, 'setup', secret);

        return {
          requires2FA: true,
          setupRequired: true,
          challengeId,
          qrCode,
        };
      } else {
        // Verification phase: user already has a secret, just need the code
        const challengeId = await twoFactorService.createChallenge(user._id, 'verify');

        return {
          requires2FA: true,
          setupRequired: false,
          challengeId,
        };
      }
    }

    // No 2FA — issue token directly
    const accessToken = await this.generateJWTToken(user._id, false);
    if (!accessToken) throw new InternalServerError('Failed to generate accessToken');

    return { accessToken };
  }

  async verify2FA(params: { challengeId: string; code: string }) {
    const { challengeId, code } = params;

    // Verify the challenge and get the userId and any recovery codes on success
    const { userId, recoveryCodes } = await twoFactorService.verifyChallenge(challengeId, code);

    // Generate the final access token
    const accessToken = await this.generateJWTToken(userId, true);
    if (!accessToken) throw new InternalServerError('Failed to generate accessToken');

    return { accessToken, recoveryCodes };
  }

  async verifyHashPassword(plainTextPassword: string, hashedPassword: string) {
    return await bcrypt.compare(plainTextPassword, hashedPassword);
  }

  async hashPassword(plainTextPassword: string) {
    return await bcrypt.hash(plainTextPassword, 10);
  }

  async generateJWTToken(userId: string, is2faVerified: boolean = false) {
    const sessionId = nanoid();

    const token = jwt.sign({
      _id: userId.toString(),
      sessionId,
      is2faVerified,
      role: 'user'
    }, config.JWT_SECRET, { expiresIn: '24h' });

    const key = await encryptionKey(config.JWT_CACHE_ENCRYPTION_KEY);
    const encryptedData = await encode(token, key);
    await encodedJWTCacheManager.set({ userId: userId.toString(), sessionId }, encryptedData);

    // Track the login activity safely
    activityLogRepository.insertActivity({
        userId: userId.toString(),
        actionType: 'LOGIN',
        metadata: { sessionId }
    }).catch(err => console.error('[AuthService] Failed to track login activity:', err));

    return token;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  async signup(params: any) {
    const { firstName, lastName, email, password } = params;
    const existingUser = await this._userRepository.getUserByEmailId(email);

    if (existingUser) throw new BadRequestError('Email address already exists');

    // get hashedPassword
    const hashedPassword = await this.hashPassword(password);

    const user = await this._userRepository.onBoardUser({
      firstName, lastName, email, password: hashedPassword
    });

    if (!user) throw new InternalServerError('Failed to Onboard user');

    // generate JWT Token
    const accessToken = await this.generateJWTToken(user._id, false);
    if (!accessToken) throw new InternalServerError('Failed to generate accessToken');

    return { accessToken };
  }

  async profile(userId: string) {
      const user = await this._userRepository.getUserById(userId);
      if (!user) throw new NotFoundError('User not found');
      return user;
  }
}

export default new AuthService(new UserRepository());