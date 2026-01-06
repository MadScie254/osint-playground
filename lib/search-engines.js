s/**
 * Username OSINT Engine - Search Engine Integration
 * Handles queries to multiple search engines
 */

const axios = require('axios');
const cheerio = require('cheerio');

class SearchEngineIntegration {
    constructor(options = {}) {
        this.googleApiKey = options.googleApiKey || process.env.GOOGLE_API_KEY;
        this.googleCseId = options.googleCseId || process.env.GOOGLE_CSE_ID;
        this.yandexApiKey = options.yandexApiKey || process.env.YANDEX_API_KEY;
        this.bingApiKey = options.bingApiKey || process.env.BING_API_KEY;
        this.timeout = options.timeout || 15000;
    }

    /**
     * Search across all configured engines
     */
    async searchAll(query, options = {}) {
        const engines = options.engines || ['google', 'duckduckgo', 'yandex', 'bing'];
        const results = {};
        
        const promises = engines.map(async engine => {
            try {
                results[engine] = await this.search(engine, query);
            } catch (error) {
                results[engine] = { error: error.message, results: [] };
            }
        });
        
        await Promise.allSettled(promises);
        return results;
    }

    /**
     * Search a specific engine
     */
    async search(engine, query) {
        switch (engine.toLowerCase()) {
            case 'google':
                return this.searchGoogle(query);
            case 'yandex':
                return this.searchYandex(query);
            case 'bing':
                return this.searchBing(query);
            case 'duckduckgo':
                return this.searchDuckDuckGo(query);
            default:
                throw new Error(`Unknown search engine: ${engine}`);
        }
    }

