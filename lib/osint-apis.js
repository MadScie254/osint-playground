/**
 * Username OSINT Engine - Open Source APIs Integration
 * Integration with various open-source intelligence APIs
 */

const axios = require('axios');

class OSINTApis {
    constructor(options = {}) {
        this.timeout = options.timeout || 15000;
        this.hunterApiKey = options.hunterApiKey || process.env.HUNTER_API_KEY;
        this.shodanApiKey = options.shodanApiKey || process.env.SHODAN_API_KEY;
        this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
        this.hibpApiKey = options.hibpApiKey || process.env.HIBP_API_KEY;
    }

    /**
     * GitHub User Lookup
     */
    async githubUser(username) {
        try {
            const headers = { 'Accept': 'application/vnd.github.v3+json' };
            if (this.githubToken) {
                headers['Authorization'] = `token ${this.githubToken}`;
            }

            const [user, repos, events] = await Promise.all([
                axios.get(`https://api.github.com/users/${username}`, { headers, timeout: this.timeout }),
                axios.get(`https://api.github.com/users/${username}/repos?sort=updated&per_page=10`, { headers, timeout: this.timeout }),
                axios.get(`https://api.github.com/users/${username}/events/public?per_page=10`, { headers, timeout: this.timeout })
            ]);

            return {
                exists: true,
                profile: {
                    username: user.data.login,
                    name: user.data.name,
                    bio: user.data.bio,
                    company: user.data.company,
                    location: user.data.location,
                    blog: user.data.blog,
                    email: user.data.email, // Usually null unless public
                    publicRepos: user.data.public_repos,
                    publicGists: user.data.public_gists,
                    followers: user.data.followers,
                    following: user.data.following,
                    createdAt: user.data.created_at,
                    updatedAt: user.data.updated_at,
                    avatarUrl: user.data.avatar_url,
                    profileUrl: user.data.html_url
                },
                recentRepos: repos.data.map(repo => ({
                    name: repo.name,
                    description: repo.description,
                    language: repo.language,
                    stars: repo.stargazers_count,
                    forks: repo.forks_count,
                    url: repo.html_url,
                    updatedAt: repo.updated_at
                })),
                recentActivity: events.data.slice(0, 5).map(event => ({
                    type: event.type,
                    repo: event.repo?.name,
                    createdAt: event.created_at
                }))
            };
        } catch (error) {
            if (error.response?.status === 404) {
                return { exists: false };
            }
            throw error;
        }
    }

    /**
     * GitLab User Lookup
     */
    async gitlabUser(username) {
        try {
            const response = await axios.get(
                `https://gitlab.com/api/v4/users?username=${username}`,
                { timeout: this.timeout }
            );

            if (!response.data.length) {
                return { exists: false };
            }

            const user = response.data[0];
            return {
                exists: true,
                profile: {
                    username: user.username,
                    name: user.name,
                    state: user.state,
                    avatarUrl: user.avatar_url,
                    webUrl: user.web_url
                }
            };
        } catch (error) {
            if (error.response?.status === 404) {
                return { exists: false };
            }
            throw error;
        }
    }

    /**
     * Hunter.io Email Finder
     */
    async hunterEmailFinder(domain, name) {
        if (!this.hunterApiKey) {
            return { configured: false, error: 'Hunter API key not configured' };
        }

        try {
            const response = await axios.get('https://api.hunter.io/v2/email-finder', {
                params: {
                    domain,
                    full_name: name,
                    api_key: this.hunterApiKey
                },
                timeout: this.timeout
            });

            return {
                configured: true,
                email: response.data.data?.email,
                score: response.data.data?.score,
                sources: response.data.data?.sources
            };
        } catch (error) {
            return { configured: true, error: error.message };
        }
    }

    /**
     * Hunter.io Domain Search
     */
    async hunterDomainSearch(domain) {
        if (!this.hunterApiKey) {
            return { configured: false, error: 'Hunter API key not configured' };
        }

        try {
            const response = await axios.get('https://api.hunter.io/v2/domain-search', {
                params: {
                    domain,
                    api_key: this.hunterApiKey
                },
                timeout: this.timeout
            });

            return {
                configured: true,
                domain: response.data.data?.domain,
                organization: response.data.data?.organization,
                emailCount: response.data.data?.emails?.length || 0,
                pattern: response.data.data?.pattern,
                emails: response.data.data?.emails?.map(e => ({
                    email: e.value,
                    type: e.type,
                    confidence: e.confidence,
                    firstName: e.first_name,
                    lastName: e.last_name,
                    position: e.position
                })) || []
            };
        } catch (error) {
            return { configured: true, error: error.message };
        }
    }

