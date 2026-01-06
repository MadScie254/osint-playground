/**
 * OSINT Playground - Intelligence Engine Server
 * Express.js API for comprehensive OSINT reconnaissance
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const platforms = require('./config/platforms.json');
const { SearchAggregator } = require('./lib/search-aggregator');

// Initialize the search aggregator
const searchAggregator = new SearchAggregator();

// API Configuration from environment
const API_KEYS = {
    shodan: process.env.SHODAN_API_KEY,
    hunter: process.env.HUNTER_API_KEY,
    hibp: process.env.HIBP_API_KEY,
    twitter: {
        key: process.env.TWITTER_API_KEY,
        secret: process.env.TWITTER_API_SECRET
    },
    github: process.env.GITHUB_TOKEN,
    abuseipdb: process.env.ABUSEIPDB_API_KEY,
    virustotal: process.env.VIRUSTOTAL_API_KEY
};

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiter configuration
const rateLimiter = new RateLimiterMemory({
    points: parseInt(process.env.RATE_LIMIT_REQUESTS) || 30,
    duration: 60, // per 60 seconds
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting middleware
app.use(async (req, res, next) => {
    try {
        await rateLimiter.consume(req.ip);
        next();
    } catch (rejRes) {
        res.status(429).json({
            error: 'Too many requests',
            retryAfter: Math.ceil(rejRes.msBeforeNext / 1000)
        });
    }
});

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Get available adapters from aggregator
 */
app.get('/api/adapters', (req, res) => {
    res.json({
        adapters: searchAggregator.getAdapters(),
        timestamp: new Date().toISOString()
    });
});

/**
 * Get available platforms
 */
app.get('/api/platforms', (req, res) => {
    res.json({
        platforms: platforms.platforms.map(p => ({
            name: p.name,
            category: p.category,
            icon: p.icon,
            color: p.color
        })),
        categories: platforms.categories,
        searchEngines: Object.keys(platforms.searchEngines)
    });
});

/**
 * Check a single URL for username existence
 */
app.get('/api/check', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL parameter required' });
    }
    
    try {
        const result = await checkUrl(url);
        res.json(result);
    } catch (error) {
        res.json({ exists: false, error: error.message });
    }
});

/**
 * Main search endpoint - streaming response
 */
app.post('/api/search', async (req, res) => {
    const { username, engines = [], categories = 'all' } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    // Validate username format
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        return res.status(400).json({ error: 'Invalid username format' });
    }
    
    // Set up streaming response
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    // Filter platforms by category
    let platformsToCheck = platforms.platforms;
    if (categories !== 'all' && Array.isArray(categories)) {
        platformsToCheck = platforms.platforms.filter(p => 
            categories.includes(p.category)
        );
    }
    
    const total = platformsToCheck.length;
    let completed = 0;
    
    // Process platforms in batches
    const batchSize = 5;
    const batches = [];
    
    for (let i = 0; i < platformsToCheck.length; i += batchSize) {
        batches.push(platformsToCheck.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
        const promises = batch.map(async (platform) => {
            const url = platform.url.replace('{username}', username);
            
            // Send progress update
            res.write(JSON.stringify({
                type: 'progress',
                platform: platform.name,
                completed: completed,
                total: total
            }) + '\n');
            
            const startTime = Date.now();
            let result;
            
            try {
                const checkResult = await checkUrl(url, platform.checkMethod);
                result = {
                    platform: platform.name,
                    url: url,
                    icon: platform.icon,
                    color: platform.color,
                    category: platform.category,
                    status: checkResult.exists ? 'found' : 'not-found',
                    responseTime: Date.now() - startTime
                };
            } catch (error) {
                result = {
                    platform: platform.name,
                    url: url,
                    icon: platform.icon,
                    color: platform.color,
                    category: platform.category,
                    status: 'error',
                    error: error.message,
                    responseTime: Date.now() - startTime
                };
            }
            
            completed++;
            
            // Send result
            res.write(JSON.stringify({
                type: 'result',
                result: result
            }) + '\n');
            
            return result;
        });
        
        await Promise.all(promises);
        
        // Small delay between batches to avoid rate limiting
        await sleep(200);
    }
    
    // Send completion message
    res.write(JSON.stringify({
        type: 'complete',
        username: username,
        total: total
    }) + '\n');
    
    res.end();
});

