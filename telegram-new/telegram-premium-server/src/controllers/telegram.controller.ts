import { NextFunction, Request, Response } from 'express';
import telegramService from '../services/telegram.service';
import axios from 'axios';
import logger from '../utils/logger';
import { activityLogRepository } from '../repository/activityLog.repository';

export const searchChannels = async (req: Request, res: Response, next: NextFunction) => {
    const { search_query } = req.body;
    const response = await telegramService.searchChannels(search_query as string);

    if (req.user && req.user._id) {
        activityLogRepository.insertActivity({
            userId: req.user._id.toString(),
            actionType: 'GROUP_SEARCHED',
            metadata: { query: search_query }
        }).catch(err => logger.error('Failed to track GROUP_SEARCHED activity', err));
    }

    next(response);
};

export const additionalChannel = async (req: Request, res: Response, next: NextFunction) => {
    const { search_query, channel_name } = req.body;
    const response = await telegramService.additionalChannel(search_query, channel_name);

    next(response);
};
export const channelMessages = async (req: Request, res: Response, next: NextFunction) => {
    const { search_query, channel_name } = req.body;
    const response = await telegramService.channelMessages(search_query, channel_name);

    next(response);
};


export const extractGroupAdmins = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { action, group } = req.body;

        if (!action || !group) {
            return res.status(400).json({ error: 'action and group are required' });
        }

        const response = await telegramService.extractGroupAdmins(action, group);
        res.json(response);
    } catch (error) {
        next(error);
    }
};

export const generatePaymentQr = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { amount, to_address, to_id, order_id, payment_method } = req.body;

        if (!amount || !to_address) {
            return res.status(400).json({ error: 'amount and to_address are required' });
        }

        const { buffer, contentType } = await telegramService.generatePaymentQr(
            String(amount),
            String(to_address),
            {
                toId: to_id != null ? String(to_id) : undefined,
                orderId: order_id != null ? String(order_id) : undefined,
                paymentMethod: payment_method != null ? String(payment_method) : undefined,
            },
        );
        res.setHeader('Content-Type', contentType);
        res.send(buffer);
    } catch (error) {
        next(error);
    }
};

export const proxyRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { query, searchId } = req.body;
        const userId = req.user?._id;
        logger.info(`proxyRequest controller called. userId=${userId}, query=${query ?? ''}`);

        if (!query) {
            logger.warn(`proxyRequest validation failed: missing query. userId=${userId}`);
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const response = await telegramService.makeProxyRequest(userId.toString(), query);
        
        if (req.user && req.user._id) {
            activityLogRepository.insertActivity({
                userId: req.user._id.toString(),
                actionType: 'GROUP_SEARCHED',
                metadata: { query, searchId }
            }).catch(err => logger.error('Failed to track GROUP_SEARCHED activity', err));
        }

        logger.info(`proxyRequest controller success. userId=${userId}`);
        res.json(response);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`proxyRequest controller error. userId=${req.user?._id}, error=${message}`);
        next(error);
    }
};

export const analyzeChannel = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { channel_username, language, analysis_type, parent_search_id } = req.body;

        if (!channel_username) {
            return res.status(400).json({ error: 'Channel username is required' });
        }

        const supportedLanguages = [
            'english', 'hindi', 'bengali', 'telugu', 'marathi', 'tamil',
            'gujarati', 'urdu', 'kannada', 'odia', 'malayalam', 'punjabi',
            'assamese', 'maithili', 'santali', 'konkani', 'sindhi',
            'dogri', 'kashmiri', 'sanskrit', 'nepali', 'chinese'
        ];

        // Normalize language: extract English name from formats like "বাংলা (bengali)"
        const normalizedLanguage = language
            ? (language.match(/\(([^)]+)\)/)?.[1]?.toLowerCase() ?? language.toLowerCase())
            : language;

        if (normalizedLanguage && !supportedLanguages.includes(normalizedLanguage)) {
            return res.status(400).json({
                error: `Unsupported language: ${language}. Supported languages: ${supportedLanguages.join(', ')}`
            });
        }

        const analysisType: 'simple' | 'comprehensive' = analysis_type === 'simple' ? 'simple' : 'comprehensive';

        const response = await telegramService.analyzeChannel(channel_username, normalizedLanguage, analysisType);
        
        if (req.user && req.user._id) {
            activityLogRepository.insertActivity({
                userId: req.user._id.toString(),
                actionType: 'AI_ANALYSIS_RUN',
                metadata: { channel_username, analysis_type: analysisType, language: normalizedLanguage, parentSearchId: parent_search_id }
            }).catch(err => logger.error('Failed to track AI_ANALYSIS_RUN activity', err));
        }

        res.json(response);
    } catch (error) {
        next(error);
    }
};

// Add this to your existing controllers
export const checkPhoneNumber = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phoneNumber } = req.body;
        const userId = req.user?._id;

        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const response = await telegramService.checkPhoneNumber(userId.toString(), phoneNumber);
        res.json(response);
    } catch (error) {
        next(error);
    }
};

export const tgDev = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { channel_name, user_id } = req.body;

        const response = await telegramService.fetchUserMessages(channel_name, user_id);

        res.json(response);
    } catch (error:any) {
        logger.error(`tgDev proxy error: ${error?.message || String(error)}`);
        res.status(500).json({ error: error.message });
    }

};

