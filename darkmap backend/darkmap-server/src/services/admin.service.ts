import config from '../config';
import { BadRequestError } from '../errors/bad-request.error';
import { InternalServerError } from '../errors/internal-server.error';
import { NotFoundError } from '../errors/not-found.error';
import { UnauthorizedError } from '../errors/unauthorized.error';
import { AdminRepository } from '../repository/admin.repository';
import { UserRepository } from '../repository/user.repository';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { customAlphabet } from 'nanoid';
import { encode, encryptionKey } from './crypto.service';
import { encodedJWTCacheManager } from './cache/entities';

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 16);

class AdminService {
    private readonly _userRepository = new UserRepository();
    constructor(private readonly _adminRepository: AdminRepository) { }

    async login(params: { email: string; password: string }) {
        const { email, password } = params;
        const admin = await this._adminRepository.getAdminByEmail(email);
        if (!admin) throw new NotFoundError('Admin not found');
        if (!admin.password) throw new BadRequestError('Invalid credentials');

        // Verify password
        const success = await this.verifyHashPassword(password, admin.password);
        if (!success) throw new UnauthorizedError('Invalid Email or Password');

        // Generate JWT token
        const accessToken = await this.generateJWTToken(admin._id);
        if (!accessToken) throw new InternalServerError('Failed to generate accessToken');

        return { accessToken, role: 'admin' };
    }

    async signup(params: { name: string; number: string; email: string; password: string }) {
        const { name, number, email, password } = params;
        const existingAdmin = await this._adminRepository.getAdminByEmail(email);

        if (existingAdmin) throw new BadRequestError('Email address already exists');

        // Hash password
        const hashedPassword = await this.hashPassword(password);

        const admin = await this._adminRepository.createAdmin({
            name,
            number,
            email,
            password: hashedPassword,
        });

        if (!admin) throw new InternalServerError('Failed to create admin');

        // Generate JWT Token
        const accessToken = await this.generateJWTToken(admin._id);
        if (!accessToken) throw new InternalServerError('Failed to generate accessToken');

        return { accessToken };
    }

    async profile(adminId: string) {
        const admin = await this._adminRepository.getAdminById(adminId);
        if (!admin) throw new NotFoundError('Admin not found');

        return admin;
    }

    async getAllUsers() {
        return this._userRepository.getAllUsers();
    }

    private async verifyHashPassword(plainTextPassword: string, hashedPassword: string) {
        return await bcrypt.compare(plainTextPassword, hashedPassword);
    }

    private async hashPassword(plainTextPassword: string) {
        return await bcrypt.hash(plainTextPassword, 10);
    }

    private async generateJWTToken(adminId: string) {
        const sessionId = nanoid();

        const token = jwt.sign(
            {
                _id: adminId.toString(),
                sessionId,
            },
            config.ADMIN_JWT_SECRET,
            { expiresIn: '24h' }
        );

        const key = await encryptionKey(config.JWT_CACHE_ENCRYPTION_KEY);
        const encryptedData = await encode(token, key);
        await encodedJWTCacheManager.set({ userId: adminId, sessionId }, encryptedData);

        return token;
    }
}

export default new AdminService(new AdminRepository());
