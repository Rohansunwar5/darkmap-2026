import { NextFunction, Request, Response } from 'express';
import { ChannelService } from '../services/channel.service';
import { activityLogRepository } from '../repository/activityLog.repository';
import logger from '../utils/logger';

export const scrapeChannel = async (req: Request, res: Response, next: NextFunction) => {
    const channelService = new ChannelService();
    // Validate inputs
    const { channelName, limit, since, triggerWords } = req.body;

    // The service handles formatting since it receives IScrapeParams
    const response = await channelService.scrapeChannel({
        channelName,
        limit,
        since,
        triggerWords
    });

    next(response);
};

export const summarizeMessages = async (req: Request, res: Response, next: NextFunction) => {
    const channelService = new ChannelService();
    const { messages, channelName } = req.body;

    const response = await channelService.summarizeMessages(messages, channelName);

    next({ summary: response });
};

export const analyzeChannel = async (req: Request, res: Response, next: NextFunction) => {
    const channelService = new ChannelService();
    const { channelUsername, language } = req.body;

    const response = await channelService.analyzeChannel(channelUsername, language || 'english');

    if (req.user && req.user._id) {
        activityLogRepository.insertActivity({
            userId: req.user._id.toString(),
            actionType: 'AI_ANALYSIS_RUN',
            metadata: { channelUsername, language }
        }).catch(err => logger.error('Failed to track AI_ANALYSIS_RUN activity', err));
    }

    next(response);
};

export const getChannelInfo = async (req: Request, res: Response, next: NextFunction) => {
    const channelService = new ChannelService();
    const { channelName } = req.body;

    const response = await channelService.getChannelInfo(channelName);

    next(response);
};

export const searchChannels = async (req: Request, res: Response, next: NextFunction) => {
    const channelService = new ChannelService();
    const { query } = req.body;

    const response = await channelService.searchChannels(query);

    next(response);
};

export const getAccountsStatus = async (req: Request, res: Response, next: NextFunction) => {
    const channelService = new ChannelService();

    const response = await channelService.getAccountsStatus();

    next(response);
};

export const resetAccountLimits = async (req: Request, res: Response, next: NextFunction) => {
    const channelService = new ChannelService();

    const response = await channelService.resetAccountLimits();

    next(response);
};

export const getSupportedLanguages = async (req: Request, res: Response, next: NextFunction) => {
    const channelService = new ChannelService();

    const response = await channelService.getSupportedLanguages();

    next({ supported_languages: response });
};
