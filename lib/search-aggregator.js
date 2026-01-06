/**
 * OSINT Playground - Search Aggregator Service
 * Enterprise-grade multi-source search with job queue, rate limiting,
 * deduplication, confidence scoring, and streaming results
 */

const EventEmitter = require('events');

// ==========================================
// CONFIGURATION
// ==========================================
const AGGREGATOR_CONFIG = {
    // Timeouts
    defaultTimeout: 30000,      // 30s per adapter
    totalTimeout: 120000,       // 2min total scan time
    
    // Rate limiting
    maxConcurrentJobs: 10,
    requestsPerMinute: 60,
    
    // Retry logic
    maxRetries: 3,
    retryDelay: 1000,
    retryBackoff: 2,
    
    // Caching
    cacheTTL: 3600,             // 1 hour
    enableCache: true,
    
    // Results
    maxResultsPerSource: 50,
    minConfidenceThreshold: 0.1,
    
    // Deduplication
    dedupeFields: ['url', 'username', 'email']
};

// ==========================================
// ADAPTER REGISTRY
// ==========================================

/**
 * Base adapter interface for all search sources
 */
class BaseAdapter {
    constructor(name, config = {}) {
        this.name = name;
        this.config = config;
        this.priority = config.priority || 5;
        this.rateLimit = config.rateLimit || { requests: 10, window: 60000 };
        this.lastRequest = 0;
        this.requestCount = 0;
    }
    
    async search(query, options = {}) {
        throw new Error('search() must be implemented');
    }
    
    async checkRateLimit() {
        const now = Date.now();
        if (now - this.lastRequest > this.rateLimit.window) {
            this.requestCount = 0;
            this.lastRequest = now;
        }
        
        if (this.requestCount >= this.rateLimit.requests) {
            const waitTime = this.rateLimit.window - (now - this.lastRequest);
            await this.sleep(waitTime);
            this.requestCount = 0;
            this.lastRequest = Date.now();
        }
        
        this.requestCount++;
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    normalizeResult(raw, type) {
        return {
            id: `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            source: this.name,
            type: type,
            timestamp: new Date().toISOString(),
            confidence: 0.5,
            raw: raw
        };
    }
}

// ==========================================
// SOCIAL MEDIA ADAPTERS
// ==========================================

class GitHubAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('github', { priority: 1, ...config });
        this.baseUrl = 'https://api.github.com';
        this.token = config.token || process.env.GITHUB_TOKEN;
    }
    
    async search(query, options = {}) {
        await this.checkRateLimit();
        
        const axios = require('axios');
        const results = [];
        
        try {
            // User search
            const headers = this.token ? { Authorization: `token ${this.token}` } : {};
            
            const userResponse = await axios.get(`${this.baseUrl}/users/${query}`, { 
                headers,
                timeout: 10000,
                validateStatus: s => s < 500
            });
            
            if (userResponse.status === 200) {
                const user = userResponse.data;
                results.push({
                    ...this.normalizeResult(user, 'profile'),
                    username: user.login,
                    displayName: user.name,
                    bio: user.bio,
                    location: user.location,
                    avatar: user.avatar_url,
                    url: user.html_url,
                    email: user.email,
                    company: user.company,
                    followers: user.followers,
                    following: user.following,
                    publicRepos: user.public_repos,
                    createdAt: user.created_at,
                    confidence: 0.95,
                    verified: true
                });
                
                // Get recent repos
                const reposResponse = await axios.get(`${this.baseUrl}/users/${query}/repos?sort=updated&per_page=5`, {
                    headers,
                    timeout: 10000
                });
                
                if (reposResponse.data) {
                    reposResponse.data.forEach(repo => {
                        results.push({
                            ...this.normalizeResult(repo, 'repository'),
                            name: repo.name,
                            description: repo.description,
                            url: repo.html_url,
                            language: repo.language,
                            stars: repo.stargazers_count,
                            forks: repo.forks_count,
                            confidence: 0.9,
                            parentUsername: query
                        });
                    });
                }
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                console.error(`[GitHub Adapter] Error: ${error.message}`);
            }
        }
        
        return results;
    }
}

class RedditAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('reddit', { priority: 2, ...config });
        this.baseUrl = 'https://www.reddit.com';
    }
    
    async search(query, options = {}) {
        await this.checkRateLimit();
        
        const axios = require('axios');
        const results = [];
        
        try {
            const response = await axios.get(`${this.baseUrl}/user/${query}/about.json`, {
                headers: { 'User-Agent': 'OSINT-Playground/2.0' },
                timeout: 10000,
                validateStatus: s => s < 500
            });
            
            if (response.status === 200 && response.data?.data) {
                const user = response.data.data;
                results.push({
                    ...this.normalizeResult(user, 'profile'),
                    username: user.name,
                    url: `https://reddit.com/user/${user.name}`,
                    avatar: user.icon_img?.split('?')[0],
                    karma: user.total_karma || (user.link_karma + user.comment_karma),
                    linkKarma: user.link_karma,
                    commentKarma: user.comment_karma,
                    createdAt: new Date(user.created_utc * 1000).toISOString(),
                    isGold: user.is_gold,
                    isMod: user.is_mod,
                    confidence: 0.9,
                    verified: true
                });
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                console.error(`[Reddit Adapter] Error: ${error.message}`);
            }
        }
        
        return results;
    }
}

class GitLabAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('gitlab', { priority: 3, ...config });
        this.baseUrl = 'https://gitlab.com/api/v4';
    }
    
    async search(query, options = {}) {
        await this.checkRateLimit();
        
        const axios = require('axios');
        const results = [];
        
        try {
            const response = await axios.get(`${this.baseUrl}/users?username=${query}`, {
                timeout: 10000,
                validateStatus: s => s < 500
            });
            
            if (response.status === 200 && response.data?.length > 0) {
                const user = response.data[0];
                results.push({
                    ...this.normalizeResult(user, 'profile'),
                    username: user.username,
                    displayName: user.name,
                    bio: user.bio,
                    location: user.location,
                    avatar: user.avatar_url,
                    url: user.web_url,
                    state: user.state,
                    confidence: 0.9,
                    verified: true
                });
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                console.error(`[GitLab Adapter] Error: ${error.message}`);
            }
        }
        
        return results;
    }
}

class KeybaseAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('keybase', { priority: 4, ...config });
        this.baseUrl = 'https://keybase.io/_/api/1.0';
    }
    
    async search(query, options = {}) {
        await this.checkRateLimit();
        
        const axios = require('axios');
        const results = [];
        
        try {
            const response = await axios.get(`${this.baseUrl}/user/lookup.json?usernames=${query}`, {
                timeout: 10000,
                validateStatus: s => s < 500
            });
            
            if (response.status === 200 && response.data?.them?.length > 0) {
                const user = response.data.them[0];
                const basics = user.basics || {};
                const profile = user.profile || {};
                
                results.push({
                    ...this.normalizeResult(user, 'profile'),
                    username: basics.username,
                    displayName: profile.full_name,
                    bio: profile.bio,
                    location: profile.location,
                    avatar: user.pictures?.primary?.url,
                    url: `https://keybase.io/${basics.username}`,
                    proofs: user.proofs_summary?.all || [],
                    devices: user.devices,
                    confidence: 0.85,
                    verified: true
                });
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                console.error(`[Keybase Adapter] Error: ${error.message}`);
            }
        }
        
        return results;
    }
}

class HackerNewsAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('hackernews', { priority: 5, ...config });
        this.baseUrl = 'https://hacker-news.firebaseio.com/v0';
    }
    
    async search(query, options = {}) {
        await this.checkRateLimit();
        
        const axios = require('axios');
        const results = [];
        
        try {
            const response = await axios.get(`${this.baseUrl}/user/${query}.json`, {
                timeout: 10000,
                validateStatus: s => s < 500
            });
            
            if (response.status === 200 && response.data) {
                const user = response.data;
                results.push({
                    ...this.normalizeResult(user, 'profile'),
                    username: user.id,
                    karma: user.karma,
                    about: user.about,
                    url: `https://news.ycombinator.com/user?id=${user.id}`,
                    createdAt: new Date(user.created * 1000).toISOString(),
                    submittedCount: user.submitted?.length || 0,
                    confidence: 0.85,
                    verified: true
                });
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                console.error(`[HackerNews Adapter] Error: ${error.message}`);
            }
        }
        
        return results;
    }
}

class TwitterAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('twitter', { priority: 1, ...config });
        // Note: Requires Twitter API v2 Bearer token
        this.bearerToken = config.bearerToken || process.env.TWITTER_BEARER_TOKEN;
    }
    
    async search(query, options = {}) {
        if (!this.bearerToken) {
            return [{
                ...this.normalizeResult({}, 'potential'),
                username: query,
                url: `https://twitter.com/${query}`,
                confidence: 0.3,
                verified: false,
                note: 'API not configured - URL may exist'
            }];
        }
        
        await this.checkRateLimit();
        
        const axios = require('axios');
        const results = [];
        
        try {
            const response = await axios.get(
                `https://api.twitter.com/2/users/by/username/${query}?user.fields=description,location,profile_image_url,public_metrics,created_at,verified`,
                {
                    headers: { Authorization: `Bearer ${this.bearerToken}` },
                    timeout: 10000,
                    validateStatus: s => s < 500
                }
            );
            
            if (response.status === 200 && response.data?.data) {
                const user = response.data.data;
                results.push({
                    ...this.normalizeResult(user, 'profile'),
                    username: user.username,
                    displayName: user.name,
                    bio: user.description,
                    location: user.location,
                    avatar: user.profile_image_url?.replace('_normal', '_400x400'),
                    url: `https://twitter.com/${user.username}`,
                    followers: user.public_metrics?.followers_count,
                    following: user.public_metrics?.following_count,
                    tweetCount: user.public_metrics?.tweet_count,
                    createdAt: user.created_at,
                    isVerified: user.verified,
                    confidence: 0.95,
                    verified: true
                });
            }
        } catch (error) {
            if (error.response?.status !== 404) {
                console.error(`[Twitter Adapter] Error: ${error.message}`);
            }
        }
        
        return results;
    }
}

class InstagramAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('instagram', { priority: 2, ...config });
    }
    
    async search(query, options = {}) {
        // Instagram doesn't have public API - return potential match
        return [{
            ...this.normalizeResult({}, 'potential'),
            username: query,
            url: `https://instagram.com/${query}`,
            confidence: 0.3,
            verified: false,
            note: 'No public API - profile may exist'
        }];
    }
}

class LinkedInAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('linkedin', { priority: 2, ...config });
    }
    
    async search(query, options = {}) {
        // LinkedIn doesn't allow scraping - return potential match
        return [{
            ...this.normalizeResult({}, 'potential'),
            username: query,
            url: `https://linkedin.com/in/${query}`,
            confidence: 0.3,
            verified: false,
            note: 'No public API - profile may exist'
        }];
    }
}

class ShodanAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('shodan', { priority: 6, ...config });
        this.apiKey = config.apiKey || process.env.SHODAN_API_KEY;
        this.baseUrl = 'https://api.shodan.io';
    }
    
    async search(query, options = {}) {
        if (!this.apiKey) return [];
        
        await this.checkRateLimit();
        
        const axios = require('axios');
        const results = [];
        
        try {
            // Check if query looks like an IP
            const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
            
            if (ipRegex.test(query)) {
                const response = await axios.get(`${this.baseUrl}/shodan/host/${query}?key=${this.apiKey}`, {
                    timeout: 15000,
                    validateStatus: s => s < 500
                });
                
                if (response.status === 200 && response.data) {
                    const host = response.data;
                    results.push({
                        ...this.normalizeResult(host, 'infrastructure'),
                        ip: host.ip_str,
                        hostnames: host.hostnames,
                        country: host.country_name,
                        city: host.city,
                        org: host.org,
                        isp: host.isp,
                        ports: host.ports,
                        vulns: host.vulns,
                        lastUpdate: host.last_update,
                        confidence: 0.95,
                        verified: true
                    });
                }
            }
        } catch (error) {
            console.error(`[Shodan Adapter] Error: ${error.message}`);
        }
        
        return results;
    }
}

class HunterAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('hunter', { priority: 5, ...config });
        this.apiKey = config.apiKey || process.env.HUNTER_API_KEY;
        this.baseUrl = 'https://api.hunter.io/v2';
    }
    
    async search(query, options = {}) {
        if (!this.apiKey) return [];
        
        await this.checkRateLimit();
        
        const axios = require('axios');
        const results = [];
        
        try {
            // Email finder for domains
            if (query.includes('.') && !query.includes('@')) {
                const response = await axios.get(
                    `${this.baseUrl}/domain-search?domain=${query}&api_key=${this.apiKey}`,
                    { timeout: 15000, validateStatus: s => s < 500 }
                );
                
                if (response.status === 200 && response.data?.data) {
                    const data = response.data.data;
                    results.push({
                        ...this.normalizeResult(data, 'domain'),
                        domain: data.domain,
                        organization: data.organization,
                        emails: data.emails?.slice(0, 10),
                        pattern: data.pattern,
                        confidence: 0.8,
                        verified: true
                    });
                }
            }
            
            // Email verification
            if (query.includes('@')) {
                const response = await axios.get(
                    `${this.baseUrl}/email-verifier?email=${query}&api_key=${this.apiKey}`,
                    { timeout: 15000, validateStatus: s => s < 500 }
                );
                
                if (response.status === 200 && response.data?.data) {
                    const data = response.data.data;
                    results.push({
                        ...this.normalizeResult(data, 'email'),
                        email: data.email,
                        status: data.status,
                        score: data.score,
                        regexp: data.regexp,
                        gibberish: data.gibberish,
                        disposable: data.disposable,
                        webmail: data.webmail,
                        confidence: data.score / 100,
                        verified: true
                    });
                }
            }
        } catch (error) {
            console.error(`[Hunter Adapter] Error: ${error.message}`);
        }
        
        return results;
    }
}