    /**
     * Google Custom Search API
     */
    async searchGoogle(query) {
        if (!this.googleApiKey || !this.googleCseId) {
            return {
                engine: 'Google',
                configured: false,
                searchUrl: `https://www.google.com/search?q="${encodeURIComponent(query)}"`,
                results: []
            };
        }

        try {
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    key: this.googleApiKey,
                    cx: this.googleCseId,
                    q: `"${query}"`,
                    num: 10
                },
                timeout: this.timeout
            });

            return {
                engine: 'Google',
                configured: true,
                searchUrl: `https://www.google.com/search?q="${encodeURIComponent(query)}"`,
                totalResults: response.data.searchInformation?.totalResults || 0,
                results: response.data.items?.map(item => ({
                    title: item.title,
                    url: item.link,
                    snippet: item.snippet,
                    displayLink: item.displayLink
                })) || []
            };
        } catch (error) {
            throw new Error(`Google search failed: ${error.message}`);
        }
    }

    /**
     * Yandex Search API
     */
    async searchYandex(query) {
        if (!this.yandexApiKey) {
            return {
                engine: 'Yandex',
                configured: false,
                searchUrl: `https://yandex.com/search/?text="${encodeURIComponent(query)}"`,
                results: []
            };
        }

        try {
            const response = await axios.get('https://yandex.com/search/xml', {
                params: {
                    user: this.yandexApiKey.split(':')[0],
                    key: this.yandexApiKey.split(':')[1],
                    query: `"${query}"`,
                    l10n: 'en',
                    filter: 'none',
                    maxpassages: 2
                },
                timeout: this.timeout
            });

            // Parse XML response
            const $ = cheerio.load(response.data, { xmlMode: true });
            const results = [];
            
            $('group doc').each((i, doc) => {
                results.push({
                    title: $(doc).find('title').text(),
                    url: $(doc).find('url').text(),
                    snippet: $(doc).find('passages passage').first().text(),
                    domain: $(doc).find('domain').text()
                });
            });

            return {
                engine: 'Yandex',
                configured: true,
                searchUrl: `https://yandex.com/search/?text="${encodeURIComponent(query)}"`,
                results
            };
        } catch (error) {
            throw new Error(`Yandex search failed: ${error.message}`);
        }
    }

    /**
     * Bing Search API
     */
    async searchBing(query) {
        if (!this.bingApiKey) {
            return {
                engine: 'Bing',
                configured: false,
                searchUrl: `https://www.bing.com/search?q="${encodeURIComponent(query)}"`,
                results: []
            };
        }

        try {
            const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
                headers: {
                    'Ocp-Apim-Subscription-Key': this.bingApiKey
                },
                params: {
                    q: `"${query}"`,
                    count: 10,
                    mkt: 'en-US'
                },
                timeout: this.timeout
            });

            return {
                engine: 'Bing',
                configured: true,
                searchUrl: `https://www.bing.com/search?q="${encodeURIComponent(query)}"`,
                totalResults: response.data.webPages?.totalEstimatedMatches || 0,
                results: response.data.webPages?.value?.map(item => ({
                    title: item.name,
                    url: item.url,
                    snippet: item.snippet,
                    displayLink: item.displayUrl
                })) || []
            };
        } catch (error) {
            throw new Error(`Bing search failed: ${error.message}`);
        }
    }

    /**
     * DuckDuckGo Instant Answer API
     */
    async searchDuckDuckGo(query) {
        try {
            const response = await axios.get('https://api.duckduckgo.com/', {
                params: {
                    q: query,
                    format: 'json',
                    no_redirect: 1,
                    no_html: 1
                },
                timeout: this.timeout
            });

            const results = [];
            
            // Add abstract result if present
            if (response.data.Abstract) {
                results.push({
                    title: response.data.Heading || query,
                    url: response.data.AbstractURL,
                    snippet: response.data.Abstract,
                    source: response.data.AbstractSource
                });
            }

            // Add related topics
            if (response.data.RelatedTopics) {
                response.data.RelatedTopics.forEach(topic => {
                    if (topic.FirstURL) {
                        results.push({
                            title: topic.Text?.split(' - ')[0] || '',
                            url: topic.FirstURL,
                            snippet: topic.Text,
                            icon: topic.Icon?.URL
                        });
                    }
                });
            }

            return {
                engine: 'DuckDuckGo',
                configured: true,
                searchUrl: `https://duckduckgo.com/?q="${encodeURIComponent(query)}"`,
                results
            };
        } catch (error) {
            throw new Error(`DuckDuckGo search failed: ${error.message}`);
        }
    }

    /**
     * Generate all search engine URLs for manual access
     */
    generateSearchUrls(query) {
        const encoded = encodeURIComponent(query);
        return {
            google: {
                name: 'Google',
                web: `https://www.google.com/search?q="${encoded}"`,
                images: `https://www.google.com/search?tbm=isch&q="${encoded}"`,
                news: `https://www.google.com/search?tbm=nws&q="${encoded}"`
            },
            yandex: {
                name: 'Yandex',
                web: `https://yandex.com/search/?text="${encoded}"`,
                images: `https://yandex.com/images/search?text="${encoded}"`,
                video: `https://yandex.com/video/search?text="${encoded}"`
            },
            bing: {
                name: 'Bing',
                web: `https://www.bing.com/search?q="${encoded}"`,
                images: `https://www.bing.com/images/search?q="${encoded}"`,
                news: `https://www.bing.com/news/search?q="${encoded}"`
            },
            duckduckgo: {
                name: 'DuckDuckGo',
                web: `https://duckduckgo.com/?q="${encoded}"`,
                images: `https://duckduckgo.com/?q="${encoded}"&iax=images&ia=images`
            },
            startpage: {
                name: 'Startpage',
                web: `https://www.startpage.com/sp/search?query="${encoded}"`
            },
            baidu: {
                name: 'Baidu',
                web: `https://www.baidu.com/s?wd="${encoded}"`
            },
            ecosia: {
                name: 'Ecosia',
                web: `https://www.ecosia.org/search?q="${encoded}"`
            }
        };
    }

    /**
     * Reverse image search URLs
     */
    generateReverseImageUrls(imageUrl) {
        const encoded = encodeURIComponent(imageUrl);
        return {
            google: `https://lens.google.com/uploadbyurl?url=${encoded}`,
            yandex: `https://yandex.com/images/search?rpt=imageview&url=${encoded}`,
            bing: `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIHMP&q=imgurl:${encoded}`,
            tineye: `https://tineye.com/search?url=${encoded}`
        };
    }
}

module.exports = SearchEngineIntegration;
