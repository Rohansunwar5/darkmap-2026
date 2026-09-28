import TelegramAccountModel, { ITelegramAccount } from '../models/telegramAccount.model';

export class TelegramAccountRepository {
    async getNextAvailableAccount(excludeIndices: number[] = []): Promise<ITelegramAccount> {
        const now = new Date();

        // Round-robin via least-recently-used: pick the account used longest ago and stamp
        // lastUsed at selection time, atomically, so concurrent cluster processes don't grab the same one.
        const account = await TelegramAccountModel.findOneAndUpdate({
            index: { $nin: excludeIndices },
            disabled: { $ne: true },
            $or: [
                { rateLimitedUntil: null },
                { rateLimitedUntil: { $lte: now } }
            ]
        }, {
            lastUsed: now,
        }, {
            sort: { lastUsed: 1 }, // never-used (null) first, then oldest
            new: true,
        });

        if (!account) {
            if (excludeIndices.length > 0) {
                throw new Error('All remaining accounts failed or are rate limited.');
            }
            throw new Error('All accounts are currently rate limited. Please wait.');
        }

        return account;
    }

    async updateAccountUsage(accountId: string): Promise<void> {
        await TelegramAccountModel.findByIdAndUpdate(accountId, {
            $inc: { usageCount: 1 },
            lastUsed: new Date(),
            // Clear rate limit if it was successfully used
            rateLimitedUntil: null,
        });
    }

    async markAccountDisabled(accountId: string): Promise<void> {
        await TelegramAccountModel.findByIdAndUpdate(accountId, { disabled: true });
    }

    async markAccountRateLimited(accountId: string, waitSeconds: number = 3600): Promise<void> {
        const rateLimitedUntil = new Date(Date.now() + waitSeconds * 1000);
        await TelegramAccountModel.findByIdAndUpdate(accountId, {
            rateLimitedUntil
        });
    }

    async getAccountsStatus(): Promise<any[]> {
        const accounts = await TelegramAccountModel.find().lean();
        const now = new Date();

        return accounts.map(account => {
            let isRateLimited = false;

            if (account.rateLimitedUntil) {
                isRateLimited = now <= new Date(account.rateLimitedUntil);
            }

            return {
                index: account.index,
                phoneNumber: account.phoneNumber,
                lastUsed: account.lastUsed,
                usageCount: account.usageCount,
                isRateLimited,
                rateLimitedUntil: isRateLimited ? account.rateLimitedUntil : null
            };
        });
    }

    async resetRateLimits(): Promise<void> {
        await TelegramAccountModel.updateMany({}, {
            rateLimitedUntil: null
        });
    }

    async countAccounts(): Promise<number> {
        return TelegramAccountModel.countDocuments();
    }
}
