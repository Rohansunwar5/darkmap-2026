import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import NodeCache from "node-cache";
import helmet from "helmet";
import compression from "compression";
import cron from 'node-cron';
import allGroupNames from "./constants/groupNames.js";

const app = express();
const PORT = process.env.PORT || 3001;
const API_BASE_URL = "https://api.ransomfeed.it/";

const BATCH_SIZE = 3;
const MAX_RETRIES = 1;
const CACHE_TTL = 6 * 3600;
const FETCH_TIMEOUT = 5000;
const MAX_CACHE_SIZE = 50000;
const RATE_LIMIT_DELAY = 1000;
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;


app.use(helmet());
app.use(compression());
app.use(cors());

// cache configuration
const cache = new NodeCache({
    stdTTL: CACHE_TTL,
    checkperiod: 120,
    useClones: false,
    maxKeys: MAX_CACHE_SIZE
});

const requestTracker = {
    count: 0,
    lastReset: Date.now(),
    resetCounters: function () {
        const now = Date.now();
        if (now - this.lastReset > RATE_LIMIT_WINDOW) {
            this.count = 0;
            this.lastReset = now;
        }
    },
    increment: function () {
        this.resetCounters();
        this.count++;
    },
    isOverLimit: function () {
        this.resetCounters();
        return this.count >= MAX_REQUESTS_PER_WINDOW;
    }
};

const failedGroups = new Map();
let refreshInProgress = false;

async function fetchWithTimeout(url, timeout = FETCH_TIMEOUT) {
    if (requestTracker.isOverLimit()) {
        const waitTime = RATE_LIMIT_WINDOW - (Date.now() - requestTracker.lastReset);
        console.warn(`Rate limit approaching, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        requestTracker.resetCounters();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        requestTracker.increment();
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);


        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || 5;
            console.warn(`Rate limited, retrying after ${retryAfter} seconds`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            return fetchWithTimeout(url, timeout);
        }

        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

async function fetchGroupData(group, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const apiUrl = `${API_BASE_URL}/gang/${group}/offset/990`;
            const response = await fetchWithTimeout(apiUrl);

            if (!response.ok) {
                if (response.status === 429 || response.status === 403) {
                    throw new Error('RateLimited');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            const normalizedData = Array.isArray(data) ?
                data.map(item => ({
                    victim: item.victim || "Unknown",
                    group: item.gang || group,
                    description: item.description || "",
                    country: item.country || "",
                    attackdate: item.date || "",
                    country: item.country || "",
                    url: item.url || "",
                    work_sector: item.work_sector,
                    website: item.website
                })) : [];

            failedGroups.delete(group);
            return normalizedData;
        } catch (error) {
            console.error(`Failed to fetch ${group} (attempt ${attempt}/${retries}):`, error.message);

            if (error.message === 'RateLimited') {
                await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
                continue;
            }

            if (attempt === retries) {
                // Update 
                failedGroups.set(group, (failedGroups.get(group) || 0) + 1);
                const cachedData = cache.get(`group_${group}`);
                return cachedData || [];
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    return [];
}

async function initializeData() {
    if (refreshInProgress) {
        console.log('Refresh already in progress, skipping');
        return;
    }

    refreshInProgress = true;
    console.log('Starting data initialization...');
    const startTime = Date.now();
    let allData = [];

    try {
        const sortedGroups = [...allGroupNames].sort((a, b) =>
            (failedGroups.get(a) || 0) - (failedGroups.get(b) || 0)
        );

        for (let i = 0; i < sortedGroups.length; i += BATCH_SIZE) {
            const batch = sortedGroups.slice(i, i + BATCH_SIZE);
            console.log(`Fetching batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(sortedGroups.length / BATCH_SIZE)}`);

            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
            }

            const batchResults = await Promise.all(
                batch.map(async group => {
                    const data = await fetchGroupData(group);

                    if (data.length > 0) {
                        cache.set(`group_${group}`, data);
                    }
                    return data;
                })
            );

            allData = [...allData, ...batchResults.flat()];
        }


        if (allData.length > 0) {
            cache.set('allData', allData);
            cache.set('lastUpdateTime', new Date().toISOString());
        }

        console.log(`Data initialization complete in ${(Date.now() - startTime) / 1000}s`);
        console.log(`Cached ${allData.length} items`);

        if (failedGroups.size > 0) {
            console.log('Failed groups:', Array.from(failedGroups.entries()));
        }

    } catch (error) {
        console.error('Failed to initialize data:', error);
    } finally {
        refreshInProgress = false;
    }
}

function searchData(query, allData) {
    if (!query || !allData) return allData || [];

    const lowerQuery = query.toLowerCase();

    return allData.filter(item =>
        (item.victim && item.victim.toLowerCase().includes(lowerQuery)) ||
        (item.group && item.group.toLowerCase().includes(lowerQuery)) ||
        (item.description && item.description.toLowerCase().includes(lowerQuery))
    );
}

app.get("/api/cyberattacks", (req, res) => {
    const { query = "" } = req.query;

    const allData = cache.get('allData');
    if (!allData) {
        return res.status(503).json({
            error: "Service initializing",
            message: "Please try again in a few moments"
        });
    }

    const results = searchData(query, allData);

    res.json({
        results,
        metadata: {
            total: results.length,
            lastUpdate: cache.get('lastUpdateTime'),
            query
        }
    });
});

//health check endpoint
app.get('/health', (req, res) => {
    const allData = cache.get('allData');
    const lastUpdateTime = cache.get('lastUpdateTime');

    res.json({
        status: allData ? 'healthy' : 'initializing',
        dataStatus: {
            ready: !!allData,
            itemCount: allData?.length || 0,
            lastUpdate: lastUpdateTime,
            failedGroups: Array.from(failedGroups.keys()),
            refreshInProgress
        },
        cacheStats: cache.getStats(),
        timestamp: new Date().toISOString()
    });
});

// data refresh using cron
cron.schedule('0 */6 * * *', async () => {
    console.log('Cron job triggered at:', new Date().toISOString());
    try {
        await initializeData();
    } catch (error) {
        console.error('Scheduled refresh failed:', error);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    initializeData();
})