/**
 * Search engines query endpoint
 */
app.post('/api/search-engines', async (req, res) => {
    const { username, engines = ['google', 'duckduckgo'] } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    const results = {};
    
    for (const engine of engines) {
        const engineConfig = platforms.searchEngines[engine];
        if (!engineConfig) continue;
        
        try {
            const searchResults = await performSearchEngineQuery(username, engine, engineConfig);
            results[engine] = searchResults;
        } catch (error) {
            results[engine] = { error: error.message };
        }
    }
    
    res.json(results);
});

/**
 * Check if a URL exists (username found)
 */
async function checkUrl(url, method = 'status') {
    const config = {
        timeout: 10000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500
    };
    
    try {
        const response = await axios.get(url, config);
        
        // Check based on method
        switch (method) {
            case 'status':
                return { exists: response.status === 200 };
            case 'content':
                // Check if the page content indicates user exists
                const notFoundIndicators = [
                    'page not found',
                    'user not found',
                    'account suspended',
                    '404',
                    'doesn\'t exist',
                    'does not exist',
                    'no user',
                    'profile unavailable'
                ];
                const content = response.data.toLowerCase();
                const notFound = notFoundIndicators.some(indicator => 
                    content.includes(indicator)
                );
                return { exists: !notFound && response.status === 200 };
            case 'json':
                return { 
                    exists: response.status === 200 && 
                            response.data && 
                            !response.data.error 
                };
            default:
                return { exists: response.status === 200 };
        }
    } catch (error) {
        if (error.response) {
            return { exists: false, status: error.response.status };
        }
        throw error;
    }
}

/**
 * Perform search engine query
 */
async function performSearchEngineQuery(username, engine, config) {
    // For now, return the search URLs
    // Full implementation would require API keys
    const searchUrl = config.searchUrl.replace('{username}', encodeURIComponent(username));
    
    return {
        engine: config.name,
        searchUrl: searchUrl,
        requiresKey: config.requiresKey,
        results: [] // Would be populated with actual results if API keys configured
    };
}

/**
 * Google Custom Search API (requires API key)
 */
async function googleSearch(username) {
    const apiKey = process.env.GOOGLE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    
    if (!apiKey || !cseId) {
        return { results: [], error: 'Google API not configured' };
    }
    
    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: apiKey,
                cx: cseId,
                q: `"${username}"`,
                num: 10
            }
        });
        
        return {
            results: response.data.items?.map(item => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet
            })) || []
        };
    } catch (error) {
        return { results: [], error: error.message };
    }
}

/**
 * Additional OSINT API endpoints
 */

