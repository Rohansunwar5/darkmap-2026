import axios from 'axios';
import config from '../config';
import { UserRepository } from '../repository/user.repository';
import { InternalServerError } from '../errors/internal-server.error';
import { NotFoundError } from '../errors/not-found.error';
import { BadRequestError } from '../errors/bad-request.error';
import logger from '../utils/logger';

/**
 * Logs what the ECS controller Lambda actually returned, so a slow/partial scrape
 * is distinguishable from a ranking problem. The Lambda's httpx timeout is 10s and
 * a cold Chromium scrape can exceed that, in which case that service contributes
 * nothing and the count silently drops.
 */
function logUpstream(route: string, searchQuery: string, data: any, ms: number) {
    try {
        const channels = Array.isArray(data?.channels) ? data.channels : [];
        const names = Array.isArray(data?.channel_names) ? data.channel_names : [];
        const withDesc = channels.filter((c: any) => (c?.description || '').trim().length > 0).length;
        logger.info(
            `[upstream ${route}] query="${searchQuery}" ${ms}ms ` +
            `channel_names=${names.length} channels=${channels.length} withDescription=${withDesc}` +
            (channels.length === 0 && names.length > 0 ? '  <-- OLD CONTRACT: no descriptions returned' : '')
        );
    } catch (err) {
        logger.error(`[upstream ${route}] log failed: ${err}`);
    }
}

const LEGACY_TG = 'https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/tg';
const LEGACY_TG2 = 'https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/tg-2';

/** Decodo route when SCRAPER_URL is set, otherwise the original ECS fleet. */
function upstream(legacyUrl: string) {
    return config.SCRAPER_URL || legacyUrl;
}

function upstreamOptions() {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.SCRAPER_URL && config.SCRAPER_API_KEY) {
        headers['x-api-key'] = config.SCRAPER_API_KEY;
    }
    // The fleet answered in ~3s; a rendered scrape is ~13-18s, and axios has no
    // default timeout, so an upstream stall would hang the request forever.
    return { headers, timeout: config.SCRAPER_TIMEOUT_MS };
}

class TelegramService {
    constructor(private readonly _userRepository: UserRepository) { }

    async searchChannels(searchQuery: string) {
        const startedAt = Date.now();
        const url = upstream(LEGACY_TG);
        const response = await axios.post(
            url,
            { search_query: searchQuery },
            upstreamOptions()
        );

        if (response.status !== 200) {
            throw new InternalServerError('Failed to fetch channels');
        }

        logUpstream(config.SCRAPER_URL ? '/tg (decodo)' : '/tg', searchQuery, response.data, Date.now() - startedAt);
        return response.data;
    }

    async searchChannelsAdvanced(searchQuery: string, includeKeywords: string[] = [], excludeKeywords: string[] = []) {
        const startedAt = Date.now();
        // dork6 is the exceptional path: the query is built from keywords the
        // user supplies, not from a fixed dork. The Decodo Lambda branches on
        // the presence of these keys exactly as /tg-2 does today.
        const response = await axios.post(
            upstream(LEGACY_TG2),
            {
                search_query: searchQuery,
                include_keywords: includeKeywords,
                exclude_keywords: excludeKeywords
            },
            upstreamOptions()
        );

        if (response.status !== 200) {
            throw new InternalServerError('Failed to fetch advanced channels');
        }

        logUpstream(config.SCRAPER_URL ? '/tg-2 (decodo)' : '/tg-2', searchQuery, response.data, Date.now() - startedAt);
        return response.data;
    }

    async additionalChannel(searchQuery: string, channelName: string,
        includeKeywords: string[] = [], excludeKeywords: string[] = []) {
        const response = await axios.post(
            'https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/add-ch',
            {
                search_query: searchQuery, channel_name: channelName,
                include_keywords: includeKeywords, exclude_keywords: excludeKeywords
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.status !== 200) {
            throw new InternalServerError('Failed to add channel');
        }

        return response.data;
    }

    /**
     * Telegram's messages.search takes one plain string - no OR, no negation -
     * so the advanced keywords cannot go into searchQuery. The Lambda scans
     * wider and applies the dork6 boolean itself. Omitting them (every
     * non-advanced search) leaves the upstream behaviour unchanged.
     */
    async channelMessages(searchQuery: string, channelName: string,
        includeKeywords: string[] = [], excludeKeywords: string[] = []) {
        const response = await axios.post(
            'https://4phuyf7tlf.execute-api.us-east-1.amazonaws.com/prod/get_tg_msg',
            {
                search_query: searchQuery, channel_name: channelName,
                include_keywords: includeKeywords, exclude_keywords: excludeKeywords
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.status !== 200) {
            throw new InternalServerError('Failed to add channel');
        }

        return response.data;
    }

    async startFirstService(email: string) {
        const response = await axios.post(
            `https://7bz70q53n2.execute-api.us-east-1.amazonaws.com/prod/start-service`,
            { email },
            {
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        )

        if (response.status !== 200) {
            throw new InternalServerError('Failed to start first service');
        }

        return response.data;
    }

    async startSecondService(email: string) {
        const response = await axios.post(
            `https://3n9j098tbf.execute-api.us-east-1.amazonaws.com/prod/start-services`,
            { email },
            {
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        )

        if (response.status !== 200) {
            throw new InternalServerError('Failed to start first service');
        }

        return response.data;
    }

    // private isSuccessfulResponse(response: any): boolean {
    //     if (response?.status === 'error') {
    //         return false;
    //     }
    //     return true;
    // }

    // Add this to your TelegramService class

    async proxyRequest(query: string) {
        const API_URL = 'https://api.tgdev.io/tgscan/v1/search';
        const API_KEY = process.env.TG_DEV_API_KEY;


        const formData = new URLSearchParams();
        formData.append('query', query);

        const response = await axios.post(API_URL, formData, {
            headers: {
                'Api-Key': API_KEY,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        if (response.status !== 200) {
            throw new InternalServerError('Failed to forward request');
        }

        return response.data;
    }

    async analyzeChannel(channelUsername: string) {
        const response = await axios.post(
            'https://analyze.darkmap.org/analyze-channel',
            { channel_username: channelUsername },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.status !== 200) {
            throw new InternalServerError('Failed to analyze channel');
        }

        return response.data;
    }
}

export default new TelegramService(new UserRepository());
