import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { customAlphabet } from 'nanoid';
import config from '../config';
import { encode, decode, encryptionKey } from './crypto.service';
import { UserRepository } from '../repository/user.repository';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { BadRequestError } from '../errors/bad-request.error';
import redisClient from './cache';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 32);

const CHALLENGE_TTL_SECONDS = 300; // 5 minutes
const MAX_ATTEMPTS = 5;
const REDIS_PREFIX = `${config.SERVER_NAME}_2fa_challenge`;
const APP_NAME = 'DarkMap';

interface TwoFactorChallenge {
  userId: string;
  pendingSecret?: string; // plain-text secret, only during setup phase
  phase: 'setup' | 'verify';
  attempts: number;
}

class TwoFactorService {
  constructor(private readonly _userRepository: UserRepository) {}

  // ─── Redis Challenge Management ───────────────────────────────────────────

  private _challengeKey(challengeId: string): string {
    return `${REDIS_PREFIX}:${challengeId}`;
  }

  async createChallenge(userId: string, phase: 'setup' | 'verify', pendingSecret?: string): Promise<string> {
    const challengeId = nanoid();
    const challenge: TwoFactorChallenge = {
      userId,
      phase,
      attempts: 0,
      ...(pendingSecret && { pendingSecret }),
    };

    await redisClient.setEx(
      this._challengeKey(challengeId),
      CHALLENGE_TTL_SECONDS,
      JSON.stringify(challenge),
    );

    return challengeId;
  }

  private async _getChallenge(challengeId: string): Promise<TwoFactorChallenge | null> {
    const data = await redisClient.get(this._challengeKey(challengeId));
    if (!data) return null;
    return JSON.parse(data) as TwoFactorChallenge;
  }

  private async _updateChallenge(challengeId: string, challenge: TwoFactorChallenge): Promise<void> {
    // Preserve the remaining TTL
    const ttl = await redisClient.ttl(this._challengeKey(challengeId));
    if (ttl > 0) {
      await redisClient.setEx(
        this._challengeKey(challengeId),
        ttl,
        JSON.stringify(challenge),
      );
    }
  }

  private async _deleteChallenge(challengeId: string): Promise<void> {
    await redisClient.del(this._challengeKey(challengeId));
  }

  // ─── TOTP Operations ─────────────────────────────────────────────────────

  generateTOTPSecret(): string {
    return generateSecret();
  }

  async generateSetupData(secret: string, userEmail: string): Promise<string> {
    const otpAuthUrl = generateURI({
      secret,
      label: userEmail,
      issuer: APP_NAME,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
    return qrCodeDataUrl;
  }

  async verifyCode(code: string, secret: string): Promise<boolean> {
    const result = await verify({ token: code, secret });
    return result.valid;
  }

  // ─── Encryption (at-rest in MongoDB) ──────────────────────────────────────

  async encryptSecret(secret: string): Promise<{ iv: string; encryptedData: string }> {
    const key = await encryptionKey(config.TWO_FA_ENCRYPTION_KEY);
    return encode(secret, key);
  }

  async decryptSecret(encrypted: { iv: string; encryptedData: string }): Promise<string> {
    const key = await encryptionKey(config.TWO_FA_ENCRYPTION_KEY);
    return decode(encrypted, key);
  }

  // ─── Recovery Codes ───────────────────────────────────────────────────────

  generateRecoveryCodes(): string[] {
    // Generate 10 codes, 8 characters each (e.g., A4F9B2C1)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const generateCode = customAlphabet(alphabet, 8);
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(generateCode());
    }
    return codes;
  }

  // ─── Core Verification Flow ───────────────────────────────────────────────

  async verifyChallenge(challengeId: string, code: string): Promise<{ userId: string; recoveryCodes?: string[] }> {
    const challenge = await this._getChallenge(challengeId);
    if (!challenge) {
      throw new UnauthorizedError('2FA challenge expired or invalid. Please login again.');
    }

    // Brute-force check
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await this._deleteChallenge(challengeId);
      throw new BadRequestError('Too many failed attempts. Please login again.');
    }

    // Determine if the input code is a recovery code (e.g., 8 alphanumeric chars)
    const isRecoveryCode = code.length === 8 && /^[a-zA-Z0-9]+$/.test(code);

    let secret: string;
    let userFromDb;
    let isValid = false;
    let matchedRecoveryCodeHash: string | null = null;

    if (challenge.phase === 'setup') {
      if (isRecoveryCode) {
        throw new BadRequestError('Cannot use a recovery code during setup.');
      }
      // During setup, the plain-text secret is stored in the Redis challenge
      if (!challenge.pendingSecret) {
        await this._deleteChallenge(challengeId);
        throw new UnauthorizedError('Invalid challenge state. Please login again.');
      }
      secret = challenge.pendingSecret;
      isValid = await this.verifyCode(code, secret);
    } else {
      // During verify, fetch user data including secret and recovery codes
      userFromDb = await this._userRepository.getUserWithTwoFactorData(challenge.userId);
      if (!userFromDb?.twoFactorSecret) {
        await this._deleteChallenge(challengeId);
        throw new UnauthorizedError('2FA not configured. Please login again.');
      }
      
      if (isRecoveryCode) {
        // Handle Recovery Code Verification
        const recoveryCodes = userFromDb.recoveryCodes || [];
        const bcrypt = require('bcrypt'); // ensure bcrypt is available
        for (const hashedCode of recoveryCodes) {
          const matches = await bcrypt.compare(code.toUpperCase(), hashedCode);
          if (matches) {
            isValid = true;
            matchedRecoveryCodeHash = hashedCode;
            break;
          }
        }
      } else {
        // Handle TOTP Verification
        secret = await this.decryptSecret(userFromDb.twoFactorSecret);
        isValid = await this.verifyCode(code, secret);
      }
    }

    if (!isValid) {
      challenge.attempts += 1;

      if (challenge.attempts >= MAX_ATTEMPTS) {
        await this._deleteChallenge(challengeId);
        throw new BadRequestError('Too many failed attempts. Please login again.');
      }

      await this._updateChallenge(challengeId, challenge);
      const remaining = MAX_ATTEMPTS - challenge.attempts;
      throw new UnauthorizedError(`Invalid code. ${remaining} attempt(s) remaining.`);
    }

    // ── Success ──
    let plainRecoveryCodes: string[] | undefined;

    if (challenge.phase === 'setup') {
      // Setup phase: encrypt secret, generate recovery codes, hash them, save all to DB
      const encryptedSecret = await this.encryptSecret(secret!);
      plainRecoveryCodes = this.generateRecoveryCodes();
      
      const bcrypt = require('bcrypt');
      const hashedCodes = await Promise.all(plainRecoveryCodes.map(c => bcrypt.hash(c, 10)));
      
      await this._userRepository.saveTwoFactorData(challenge.userId, encryptedSecret, hashedCodes);
    } else if (matchedRecoveryCodeHash) {
      // Verify phase with recovery code: consume it so it can't be used again
      await this._userRepository.consumeRecoveryCode(challenge.userId, matchedRecoveryCodeHash);
    }

    // Clean up the challenge from Redis
    await this._deleteChallenge(challengeId);

    return { userId: challenge.userId, recoveryCodes: plainRecoveryCodes };
  }
}

export default new TwoFactorService(new UserRepository());