    /**
     * Shodan Host Lookup
     */
    async shodanHost(ip) {
        if (!this.shodanApiKey) {
            return { configured: false, error: 'Shodan API key not configured' };
        }

        try {
            const response = await axios.get(`https://api.shodan.io/shodan/host/${ip}`, {
                params: { key: this.shodanApiKey },
                timeout: this.timeout
            });

            return {
                configured: true,
                ip: response.data.ip_str,
                hostnames: response.data.hostnames,
                country: response.data.country_name,
                city: response.data.city,
                org: response.data.org,
                isp: response.data.isp,
                ports: response.data.ports,
                vulns: response.data.vulns,
                lastUpdate: response.data.last_update
            };
        } catch (error) {
            if (error.response?.status === 404) {
                return { configured: true, found: false };
            }
            return { configured: true, error: error.message };
        }
    }

    /**
     * Have I Been Pwned - Breach Check
     */
    async hibpBreachCheck(email) {
        if (!this.hibpApiKey) {
            return { configured: false, error: 'HIBP API key not configured' };
        }

        try {
            const response = await axios.get(
                `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`,
                {
                    headers: {
                        'hibp-api-key': this.hibpApiKey,
                        'User-Agent': 'Username-OSINT-Engine'
                    },
                    timeout: this.timeout
                }
            );

            return {
                configured: true,
                breached: true,
                breachCount: response.data.length,
                breaches: response.data.map(b => ({
                    name: b.Name,
                    domain: b.Domain,
                    breachDate: b.BreachDate,
                    dataClasses: b.DataClasses,
                    isVerified: b.IsVerified,
                    isSensitive: b.IsSensitive
                }))
            };
        } catch (error) {
            if (error.response?.status === 404) {
                return { configured: true, breached: false };
            }
            return { configured: true, error: error.message };
        }
    }

    /**
     * Keybase User Lookup
     */
    async keybaseUser(username) {
        try {
            const response = await axios.get(
                `https://keybase.io/_/api/1.0/user/lookup.json?username=${username}`,
                { timeout: this.timeout }
            );

            if (!response.data.them) {
                return { exists: false };
            }

            const user = response.data.them;
            return {
                exists: true,
                profile: {
                    username: user.basics?.username,
                    fullName: user.profile?.full_name,
                    bio: user.profile?.bio,
                    location: user.profile?.location,
                    proofs: user.proofs_summary?.all?.map(p => ({
                        type: p.proof_type,
                        username: p.nametag,
                        url: p.service_url
                    })) || []
                }
            };
        } catch (error) {
            if (error.response?.status === 404) {
                return { exists: false };
            }
            throw error;
        }
    }

    /**
     * NPM Package Author Lookup
     */
    async npmUser(username) {
        try {
            const response = await axios.get(
                `https://registry.npmjs.org/-/user/org.couchdb.user:${username}`,
                { timeout: this.timeout }
            );

            return {
                exists: true,
                profile: {
                    name: response.data.name,
                    email: response.data.email
                }
            };
        } catch (error) {
            // NPM returns 404 for non-existent users
            if (error.response?.status === 404) {
                // Try searching for packages by this user
                try {
                    const searchResponse = await axios.get(
                        `https://registry.npmjs.org/-/v1/search?text=author:${username}&size=5`,
                        { timeout: this.timeout }
                    );
                    
                    if (searchResponse.data.objects?.length > 0) {
                        return {
                            exists: true,
                            packages: searchResponse.data.objects.map(p => ({
                                name: p.package.name,
                                version: p.package.version,
                                description: p.package.description
                            }))
                        };
                    }
                } catch (e) {
                    // Ignore search error
                }
                return { exists: false };
            }
            throw error;
        }
    }

    /**
     * PyPI User Lookup
     */
    async pypiUser(username) {
        try {
            const response = await axios.get(
                `https://pypi.org/pypi?%3Aaction=search&term=${username}&submit=search`,
                { timeout: this.timeout }
            );

            // PyPI doesn't have a direct user API, check if any packages exist
            return {
                exists: response.status === 200,
                searchUrl: `https://pypi.org/user/${username}/`
            };
        } catch (error) {
            return { exists: false };
        }
    }

