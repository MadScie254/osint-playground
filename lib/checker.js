/**
 * Username OSINT Engine - Username Checker Module
 * Handles verification of usernames across platforms
 */

const axios = require('axios');
const cheerio = require('cheerio');

class UsernameChecker {
    constructor(options = {}) {
        this.timeout = options.timeout || 10000;
        this.userAgent = options.userAgent || 
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.retries = options.retries || 2;
    }

    /**
     * Create axios instance with default config
     */
    createClient() {
        return axios.create({
            timeout: this.timeout,
            headers: {
                'User-Agent': this.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            },
            maxRedirects: 5,
            validateStatus: status => status < 500
        });
    }

    /**
     * Check if username exists on a platform
     */
    async check(platform, username) {
        const url = platform.url.replace('{username}', username);
        const startTime = Date.now();
        
        let lastError;
        for (let attempt = 0; attempt < this.retries; attempt++) {
            try {
                const result = await this.performCheck(url, platform);
                result.responseTime = Date.now() - startTime;
                result.platform = platform.name;
                result.url = url;
                result.category = platform.category;
                result.icon = platform.icon;
                result.color = platform.color;
                return result;
            } catch (error) {
                lastError = error;
                await this.sleep(500 * (attempt + 1));
            }
        }
        
        return {
            platform: platform.name,
            url: url,
            category: platform.category,
            icon: platform.icon,
            color: platform.color,
            status: 'error',
            error: lastError.message,
            responseTime: Date.now() - startTime
        };
    }

    /**
     * Perform the actual check based on platform method
     */
    async performCheck(url, platform) {
        const client = this.createClient();
        const method = platform.checkMethod || 'status';
        
        switch (method) {
            case 'status':
                return this.checkByStatus(client, url, platform.validStatus || 200);
            
            case 'content':
                return this.checkByContent(client, url, platform.validContent);
            
            case 'json':
                return this.checkByJson(client, url);
            
            case 'api':
                return this.checkByApi(client, url, platform);
            
            default:
                return this.checkByStatus(client, url, 200);
        }
    }

    /**
     * Check by HTTP status code
     */
    async checkByStatus(client, url, validStatus) {
        const response = await client.get(url);
        return {
            status: response.status === validStatus ? 'found' : 'not-found',
            httpStatus: response.status
        };
    }

    /**
     * Check by page content
     */
    async checkByContent(client, url, validContent) {
        const response = await client.get(url);
        
        if (response.status !== 200) {
            return { status: 'not-found', httpStatus: response.status };
        }
        
        const $ = cheerio.load(response.data);
        const pageText = $('body').text().toLowerCase();
        const html = response.data.toLowerCase();
        
        // Check for "not found" indicators
        const notFoundIndicators = [
            'page not found',
            'user not found',
            'account suspended',
            'account deleted',
            'profile not found',
            'this account doesn\'t exist',
            'this page isn\'t available',
            'sorry, this page',
            'nothing here',
            '404'
        ];
        
        const hasNotFoundIndicator = notFoundIndicators.some(indicator => 
            pageText.includes(indicator) || html.includes(indicator)
        );
        
        if (hasNotFoundIndicator) {
            return { status: 'not-found', httpStatus: response.status };
        }
        
        // Check for valid content if specified
        if (validContent) {
            const hasValidContent = html.includes(validContent.toLowerCase());
            return {
                status: hasValidContent ? 'found' : 'not-found',
                httpStatus: response.status
            };
        }
        
        return { status: 'found', httpStatus: response.status };
    }

    /**
     * Check by JSON response
     */
    async checkByJson(client, url) {
        try {
            const response = await client.get(url, {
                headers: { 'Accept': 'application/json' }
            });
            
            if (response.status !== 200) {
                return { status: 'not-found', httpStatus: response.status };
            }
            
            const data = response.data;
            
            // Check for error indicators in JSON
            if (data.error || data.errors || data.message === 'Not Found') {
                return { status: 'not-found', httpStatus: response.status };
            }
            
            return { status: 'found', httpStatus: response.status, data: data };
        } catch (error) {
            if (error.response?.status === 404) {
                return { status: 'not-found', httpStatus: 404 };
            }
            throw error;
        }
    }

    /**
     * Check using platform-specific API
     */
    async checkByApi(client, url, platform) {
        // Platform-specific API checks
        const platformName = platform.name.toLowerCase();
        
        switch (platformName) {
            case 'github':
                return this.checkGitHub(url);
            case 'twitter':
            case 'twitter/x':
                return this.checkTwitter(url);
            default:
                return this.checkByStatus(client, url, 200);
        }
    }

    /**
     * GitHub-specific check
     */
    async checkGitHub(url) {
        const username = url.split('/').pop();
        try {
            const response = await axios.get(`https://api.github.com/users/${username}`, {
                headers: { 'Accept': 'application/vnd.github.v3+json' },
                timeout: this.timeout
            });
            return {
                status: 'found',
                httpStatus: response.status,
                data: {
                    name: response.data.name,
                    bio: response.data.bio,
                    repos: response.data.public_repos,
                    followers: response.data.followers
                }
            };
        } catch (error) {
            if (error.response?.status === 404) {
                return { status: 'not-found', httpStatus: 404 };
            }
            throw error;
        }
    }

    /**
     * Twitter-specific check (limited without API)
     */
    async checkTwitter(url) {
        const client = this.createClient();
        try {
            const response = await client.get(url);
            
            if (response.status !== 200) {
                return { status: 'not-found', httpStatus: response.status };
            }
            
            const html = response.data.toLowerCase();
            
            // Twitter shows specific text for non-existent accounts
            if (html.includes('this account doesn\'t exist') || 
                html.includes('account suspended')) {
                return { status: 'not-found', httpStatus: response.status };
            }
            
            return { status: 'found', httpStatus: response.status };
        } catch (error) {
            if (error.response?.status === 404) {
                return { status: 'not-found', httpStatus: 404 };
            }
            throw error;
        }
    }

    /**
     * Batch check multiple platforms
     */
    async batchCheck(platforms, username, concurrency = 5) {
        const results = [];
        const batches = [];
        
        for (let i = 0; i < platforms.length; i += concurrency) {
            batches.push(platforms.slice(i, i + concurrency));
        }
        
        for (const batch of batches) {
            const batchResults = await Promise.all(
                batch.map(platform => this.check(platform, username))
            );
            results.push(...batchResults);
            
            // Small delay between batches
            await this.sleep(200);
        }
        
        return results;
    }

    /**
     * Generate search engine URLs
     */
    generateSearchUrls(username) {
        const encodedUsername = encodeURIComponent(username);
        
        return {
            google: `https://www.google.com/search?q="${encodedUsername}"`,
            googleImages: `https://www.google.com/search?tbm=isch&q="${encodedUsername}"`,
            yandex: `https://yandex.com/search/?text="${encodedUsername}"`,
            yandexImages: `https://yandex.com/images/search?text="${encodedUsername}"`,
            bing: `https://www.bing.com/search?q="${encodedUsername}"`,
            duckduckgo: `https://duckduckgo.com/?q="${encodedUsername}"`,
            startpage: `https://www.startpage.com/sp/search?query="${encodedUsername}"`,
            baidu: `https://www.baidu.com/s?wd="${encodedUsername}"`
        };
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = UsernameChecker;