// GitHub API lookup
app.get('/api/github/:username', async (req, res) => {
    const { username } = req.params;
    
    try {
        const response = await axios.get(`https://api.github.com/users/${username}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                ...(process.env.GITHUB_TOKEN && {
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`
                })
            }
        });
        
        res.json({
            exists: true,
            profile: {
                login: response.data.login,
                name: response.data.name,
                bio: response.data.bio,
                publicRepos: response.data.public_repos,
                followers: response.data.followers,
                following: response.data.following,
                createdAt: response.data.created_at,
                avatarUrl: response.data.avatar_url,
                profileUrl: response.data.html_url
            }
        });
    } catch (error) {
        if (error.response?.status === 404) {
            res.json({ exists: false });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Have I Been Pwned check (requires API key)
app.get('/api/hibp/:email', async (req, res) => {
    const apiKey = process.env.HIBP_API_KEY;
    const { email } = req.params;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'HIBP API not configured' });
    }
    
    try {
        const response = await axios.get(
            `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`,
            {
                headers: {
                    'hibp-api-key': apiKey,
                    'User-Agent': 'Username-OSINT-Engine'
                }
            }
        );
        
        res.json({
            breached: true,
            breaches: response.data
        });
    } catch (error) {
        if (error.response?.status === 404) {
            res.json({ breached: false });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// ============================================
// OSINT API ENDPOINTS
// ============================================

// Unified OSINT check endpoint for streaming
app.post('/api/check', async (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    
    // Check all platforms
    const platformsToCheck = platforms.platforms.slice(0, 50); // Limit to 50
    
    for (const platform of platformsToCheck) {
        const url = platform.url.replace('{username}', username);
        
        try {
            const exists = await checkUrl(url, platform.checkMethod);
            sendEvent({
                platform: platform.name,
                url,
                found: exists.exists,
                status: exists.exists ? 'verified' : 'not-found',
                category: platform.category
            });
        } catch (error) {
            sendEvent({
                platform: platform.name,
                url,
                found: false,
                status: 'error',
                error: error.message
            });
        }
        
        await sleep(100);
    }
    
    sendEvent({ done: true });
    res.end();
});

// GitHub Profile
app.get('/api/osint/github/:username', async (req, res) => {
    const { username } = req.params;
    
    try {
        const response = await axios.get(`https://api.github.com/users/${username}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                ...(API_KEYS.github && { 'Authorization': `token ${API_KEYS.github}` })
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Keybase Profile
app.get('/api/osint/keybase/:username', async (req, res) => {
    const { username } = req.params;
    
    try {
        const response = await axios.get(
            `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${username}`
        );
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Shodan Host Lookup
app.get('/api/osint/shodan/:target', async (req, res) => {
    if (!API_KEYS.shodan) {
        return res.status(400).json({ error: 'Shodan API not configured' });
    }
    
    const { target } = req.params;
    
    try {
        // Determine if IP or domain
        const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target);
        
        let response;
        if (isIP) {
            response = await axios.get(
                `https://api.shodan.io/shodan/host/${target}?key=${API_KEYS.shodan}`
            );
        } else {
            // DNS lookup first
            response = await axios.get(
                `https://api.shodan.io/dns/resolve?hostnames=${target}&key=${API_KEYS.shodan}`
            );
            
            const ip = response.data[target];
            if (ip) {
                response = await axios.get(
                    `https://api.shodan.io/shodan/host/${ip}?key=${API_KEYS.shodan}`
                );
            }
        }
        
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Hunter.io Email Verification
app.get('/api/osint/hunter/verify', async (req, res) => {
    if (!API_KEYS.hunter) {
        return res.status(400).json({ error: 'Hunter API not configured' });
    }
    
    const { email } = req.query;
    
    try {
        const response = await axios.get(
            `https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${API_KEYS.hunter}`
        );
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Hunter.io Domain Search
app.get('/api/osint/hunter/domain', async (req, res) => {
    if (!API_KEYS.hunter) {
        return res.status(400).json({ error: 'Hunter API not configured' });
    }
    
    const { domain } = req.query;
    
    try {
        const response = await axios.get(
            `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${API_KEYS.hunter}`
        );
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// HaveIBeenPwned Email Check  
app.get('/api/osint/hibp/:email', async (req, res) => {
    if (!API_KEYS.hibp) {
        return res.status(400).json({ error: 'HIBP API not configured' });
    }
    
    const { email } = req.params;
    
    try {
        const response = await axios.get(
            `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
            {
                headers: {
                    'hibp-api-key': API_KEYS.hibp,
                    'User-Agent': 'OSINT-Playground'
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        if (error.response?.status === 404) {
            res.json([]);
        } else {
            res.status(error.response?.status || 500).json({ error: error.message });
        }
    }
});

// AbuseIPDB Check
app.get('/api/osint/abuseipdb/:ip', async (req, res) => {
    if (!API_KEYS.abuseipdb) {
        return res.status(400).json({ error: 'AbuseIPDB API not configured' });
    }
    
    const { ip } = req.params;
    
    try {
        const response = await axios.get(
            `https://api.abuseipdb.com/api/v2/check`,
            {
                params: {
                    ipAddress: ip,
                    maxAgeInDays: 90,
                    verbose: true
                },
                headers: {
                    'Key': API_KEYS.abuseipdb,
                    'Accept': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// VirusTotal Check
app.get('/api/osint/virustotal/:target', async (req, res) => {
    if (!API_KEYS.virustotal) {
        return res.status(400).json({ error: 'VirusTotal API not configured' });
    }
    
    const { target } = req.params;
    const { type } = req.query; // ip, domain, url, file
    
    try {
        let endpoint;
        const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target);
        
        if (isIP) {
            endpoint = `https://www.virustotal.com/api/v3/ip_addresses/${target}`;
        } else if (target.includes('.') && !target.includes('/')) {
            endpoint = `https://www.virustotal.com/api/v3/domains/${target}`;
        } else {
            // URL - needs encoding
            const urlId = Buffer.from(target).toString('base64').replace(/=/g, '');
            endpoint = `https://www.virustotal.com/api/v3/urls/${urlId}`;
        }
        
        const response = await axios.get(endpoint, {
            headers: {
                'x-apikey': API_KEYS.virustotal,
                'Accept': 'application/json'
            }
        });
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Reddit User Check
app.get('/api/osint/reddit/:username', async (req, res) => {
    const { username } = req.params;
    
    try {
        const response = await axios.get(
            `https://www.reddit.com/user/${username}/about.json`,
            {
                headers: {
                    'User-Agent': 'OSINT-Playground/1.0'
                }
            }
        );
        res.json(response.data.data);
    } catch (error) {
        if (error.response?.status === 404) {
            res.json({ exists: false });
        } else {
            res.status(error.response?.status || 500).json({ error: error.message });
        }
    }
});

// GitLab User Search
app.get('/api/osint/gitlab/:username', async (req, res) => {
    const { username } = req.params;
    
    try {
        const response = await axios.get(
            `https://gitlab.com/api/v4/users?username=${username}`
        );
        
        if (response.data.length > 0) {
            res.json(response.data[0]);
        } else {
            res.json({ exists: false });
        }
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// DNS Records Lookup
app.get('/api/dns/:domain', async (req, res) => {
    const { domain } = req.params;
    
    try {
        const dns = require('dns').promises;
        
        const [a, aaaa, mx, txt, ns, cname] = await Promise.allSettled([
            dns.resolve4(domain),
            dns.resolve6(domain),
            dns.resolveMx(domain),
            dns.resolveTxt(domain),
            dns.resolveNs(domain),
            dns.resolveCname(domain)
        ]);
        
        res.json({
            domain,
            records: {
                A: a.status === 'fulfilled' ? a.value : null,
                AAAA: aaaa.status === 'fulfilled' ? aaaa.value : null,
                MX: mx.status === 'fulfilled' ? mx.value : null,
                TXT: txt.status === 'fulfilled' ? txt.value : null,
                NS: ns.status === 'fulfilled' ? ns.value : null,
                CNAME: cname.status === 'fulfilled' ? cname.value : null
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Whois Lookup (basic)
app.get('/api/whois/:domain', async (req, res) => {
    const { domain } = req.params;
    
    try {
        // Use a public WHOIS API
        const response = await axios.get(
            `https://whois.arin.net/rest/pocs;domain=${domain}`,
            { headers: { 'Accept': 'application/json' } }
        );
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// Wikidata Entity Search
app.get('/api/osint/wikidata', async (req, res) => {
    const { query } = req.query;
    
    try {
        const response = await axios.get(
            `https://www.wikidata.org/w/api.php`,
            {
                params: {
                    action: 'wbsearchentities',
                    search: query,
                    language: 'en',
                    format: 'json',
                    limit: 10
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});

// ============================================
// HACKER NEWS API ENDPOINTS
// https://github.com/HackerNews/API
// ============================================

// Get top stories
app.get('/api/hackernews/top', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const topStoriesRes = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
        const storyIds = topStoriesRes.data.slice(0, limit);
        
        const stories = await Promise.all(
            storyIds.map(id => 
                axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
                    .then(res => res.data)
            )
        );
        
        res.json({ stories, count: stories.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get new stories
app.get('/api/hackernews/new', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const newStoriesRes = await axios.get('https://hacker-news.firebaseio.com/v0/newstories.json');
        const storyIds = newStoriesRes.data.slice(0, limit);
        
        const stories = await Promise.all(
            storyIds.map(id => 
                axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
                    .then(res => res.data)
            )
        );
        
        res.json({ stories, count: stories.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get best stories
app.get('/api/hackernews/best', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const bestStoriesRes = await axios.get('https://hacker-news.firebaseio.com/v0/beststories.json');
        const storyIds = bestStoriesRes.data.slice(0, limit);
        
        const stories = await Promise.all(
            storyIds.map(id => 
                axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
                    .then(res => res.data)
            )
        );
        
        res.json({ stories, count: stories.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get ask/show/job stories
app.get('/api/hackernews/:type(ask|show|job)', async (req, res) => {
    const { type } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    try {
        const endpoint = `https://hacker-news.firebaseio.com/v0/${type}stories.json`;
        const storiesRes = await axios.get(endpoint);
        const storyIds = storiesRes.data.slice(0, limit);
        
        const stories = await Promise.all(
            storyIds.map(id => 
                axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
                    .then(res => res.data)
            )
        );
        
        res.json({ stories, type, count: stories.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single item (story, comment, etc)
app.get('/api/hackernews/item/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const response = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get user profile
app.get('/api/hackernews/user/:username', async (req, res) => {
    const { username } = req.params;
    
    try {
        const response = await axios.get(`https://hacker-news.firebaseio.com/v0/user/${username}.json`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search HackerNews (using Algolia HN Search API)
app.get('/api/hackernews/search', async (req, res) => {
    const { q, tags = 'story' } = req.query;
    
    try {
        const response = await axios.get('https://hn.algolia.com/api/v1/search', {
            params: { query: q, tags }
        });
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// UNIFIED GLOBAL SEARCH ENDPOINT
// ============================================
app.get('/api/search/global', async (req, res) => {
    const { q, type = 'all' } = req.query;
    
    if (!q) {
        return res.status(400).json({ error: 'Query required' });
    }
    
    const results = {
        query: q,
        timestamp: new Date().toISOString(),
        sources: {}
    };
    
    try {
        // Parallel search across multiple sources
        const searches = [];
        
        // GitHub
        searches.push(
            axios.get(`https://api.github.com/users/${q}`)
                .then(r => ({ source: 'github', data: r.data }))
                .catch(() => ({ source: 'github', data: null }))
        );
        
        // Reddit
        searches.push(
            axios.get(`https://www.reddit.com/user/${q}/about.json`, {
                headers: { 'User-Agent': 'OSINT-Playground/1.0' }
            })
                .then(r => ({ source: 'reddit', data: r.data?.data }))
                .catch(() => ({ source: 'reddit', data: null }))
        );
        
        // GitLab
        searches.push(
            axios.get(`https://gitlab.com/api/v4/users?username=${q}`)
                .then(r => ({ source: 'gitlab', data: r.data[0] || null }))
                .catch(() => ({ source: 'gitlab', data: null }))
        );
        
        // Keybase
        searches.push(
            axios.get(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${q}`)
                .then(r => ({ source: 'keybase', data: r.data?.them?.[0] }))
                .catch(() => ({ source: 'keybase', data: null }))
        );
        
        // HackerNews
        searches.push(
            axios.get(`https://hacker-news.firebaseio.com/v0/user/${q}.json`)
                .then(r => ({ source: 'hackernews', data: r.data }))
                .catch(() => ({ source: 'hackernews', data: null }))
        );
        
        // Wikidata
        searches.push(
            axios.get(`https://www.wikidata.org/w/api.php`, {
                params: { action: 'wbsearchentities', search: q, language: 'en', format: 'json', limit: 5 }
            })
                .then(r => ({ source: 'wikidata', data: r.data?.search }))
                .catch(() => ({ source: 'wikidata', data: null }))
        );
        
        const searchResults = await Promise.all(searches);
        
        searchResults.forEach(r => {
            results.sources[r.source] = r.data;
        });
        
        results.found = Object.values(results.sources).filter(Boolean).length;
        
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// AGGREGATOR SCAN ENDPOINTS (SSE STREAMING)
// ==========================================

/**
 * Start a new scan with SSE streaming results
 * POST /api/scan
 */
app.post('/api/scan', async (req, res) => {
    const { query, adapters, options = {} } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: 'Query parameter required' });
    }
    
    // Validate query format
    if (!/^[a-zA-Z0-9_.\-@]+$/.test(query)) {
        return res.status(400).json({ error: 'Invalid query format' });
    }
    
    try {
        const scan = await searchAggregator.startScan(query, {
            adapters: adapters,
            ...options
        });
        
        res.json({
            scanId: scan.id,
            status: scan.status,
            query: scan.query,
            message: 'Scan started. Use /api/scan/:id/stream for live results'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get scan status and results
 * GET /api/scan/:id
 */
app.get('/api/scan/:id', (req, res) => {
    const scan = searchAggregator.getScan(req.params.id);
    
    if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
    }
    
    res.json({
        id: scan.id,
        query: scan.query,
        status: scan.status,
        progress: scan.progress,
        stats: scan.stats,
        startTime: scan.startTime,
        endTime: scan.endTime,
        duration: scan.endTime ? scan.endTime - scan.startTime : Date.now() - scan.startTime,
        results: scan.results,
        errors: scan.errors,
        fromCache: scan.fromCache || false
    });
});

/**
 * SSE streaming endpoint for live scan results
 * GET /api/scan/:id/stream
 */
app.get('/api/scan/:id/stream', (req, res) => {
    const scanId = req.params.id;
    const scan = searchAggregator.getScan(scanId);
    
    if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
    }
    
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // Send initial state
    res.write(`data: ${JSON.stringify({
        type: 'init',
        scanId: scan.id,
        status: scan.status,
        progress: scan.progress,
        resultsCount: scan.results.length
    })}\n\n`);
    
    // If already complete, send all results and close
    if (scan.status === 'completed' || scan.status === 'error') {
        res.write(`data: ${JSON.stringify({
            type: 'complete',
            scan: {
                id: scan.id,
                status: scan.status,
                progress: 100,
                stats: scan.stats,
                results: scan.results,
                errors: scan.errors,
                duration: scan.endTime - scan.startTime
            }
        })}\n\n`);
        res.end();
        return;
    }
    
    // Subscribe to scan events
    const onResult = (data) => {
        if (data.scanId === scanId) {
            res.write(`data: ${JSON.stringify({
                type: 'result',
                result: data.result
            })}\n\n`);
        }
    };
    
    const onProgress = (data) => {
        if (data.scanId === scanId) {
            res.write(`data: ${JSON.stringify({
                type: 'progress',
                progress: data.progress,
                adapter: data.adapter,
                resultsCount: data.resultsCount
            })}\n\n`);
        }
    };
    
    const onComplete = (completedScan) => {
        if (completedScan.id === scanId) {
            res.write(`data: ${JSON.stringify({
                type: 'complete',
                scan: {
                    id: completedScan.id,
                    status: completedScan.status,
                    progress: 100,
                    stats: completedScan.stats,
                    results: completedScan.results,
                    errors: completedScan.errors,
                    duration: completedScan.endTime - completedScan.startTime
                }
            })}\n\n`);
            cleanup();
            res.end();
        }
    };
    
    const onError = (data) => {
        if (data.scanId === scanId) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                adapter: data.adapter,
                error: data.error
            })}\n\n`);
        }
    };
    
    const cleanup = () => {
        searchAggregator.off('scan:result', onResult);
        searchAggregator.off('scan:progress', onProgress);
        searchAggregator.off('scan:complete', onComplete);
        searchAggregator.off('scan:adapter:error', onError);
    };
    
    searchAggregator.on('scan:result', onResult);
    searchAggregator.on('scan:progress', onProgress);
    searchAggregator.on('scan:complete', onComplete);
    searchAggregator.on('scan:adapter:error', onError);
    
    // Handle client disconnect
    req.on('close', () => {
        cleanup();
    });
    
    // Send heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 15000);
    
    req.on('close', () => {
        clearInterval(heartbeat);
    });
});

/**
 * Quick scan endpoint (non-streaming, returns when complete)
 * POST /api/scan/quick
 */
app.post('/api/scan/quick', async (req, res) => {
    const { query, adapters, timeout = 30000 } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: 'Query parameter required' });
    }
    
    try {
        const scan = await searchAggregator.startScan(query, { adapters });
        
        // Wait for completion with timeout
        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Scan timeout'));
            }, timeout);
            
            const checkComplete = setInterval(() => {
                const currentScan = searchAggregator.getScan(scan.id);
                if (currentScan.status === 'completed' || currentScan.status === 'error') {
                    clearTimeout(timeoutId);
                    clearInterval(checkComplete);
                    resolve();
                }
            }, 500);
        });
        
        const finalScan = searchAggregator.getScan(scan.id);
        res.json({
            id: finalScan.id,
            query: finalScan.query,
            status: finalScan.status,
            stats: finalScan.stats,
            results: finalScan.results,
            errors: finalScan.errors,
            duration: finalScan.endTime - finalScan.startTime
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API Status Check
app.get('/api/status', (req, res) => {
    res.json({
        apis: {
            shodan: !!API_KEYS.shodan,
            hunter: !!API_KEYS.hunter,
            hibp: !!API_KEYS.hibp,
            twitter: !!(API_KEYS.twitter.key && API_KEYS.twitter.secret),
            github: !!API_KEYS.github,
            abuseipdb: !!API_KEYS.abuseipdb,
            virustotal: !!API_KEYS.virustotal
        },
        freeApis: ['github', 'keybase', 'reddit', 'gitlab', 'nominatim', 'wikidata', 'dns'],
        timestamp: new Date().toISOString()
    });
});

// Utility function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║          OSINT PLAYGROUND - Intelligence Engine                ║
╠════════════════════════════════════════════════════════════════╣
║  🌐 Interface: http://localhost:${PORT}                          ║
║  📡 API Base:  http://localhost:${PORT}/api                      ║
║  ⚡ Mode: ${(process.env.NODE_ENV || 'development').padEnd(15)}                           ║
╠════════════════════════════════════════════════════════════════╣
║  API Status:                                                   ║
║  • Shodan:     ${API_KEYS.shodan ? '✅ READY' : '❌ NOT CONFIGURED'}                                   ║
║  • Hunter.io:  ${API_KEYS.hunter ? '✅ READY' : '❌ NOT CONFIGURED'}                                   ║
║  • HIBP:       ${API_KEYS.hibp ? '✅ READY' : '❌ NOT CONFIGURED'}                                   ║
║  • Twitter:    ${API_KEYS.twitter.key ? '✅ READY' : '❌ NOT CONFIGURED'}                                   ║
║  • GitHub:     ${API_KEYS.github ? '✅ READY' : '⚪ PUBLIC API'}                                   ║
╚════════════════════════════════════════════════════════════════╝

Available OSINT Endpoints:
  GET  /api/status              - API configuration status
  POST /api/check               - Username check (SSE stream)
  POST /api/search              - Full platform scan
  
  GET  /api/osint/github/:user  - GitHub profile
  GET  /api/osint/keybase/:user - Keybase lookup
  GET  /api/osint/reddit/:user  - Reddit profile
  GET  /api/osint/gitlab/:user  - GitLab profile
  GET  /api/osint/shodan/:ip    - Shodan host info
  GET  /api/osint/hunter/domain - Hunter.io domain emails
  GET  /api/osint/hunter/verify - Email verification
  GET  /api/osint/hibp/:email   - Breach check
  GET  /api/osint/abuseipdb/:ip - IP reputation
  GET  /api/osint/virustotal/:t - VT scan
  GET  /api/osint/wikidata      - Entity search
  GET  /api/dns/:domain         - DNS records
    `);
});

module.exports = app;