    /**
     * Gravatar Profile Lookup
     */
    async gravatarProfile(email) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(email.toLowerCase().trim()).digest('hex');
        
        try {
            const response = await axios.get(
                `https://en.gravatar.com/${hash}.json`,
                { timeout: this.timeout }
            );

            const profile = response.data.entry?.[0];
            return {
                exists: true,
                profile: {
                    hash,
                    displayName: profile?.displayName,
                    preferredUsername: profile?.preferredUsername,
                    aboutMe: profile?.aboutMe,
                    currentLocation: profile?.currentLocation,
                    thumbnailUrl: profile?.thumbnailUrl,
                    urls: profile?.urls,
                    accounts: profile?.accounts
                }
            };
        } catch (error) {
            if (error.response?.status === 404) {
                return { exists: false };
            }
            throw error;
        }
    }

    /**
     * Reddit User Lookup
     */
    async redditUser(username) {
        try {
            const response = await axios.get(
                `https://www.reddit.com/user/${username}/about.json`,
                {
                    headers: {
                        'User-Agent': 'Username-OSINT-Engine/1.0'
                    },
                    timeout: this.timeout
                }
            );

            const data = response.data.data;
            return {
                exists: true,
                profile: {
                    name: data.name,
                    created: new Date(data.created_utc * 1000).toISOString(),
                    karma: {
                        total: data.total_karma,
                        link: data.link_karma,
                        comment: data.comment_karma
                    },
                    isGold: data.is_gold,
                    isMod: data.is_mod,
                    verified: data.verified,
                    iconUrl: data.icon_img?.split('?')[0]
                }
            };
        } catch (error) {
            if (error.response?.status === 404) {
                return { exists: false };
            }
            throw error;
        }
    }

    /**
     * Steam User Lookup (requires Steam Web API key)
     */
    async steamUser(vanityUrl) {
        const steamApiKey = process.env.STEAM_API_KEY;
        if (!steamApiKey) {
            return { configured: false, error: 'Steam API key not configured' };
        }

        try {
            // Resolve vanity URL to Steam ID
            const resolveResponse = await axios.get(
                `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/`,
                {
                    params: {
                        key: steamApiKey,
                        vanityurl: vanityUrl
                    },
                    timeout: this.timeout
                }
            );

            if (resolveResponse.data.response.success !== 1) {
                return { exists: false };
            }

            const steamId = resolveResponse.data.response.steamid;

            // Get player summary
            const summaryResponse = await axios.get(
                `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/`,
                {
                    params: {
                        key: steamApiKey,
                        steamids: steamId
                    },
                    timeout: this.timeout
                }
            );

            const player = summaryResponse.data.response.players[0];
            return {
                exists: true,
                profile: {
                    steamId,
                    personaName: player.personaname,
                    profileUrl: player.profileurl,
                    avatar: player.avatarfull,
                    countryCode: player.loccountrycode,
                    created: player.timecreated ? new Date(player.timecreated * 1000).toISOString() : null,
                    lastLogoff: player.lastlogoff ? new Date(player.lastlogoff * 1000).toISOString() : null
                }
            };
        } catch (error) {
            return { configured: true, error: error.message };
        }
    }

    /**
     * Run all available OSINT checks
     */
    async runAll(username, options = {}) {
        const results = {};
        const checks = [];

        // Always run these (no API key needed)
        checks.push(
            this.githubUser(username).then(r => results.github = r),
            this.gitlabUser(username).then(r => results.gitlab = r),
            this.keybaseUser(username).then(r => results.keybase = r),
            this.npmUser(username).then(r => results.npm = r),
            this.redditUser(username).then(r => results.reddit = r)
        );

        // Run if API keys configured
        if (this.shodanApiKey && options.ip) {
            checks.push(
                this.shodanHost(options.ip).then(r => results.shodan = r)
            );
        }

        if (this.hunterApiKey && options.domain) {
            checks.push(
                this.hunterDomainSearch(options.domain).then(r => results.hunter = r)
            );
        }

        if (this.hibpApiKey && options.email) {
            checks.push(
                this.hibpBreachCheck(options.email).then(r => results.hibp = r)
            );
        }

        if (options.email) {
            checks.push(
                this.gravatarProfile(options.email).then(r => results.gravatar = r)
            );
        }

        await Promise.allSettled(checks);
        return results;
    }
}

module.exports = OSINTApis;