// Direct platform check adapter for 50+ sites
class DirectPlatformAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('direct', { priority: 10, rateLimit: { requests: 20, window: 60000 }, ...config });
        
        this.platforms = [
            { name: 'Twitter/X', url: 'https://twitter.com/{username}', category: 'social' },
            { name: 'Facebook', url: 'https://facebook.com/{username}', category: 'social' },
            { name: 'TikTok', url: 'https://tiktok.com/@{username}', category: 'social' },
            { name: 'Pinterest', url: 'https://pinterest.com/{username}', category: 'social' },
            { name: 'Tumblr', url: 'https://{username}.tumblr.com', category: 'social' },
            { name: 'Medium', url: 'https://medium.com/@{username}', category: 'social' },
            { name: 'Dev.to', url: 'https://dev.to/{username}', category: 'development' },
            { name: 'CodePen', url: 'https://codepen.io/{username}', category: 'development' },
            { name: 'Replit', url: 'https://replit.com/@{username}', category: 'development' },
            { name: 'NPM', url: 'https://npmjs.com/~{username}', category: 'development' },
            { name: 'PyPI', url: 'https://pypi.org/user/{username}', category: 'development' },
            { name: 'Kaggle', url: 'https://kaggle.com/{username}', category: 'development' },
            { name: 'LeetCode', url: 'https://leetcode.com/{username}', category: 'development' },
            { name: 'HackerRank', url: 'https://hackerrank.com/{username}', category: 'development' },
            { name: 'Twitch', url: 'https://twitch.tv/{username}', category: 'gaming' },
            { name: 'Steam', url: 'https://steamcommunity.com/id/{username}', category: 'gaming' },
            { name: 'Spotify', url: 'https://open.spotify.com/user/{username}', category: 'entertainment' },
            { name: 'SoundCloud', url: 'https://soundcloud.com/{username}', category: 'entertainment' },
            { name: 'Behance', url: 'https://behance.net/{username}', category: 'creative' },
            { name: 'Dribbble', url: 'https://dribbble.com/{username}', category: 'creative' },
            { name: 'Flickr', url: 'https://flickr.com/people/{username}', category: 'creative' },
            { name: 'Vimeo', url: 'https://vimeo.com/{username}', category: 'creative' },
            { name: 'HackerOne', url: 'https://hackerone.com/{username}', category: 'security' },
            { name: 'TryHackMe', url: 'https://tryhackme.com/p/{username}', category: 'security' },
            { name: 'About.me', url: 'https://about.me/{username}', category: 'professional' },
            { name: 'Linktree', url: 'https://linktr.ee/{username}', category: 'professional' },
            { name: 'ProductHunt', url: 'https://producthunt.com/@{username}', category: 'professional' },
            { name: 'AngelList', url: 'https://angel.co/u/{username}', category: 'professional' },
            { name: 'Mastodon', url: 'https://mastodon.social/@{username}', category: 'social' },
            { name: 'Threads', url: 'https://threads.net/@{username}', category: 'social' },
            { name: 'Bluesky', url: 'https://bsky.app/profile/{username}', category: 'social' },
            { name: 'Quora', url: 'https://quora.com/profile/{username}', category: 'social' },
            { name: 'Gravatar', url: 'https://gravatar.com/{username}', category: 'professional' },
            { name: 'Telegram', url: 'https://t.me/{username}', category: 'messaging' },
            { name: 'Patreon', url: 'https://patreon.com/{username}', category: 'creative' },
            { name: 'Ko-fi', url: 'https://ko-fi.com/{username}', category: 'creative' },
            { name: 'BuyMeACoffee', url: 'https://buymeacoffee.com/{username}', category: 'creative' },
            { name: 'GitBook', url: 'https://{username}.gitbook.io', category: 'development' },
            { name: 'Hashnode', url: 'https://hashnode.com/@{username}', category: 'development' },
            { name: 'Substack', url: 'https://{username}.substack.com', category: 'professional' },
            { name: 'Notion', url: 'https://notion.so/{username}', category: 'professional' },
            { name: 'Figma', url: 'https://figma.com/@{username}', category: 'creative' },
            { name: 'Calendly', url: 'https://calendly.com/{username}', category: 'professional' },
            { name: 'Gumroad', url: 'https://gumroad.com/{username}', category: 'creative' },
            { name: 'Etsy', url: 'https://etsy.com/shop/{username}', category: 'creative' },
            { name: 'Fiverr', url: 'https://fiverr.com/{username}', category: 'professional' },
            { name: 'Upwork', url: 'https://upwork.com/freelancers/~{username}', category: 'professional' },
            { name: 'VK', url: 'https://vk.com/{username}', category: 'social' },
            { name: 'OK.ru', url: 'https://ok.ru/{username}', category: 'social' },
            { name: 'Weibo', url: 'https://weibo.com/{username}', category: 'social' }
        ];
    }
    
    async search(query, options = {}) {
        const axios = require('axios');
        const results = [];
        
        // Check platforms in batches to avoid overwhelming
        const batchSize = 10;
        const selectedPlatforms = options.platforms 
            ? this.platforms.filter(p => options.platforms.includes(p.name.toLowerCase()))
            : this.platforms;
        
        for (let i = 0; i < selectedPlatforms.length; i += batchSize) {
            const batch = selectedPlatforms.slice(i, i + batchSize);
            
            const checks = batch.map(async platform => {
                try {
                    const url = platform.url.replace('{username}', query);
                    const response = await axios.head(url, {
                        timeout: 5000,
                        maxRedirects: 3,
                        validateStatus: s => s < 500,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    
                    if (response.status === 200) {
                        return {
                            ...this.normalizeResult({}, 'potential'),
                            platform: platform.name,
                            category: platform.category,
                            username: query,
                            url: url,
                            confidence: 0.6,
                            verified: false,
                            note: 'URL accessible - profile likely exists'
                        };
                    }
                } catch (error) {
                    // 404 or timeout - profile doesn't exist or site is blocking
                    return null;
                }
            });
            
            const batchResults = await Promise.all(checks);
            results.push(...batchResults.filter(Boolean));
            
            // Rate limit between batches
            if (i + batchSize < selectedPlatforms.length) {
                await this.sleep(500);
            }
        }
        
        return results;
    }
}

// Search engine adapter (DuckDuckGo, Bing)
class SearchEngineAdapter extends BaseAdapter {
    constructor(config = {}) {
        super('searchengine', { priority: 8, ...config });
    }
    
    async search(query, options = {}) {
        const axios = require('axios');
        const results = [];
        
        try {
            // DuckDuckGo Instant Answer API
            const ddgResponse = await axios.get(
                `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
                { timeout: 10000 }
            );
            
            if (ddgResponse.data) {
                const data = ddgResponse.data;
                
                if (data.AbstractText) {
                    results.push({
                        ...this.normalizeResult(data, 'search'),
                        title: data.Heading,
                        description: data.AbstractText,
                        url: data.AbstractURL,
                        source: 'duckduckgo',
                        imageUrl: data.Image,
                        confidence: 0.5,
                        verified: false
                    });
                }
                
                // Related topics
                (data.RelatedTopics || []).slice(0, 5).forEach(topic => {
                    if (topic.Text) {
                        results.push({
                            ...this.normalizeResult(topic, 'search'),
                            title: topic.Text?.substring(0, 100),
                            url: topic.FirstURL,
                            source: 'duckduckgo',
                            confidence: 0.3,
                            verified: false
                        });
                    }
                });
            }
        } catch (error) {
            console.error(`[SearchEngine Adapter] Error: ${error.message}`);
        }
        
        return results;
    }
}

// ==========================================
// SEARCH AGGREGATOR
// ==========================================

class SearchAggregator extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = { ...AGGREGATOR_CONFIG, ...options };
        this.adapters = new Map();
        this.scans = new Map();
        this.cache = new Map();
        
        // Register default adapters
        this.registerDefaultAdapters();
    }
    
    registerDefaultAdapters() {
        this.registerAdapter(new GitHubAdapter());
        this.registerAdapter(new RedditAdapter());
        this.registerAdapter(new GitLabAdapter());
        this.registerAdapter(new KeybaseAdapter());
        this.registerAdapter(new HackerNewsAdapter());
        this.registerAdapter(new TwitterAdapter());
        this.registerAdapter(new InstagramAdapter());
        this.registerAdapter(new LinkedInAdapter());
        this.registerAdapter(new ShodanAdapter());
        this.registerAdapter(new HunterAdapter());
        this.registerAdapter(new DirectPlatformAdapter());
        this.registerAdapter(new SearchEngineAdapter());
    }
    
    registerAdapter(adapter) {
        this.adapters.set(adapter.name, adapter);
        console.log(`[Aggregator] Registered adapter: ${adapter.name}`);
    }
    
    generateScanId() {
        return `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Start a new scan
     */
    async startScan(query, options = {}) {
        const scanId = this.generateScanId();
        
        const scan = {
            id: scanId,
            query: query,
            options: options,
            status: 'running',
            startTime: Date.now(),
            endTime: null,
            progress: 0,
            results: [],
            errors: [],
            stats: {
                totalSources: this.adapters.size,
                completedSources: 0,
                totalResults: 0,
                uniqueResults: 0
            }
        };
        
        this.scans.set(scanId, scan);
        
        // Check cache first
        const cacheKey = this.getCacheKey(query, options);
        if (this.config.enableCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.config.cacheTTL * 1000) {
                scan.results = cached.results;
                scan.status = 'completed';
                scan.endTime = Date.now();
                scan.fromCache = true;
                this.emit('scan:complete', scan);
                return scan;
            }
        }
        
        // Run scan asynchronously
        this.runScan(scanId, query, options).catch(error => {
            scan.status = 'error';
            scan.errors.push(error.message);
            this.emit('scan:error', { scanId, error });
        });
        
        return scan;
    }
    
    async runScan(scanId, query, options) {
        const scan = this.scans.get(scanId);
        if (!scan) return;
        
        const selectedAdapters = options.adapters 
            ? [...this.adapters.values()].filter(a => options.adapters.includes(a.name))
            : [...this.adapters.values()];
        
        // Sort by priority
        selectedAdapters.sort((a, b) => a.priority - b.priority);
        
        scan.stats.totalSources = selectedAdapters.length;
        
        // Fan-out to all adapters
        const adapterPromises = selectedAdapters.map(async (adapter, index) => {
            try {
                this.emit('scan:adapter:start', { scanId, adapter: adapter.name });
                
                const results = await Promise.race([
                    adapter.search(query, options),
                    this.timeout(this.config.defaultTimeout)
                ]);
                
                // Process results
                results.forEach(result => {
                    scan.results.push(result);
                    scan.stats.totalResults++;
                    
                    this.emit('scan:result', { scanId, result });
                });
                
                scan.stats.completedSources++;
                scan.progress = Math.round((scan.stats.completedSources / scan.stats.totalSources) * 100);
                
                this.emit('scan:progress', { 
                    scanId, 
                    progress: scan.progress,
                    adapter: adapter.name,
                    resultsCount: results.length
                });
                
                return { adapter: adapter.name, results, success: true };
                
            } catch (error) {
                scan.errors.push({ adapter: adapter.name, error: error.message });
                scan.stats.completedSources++;
                scan.progress = Math.round((scan.stats.completedSources / scan.stats.totalSources) * 100);
                
                this.emit('scan:adapter:error', { scanId, adapter: adapter.name, error: error.message });
                
                return { adapter: adapter.name, results: [], success: false, error: error.message };
            }
        });
        
        // Wait for all adapters (with total timeout)
        await Promise.race([
            Promise.all(adapterPromises),
            this.timeout(this.config.totalTimeout)
        ]);
        
        // Deduplicate and score
        scan.results = this.deduplicateResults(scan.results);
        scan.results = this.scoreResults(scan.results, query);
        scan.stats.uniqueResults = scan.results.length;
        
        // Sort by confidence
        scan.results.sort((a, b) => b.confidence - a.confidence);
        
        // Complete scan
        scan.status = 'completed';
        scan.endTime = Date.now();
        scan.progress = 100;
        
        // Cache results
        if (this.config.enableCache) {
            const cacheKey = this.getCacheKey(query, options);
            this.cache.set(cacheKey, {
                results: scan.results,
                timestamp: Date.now()
            });
        }
        
        this.emit('scan:complete', scan);
        
        return scan;
    }
    
    timeout(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), ms);
        });
    }
    
    getCacheKey(query, options) {
        return `${query}:${JSON.stringify(options)}`;
    }
    
    deduplicateResults(results) {
        const seen = new Map();
        
        return results.filter(result => {
            // Create dedup key from multiple fields
            const keys = this.config.dedupeFields
                .map(field => result[field])
                .filter(Boolean)
                .join('|');
            
            if (!keys) return true;
            
            if (seen.has(keys)) {
                // Keep the one with higher confidence
                const existing = seen.get(keys);
                if (result.confidence > existing.confidence) {
                    seen.set(keys, result);
                    return true;
                }
                return false;
            }
            
            seen.set(keys, result);
            return true;
        });
    }
    
    scoreResults(results, query) {
        return results.map(result => {
            let score = result.confidence || 0.5;
            
            // Boost verified results
            if (result.verified) score += 0.2;
            
            // Boost exact username matches
            if (result.username?.toLowerCase() === query.toLowerCase()) {
                score += 0.3;
            }
            
            // Boost results with more data
            const dataFields = ['displayName', 'bio', 'email', 'location', 'avatar'];
            const filledFields = dataFields.filter(f => result[f]).length;
            score += (filledFields / dataFields.length) * 0.1;
            
            // Normalize
            result.confidence = Math.min(1, Math.max(0, score));
            
            // Assign confidence level
            if (result.confidence >= 0.8) result.confidenceLevel = 'high';
            else if (result.confidence >= 0.5) result.confidenceLevel = 'medium';
            else result.confidenceLevel = 'low';
            
            return result;
        });
    }
    
    getScan(scanId) {
        return this.scans.get(scanId);
    }
    
    getAdapters() {
        return [...this.adapters.values()].map(a => ({
            name: a.name,
            priority: a.priority,
            rateLimit: a.rateLimit
        }));
    }
}

// Export
module.exports = {
    SearchAggregator,
    BaseAdapter,
    GitHubAdapter,
    RedditAdapter,
    GitLabAdapter,
    KeybaseAdapter,
    HackerNewsAdapter,
    TwitterAdapter,
    ShodanAdapter,
    HunterAdapter,
    DirectPlatformAdapter,
    SearchEngineAdapter,
    AGGREGATOR_CONFIG
};
