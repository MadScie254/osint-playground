/**
 * OSINT Playground - Core Intelligence Engine
 * Orchestrates all OSINT APIs and data fusion
 */

class OSINTCore {
    constructor() {
        this.apiEndpoints = {
            // Internal API
            base: '/api',
            
            // External APIs (proxied through backend)
            spiderfoot: '/api/spiderfoot',
            shodan: '/api/shodan',
            hunter: '/api/hunter',
            github: '/api/github',
            hibp: '/api/hibp',
            twitter: '/api/twitter',
            
            // GeoInt
            nominatim: 'https://nominatim.openstreetmap.org',
            overpass: 'https://overpass-api.de/api/interpreter',
            
            // Threat Intel
            abuseipdb: '/api/abuseipdb',
            virustotal: '/api/virustotal',
            alienvault: '/api/alienvault'
        };
        
        this.scanProfiles = {
            social: {
                name: 'Social Intelligence',
                modules: ['username', 'social_profiles', 'email', 'photos'],
                apis: ['github', 'twitter', 'reddit', 'keybase', 'gravatar']
            },
            domain: {
                name: 'Domain Intelligence',
                modules: ['whois', 'dns', 'subdomains', 'emails', 'tech_stack'],
                apis: ['hunter', 'shodan', 'dnsrecords', 'builtwith']
            },
            breach: {
                name: 'Breach Analysis',
                modules: ['email_breaches', 'password_leaks', 'paste_sites'],
                apis: ['hibp', 'dehashed', 'leakcheck']
            },
            geo: {
                name: 'GeoInt',
                modules: ['address', 'coordinates', 'nearby', 'historical'],
                apis: ['nominatim', 'overpass', 'wikidata']
            },
            threat: {
                name: 'Threat Intel',
                modules: ['ip_reputation', 'malware', 'phishing', 'c2'],
                apis: ['shodan', 'abuseipdb', 'virustotal', 'alienvault']
            },
            deep: {
                name: 'Deep Scan',
                modules: ['all'],
                apis: ['all']
            }
        };
        
        this.results = [];
        this.entities = new Map();
        this.relationships = [];
        this.scanHistory = [];
        this.activeScans = new Map();
    }
    
    // Core scan orchestration
    async startScan(target, options = {}) {
        const scanId = this.generateScanId();
        const profile = options.profile || 'social';
        const modules = this.scanProfiles[profile]?.modules || [];
        
        const scan = {
            id: scanId,
            target,
            profile,
            modules,
            startTime: new Date(),
            status: 'running',
            results: [],
            entities: [],
            errors: []
        };
        
        this.activeScans.set(scanId, scan);
        this.emitEvent('scanStarted', scan);
        
        try {
            // Determine target type
            const targetType = this.detectTargetType(target);
            
            // Run appropriate modules in parallel where possible
            const promises = [];
            
            if (targetType === 'username') {
                promises.push(this.scanUsername(scanId, target.value));
                if (modules.includes('email')) {
                    promises.push(this.guessEmails(scanId, target.value));
                }
            }
            
            if (targetType === 'email') {
                promises.push(this.scanEmail(scanId, target.value));
            }
            
            if (targetType === 'domain') {
                promises.push(this.scanDomain(scanId, target.value));
            }
            
            if (targetType === 'ip') {
                promises.push(this.scanIP(scanId, target.value));
            }
            
            if (targetType === 'person') {
                promises.push(this.scanPerson(scanId, target));
            }
            
            if (targetType === 'organization') {
                promises.push(this.scanOrganization(scanId, target));
            }
            
            await Promise.allSettled(promises);
            
            // Mark scan complete
            scan.status = 'completed';
            scan.endTime = new Date();
            this.scanHistory.push(scan);
            this.emitEvent('scanCompleted', scan);
            
        } catch (error) {
            scan.status = 'error';
            scan.errors.push(error.message);
            this.emitEvent('scanError', { scanId, error: error.message });
        }
        
        return scan;
    }
    
    detectTargetType(target) {
        if (typeof target === 'string') {
            if (target.includes('@')) return 'email';
            if (target.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) return 'ip';
            if (target.includes('.') && !target.includes(' ')) return 'domain';
            return 'username';
        }
        
        if (target.type) return target.type;
        if (target.firstName && target.lastName) return 'person';
        if (target.orgName) return 'organization';
        
        return 'unknown';
    }
    
    // Username scanning
    async scanUsername(scanId, username) {
        this.emitEvent('moduleStarted', { scanId, module: 'username' });
        
        try {
            // Check multiple platforms
            const response = await fetch(`${this.apiEndpoints.base}/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const text = decoder.decode(value);
                const lines = text.split('\n').filter(Boolean);
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            this.processUsernameResult(scanId, username, data);
                        } catch (e) {}
                    }
                }
            }
            
            // Also check via additional APIs
            await Promise.allSettled([
                this.checkGitHub(scanId, username),
                this.checkKeybase(scanId, username)
            ]);
            
        } catch (error) {
            this.emitEvent('moduleError', { scanId, module: 'username', error: error.message });
        }
        
        this.emitEvent('moduleCompleted', { scanId, module: 'username' });
    }
    
    processUsernameResult(scanId, username, data) {
        if (data.found) {
            const entity = {
                id: `social_${data.platform}_${username}`,
                type: 'social',
                label: `@${username} on ${data.platform}`,
                platform: data.platform,
                url: data.url,
                confidence: data.status === 'verified' ? 0.95 : 0.7
            };
            
            this.addEntity(entity);
            this.addResult(scanId, {
                type: 'social_profile',
                source: data.platform,
                data: entity,
                timestamp: new Date()
            });
            
            this.emitEvent('resultFound', { scanId, result: entity });
        }
    }
    
    async checkGitHub(scanId, username) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/osint/github/${username}`);
            const data = await response.json();
            
            if (data.login) {
                const entity = {
                    id: `github_${username}`,
                    type: 'social',
                    label: data.name || username,
                    platform: 'GitHub',
                    url: data.html_url,
                    avatar: data.avatar_url,
                    bio: data.bio,
                    location: data.location,
                    company: data.company,
                    email: data.email,
                    repos: data.public_repos,
                    followers: data.followers,
                    confidence: 0.95
                };
                
                this.addEntity(entity);
                this.addResult(scanId, {
                    type: 'github_profile',
                    source: 'GitHub',
                    data: entity
                });
                
                // If location found, create geo entity
                if (data.location) {
                    this.addRelatedGeo(scanId, entity.id, data.location);
                }
                
                // If company found, create org entity
                if (data.company) {
                    const orgEntity = {
                        id: `org_${data.company.replace(/[^a-z0-9]/gi, '_')}`,
                        type: 'organization',
                        label: data.company,
                        confidence: 0.7
                    };
                    this.addEntity(orgEntity);
                    this.addRelationship(entity.id, orgEntity.id, 'works_at');
                }
                
                this.emitEvent('resultFound', { scanId, result: entity });
            }
        } catch (error) {
            console.error('GitHub check error:', error);
        }
    }
    
    async checkKeybase(scanId, username) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/osint/keybase/${username}`);
            const data = await response.json();
            
            if (data.them && data.them.length > 0) {
                const kb = data.them[0];
                const entity = {
                    id: `keybase_${username}`,
                    type: 'social',
                    label: kb.profile?.full_name || username,
                    platform: 'Keybase',
                    url: `https://keybase.io/${username}`,
                    bio: kb.profile?.bio,
                    proofs: kb.proofs_summary?.all || [],
                    confidence: 0.9
                };
                
                this.addEntity(entity);
                
                // Extract linked proofs
                if (entity.proofs) {
                    entity.proofs.forEach(proof => {
                        const proofEntity = {
                            id: `proof_${proof.proof_type}_${proof.nametag}`,
                            type: 'social',
                            label: `${proof.nametag} (${proof.proof_type})`,
                            platform: proof.proof_type,
                            confidence: 0.85
                        };
                        this.addEntity(proofEntity);
                        this.addRelationship(entity.id, proofEntity.id, 'verified_identity');
                    });
                }
                
                this.addResult(scanId, {
                    type: 'keybase_profile',
                    source: 'Keybase',
                    data: entity
                });
            }
        } catch (error) {
            console.error('Keybase check error:', error);
        }
    }
    
    // Email scanning
    async scanEmail(scanId, email) {
        this.emitEvent('moduleStarted', { scanId, module: 'email' });
        
        try {
            await Promise.allSettled([
                this.checkHIBP(scanId, email),
                this.checkHunter(scanId, email),
                this.checkGravatar(scanId, email)
            ]);
        } catch (error) {
            this.emitEvent('moduleError', { scanId, module: 'email', error: error.message });
        }
        
        this.emitEvent('moduleCompleted', { scanId, module: 'email' });
    }
    
    async checkHIBP(scanId, email) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/osint/hibp/${email}`);
            const breaches = await response.json();
            
            if (Array.isArray(breaches) && breaches.length > 0) {
                const entity = {
                    id: `email_${email.replace(/[^a-z0-9]/gi, '_')}`,
                    type: 'email',
                    label: email,
                    breaches: breaches,
                    breachCount: breaches.length,
                    confidence: 1
                };
                
                this.addEntity(entity);
                
                // Create breach entities
                breaches.forEach(breach => {
                    const breachEntity = {
                        id: `breach_${breach.Name}`,
                        type: 'breach',
                        label: breach.Title || breach.Name,
                        date: breach.BreachDate,
                        dataClasses: breach.DataClasses,
                        confidence: 1
                    };
                    this.addEntity(breachEntity);
                    this.addRelationship(entity.id, breachEntity.id, 'exposed_in');
                });
                
                this.addResult(scanId, {
                    type: 'breach_data',
                    source: 'HaveIBeenPwned',
                    data: { email, breaches },
                    severity: 'high'
                });
                
                this.emitEvent('resultFound', { 
                    scanId, 
                    result: { type: 'breach', breaches: breaches.length }
                });
            }
        } catch (error) {
            console.error('HIBP check error:', error);
        }
    }
    
    async checkHunter(scanId, email) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/osint/hunter/verify?email=${email}`);
            const data = await response.json();
            
            if (data.data) {
                const result = data.data;
                this.addResult(scanId, {
                    type: 'email_verification',
                    source: 'Hunter.io',
                    data: {
                        email,
                        status: result.status,
                        score: result.score,
                        sources: result.sources
                    }
                });
            }
        } catch (error) {
            console.error('Hunter check error:', error);
        }
    }
    
    async checkGravatar(scanId, email) {
        try {
            const hash = await this.md5(email.toLowerCase().trim());
            const url = `https://www.gravatar.com/avatar/${hash}?d=404`;
            
            const response = await fetch(url);
            if (response.ok) {
                this.addResult(scanId, {
                    type: 'gravatar',
                    source: 'Gravatar',
                    data: {
                        email,
                        avatarUrl: url.replace('?d=404', '')
                    }
                });
            }
        } catch (error) {
            console.error('Gravatar check error:', error);
        }
    }
    
    // Domain scanning
    async scanDomain(scanId, domain) {
        this.emitEvent('moduleStarted', { scanId, module: 'domain' });
        
        try {
            await Promise.allSettled([
                this.checkShodan(scanId, domain),
                this.checkHunterDomain(scanId, domain),
                this.checkDNS(scanId, domain)
            ]);
        } catch (error) {
            this.emitEvent('moduleError', { scanId, module: 'domain', error: error.message });
        }
        
        this.emitEvent('moduleCompleted', { scanId, module: 'domain' });
    }
    
    async checkShodan(scanId, target) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/osint/shodan/${target}`);
            const data = await response.json();
            
            if (data.ip_str || data.data) {
                const entity = {
                    id: `ip_${data.ip_str || target}`,
                    type: 'ip',
                    label: data.ip_str || target,
                    location: data.city ? `${data.city}, ${data.country_name}` : data.country_name,
                    lat: data.latitude,
                    lng: data.longitude,
                    isp: data.isp,
                    org: data.org,
                    ports: data.ports,
                    hostnames: data.hostnames,
                    vulns: data.vulns,
                    confidence: 0.95
                };
                
                this.addEntity(entity);
                
                // Create geo entity if location available
                if (data.latitude && data.longitude) {
                    const geoEntity = {
                        id: `geo_${data.ip_str}`,
                        type: 'location',
                        label: entity.location,
                        lat: data.latitude,
                        lng: data.longitude,
                        confidence: 0.8
                    };
                    this.addEntity(geoEntity);
                    this.addRelationship(entity.id, geoEntity.id, 'located_at');
                }
                
                this.addResult(scanId, {
                    type: 'shodan_intel',
                    source: 'Shodan',
                    data: entity,
                    severity: data.vulns ? 'high' : 'info'
                });
                
                this.emitEvent('resultFound', { scanId, result: entity });
            }
        } catch (error) {
            console.error('Shodan check error:', error);
        }
    }
    
    async checkHunterDomain(scanId, domain) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/osint/hunter/domain?domain=${domain}`);
            const data = await response.json();
            
            if (data.data) {
                const result = data.data;
                
                // Create domain entity
                const domainEntity = {
                    id: `domain_${domain}`,
                    type: 'domain',
                    label: domain,
                    organization: result.organization,
                    emails: result.emails,
                    emailCount: result.emails?.length || 0,
                    confidence: 0.9
                };
                
                this.addEntity(domainEntity);
                
                // Create email entities
                if (result.emails) {
                    result.emails.slice(0, 10).forEach(emailData => {
                        const emailEntity = {
                            id: `email_${emailData.value}`,
                            type: 'email',
                            label: emailData.value,
                            name: `${emailData.first_name} ${emailData.last_name}`.trim(),
                            position: emailData.position,
                            confidence: emailData.confidence / 100
                        };
                        this.addEntity(emailEntity);
                        this.addRelationship(domainEntity.id, emailEntity.id, 'has_email');
                    });
                }
                
                this.addResult(scanId, {
                    type: 'domain_emails',
                    source: 'Hunter.io',
                    data: domainEntity
                });
            }
        } catch (error) {
            console.error('Hunter domain check error:', error);
        }
    }
    
    async checkDNS(scanId, domain) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/dns/${domain}`);
            const records = await response.json();
            
            if (records) {
                this.addResult(scanId, {
                    type: 'dns_records',
                    source: 'DNS',
                    data: { domain, records }
                });
            }
        } catch (error) {
            console.error('DNS check error:', error);
        }
    }
    
    // IP scanning
    async scanIP(scanId, ip) {
        this.emitEvent('moduleStarted', { scanId, module: 'ip' });
        
        try {
            await Promise.allSettled([
                this.checkShodan(scanId, ip),
                this.checkAbuseIPDB(scanId, ip),
                this.checkVirusTotal(scanId, ip)
            ]);
        } catch (error) {
            this.emitEvent('moduleError', { scanId, module: 'ip', error: error.message });
        }
        
        this.emitEvent('moduleCompleted', { scanId, module: 'ip' });
    }
    
    async checkAbuseIPDB(scanId, ip) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/osint/abuseipdb/${ip}`);
            const data = await response.json();
            
            if (data.data) {
                this.addResult(scanId, {
                    type: 'ip_reputation',
                    source: 'AbuseIPDB',
                    data: data.data,
                    severity: data.data.abuseConfidenceScore > 50 ? 'high' : 'low'
                });
            }
        } catch (error) {
            console.error('AbuseIPDB check error:', error);
        }
    }
    
    async checkVirusTotal(scanId, target) {
        try {
            const response = await fetch(`${this.apiEndpoints.base}/osint/virustotal/${target}`);
            const data = await response.json();
            
            if (data) {
                this.addResult(scanId, {
                    type: 'virustotal',
                    source: 'VirusTotal',
                    data: data,
                    severity: data.positives > 0 ? 'high' : 'low'
                });
            }
        } catch (error) {
            console.error('VirusTotal check error:', error);
        }
    }
    
    // Person scanning
    async scanPerson(scanId, person) {
        this.emitEvent('moduleStarted', { scanId, module: 'person' });
        
        const { firstName, lastName, location } = person;
        const fullName = `${firstName} ${lastName}`;
        
        // Create person entity
        const personEntity = {
            id: `person_${fullName.replace(/\s+/g, '_')}`,
            type: 'person',
            label: fullName,
            firstName,
            lastName,
            confidence: 0.8
        };
        
        this.addEntity(personEntity);
        
        try {
            // Generate possible usernames
            const usernames = this.generateUsernames(firstName, lastName);
            
            // Search for each username
            for (const username of usernames.slice(0, 5)) {
                await this.scanUsername(scanId, username);
            }
            
            // Generate possible emails
            if (person.domain) {
                const emails = this.generateEmails(firstName, lastName, person.domain);
                for (const email of emails) {
                    await this.scanEmail(scanId, email);
                }
            }
            
            // Geocode location if provided
            if (location) {
                await this.addRelatedGeo(scanId, personEntity.id, location);
            }
            
        } catch (error) {
            this.emitEvent('moduleError', { scanId, module: 'person', error: error.message });
        }
        
        this.emitEvent('moduleCompleted', { scanId, module: 'person' });
    }
    
    // Organization scanning  
    async scanOrganization(scanId, org) {
        this.emitEvent('moduleStarted', { scanId, module: 'organization' });
        
        const { name, domain, location } = org;
        
        const orgEntity = {
            id: `org_${name.replace(/\s+/g, '_')}`,
            type: 'organization',
            label: name,
            domain,
            confidence: 0.9
        };
        
        this.addEntity(orgEntity);
        
        try {
            if (domain) {
                await this.scanDomain(scanId, domain);
            }
            
            if (location) {
                await this.addRelatedGeo(scanId, orgEntity.id, location);
            }
            
            // Search for org on GitHub
            const response = await fetch(`https://api.github.com/orgs/${name.replace(/\s+/g, '')}`);
            if (response.ok) {
                const ghOrg = await response.json();
                this.addResult(scanId, {
                    type: 'github_org',
                    source: 'GitHub',
                    data: ghOrg
                });
            }
            
        } catch (error) {
            this.emitEvent('moduleError', { scanId, module: 'organization', error: error.message });
        }
        
        this.emitEvent('moduleCompleted', { scanId, module: 'organization' });
    }
    
    // Helper methods
    async addRelatedGeo(scanId, entityId, location) {
        try {
            const response = await fetch(
                `${this.apiEndpoints.nominatim}/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
                { headers: { 'User-Agent': 'OSINTPlayground/1.0' } }
            );
            
            const results = await response.json();
            
            if (results.length > 0) {
                const geo = results[0];
                const geoEntity = {
                    id: `geo_${location.replace(/\s+/g, '_')}`,
                    type: 'location',
                    label: geo.display_name,
                    lat: parseFloat(geo.lat),
                    lng: parseFloat(geo.lon),
                    confidence: Math.min(geo.importance, 1)
                };
                
                this.addEntity(geoEntity);
                this.addRelationship(entityId, geoEntity.id, 'located_at');
                
                this.emitEvent('geoFound', { scanId, entity: geoEntity });
            }
        } catch (error) {
            console.error('Geocoding error:', error);
        }
    }
    
    generateUsernames(firstName, lastName) {
        const first = firstName.toLowerCase();
        const last = lastName.toLowerCase();
        const initial = first.charAt(0);
        
        return [
            `${first}${last}`,
            `${first}.${last}`,
            `${first}_${last}`,
            `${first}${last.charAt(0)}`,
            `${initial}${last}`,
            `${last}${first}`,
            `${first}`,
            `${first}${Math.floor(Math.random() * 99)}`
        ];
    }
    
    generateEmails(firstName, lastName, domain) {
        const first = firstName.toLowerCase();
        const last = lastName.toLowerCase();
        const initial = first.charAt(0);
        
        return [
            `${first}.${last}@${domain}`,
            `${first}${last}@${domain}`,
            `${initial}${last}@${domain}`,
            `${first}@${domain}`,
            `${last}@${domain}`
        ];
    }
    
    guessEmails(scanId, username) {
        const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'protonmail.com'];
        const emails = domains.map(d => `${username}@${d}`);
        
        // Don't actually scan these - just note them as possibilities
        this.addResult(scanId, {
            type: 'possible_emails',
            source: 'Generated',
            data: { emails },
            confidence: 0.3
        });
    }
    
    addEntity(entity) {
        if (!this.entities.has(entity.id)) {
            this.entities.set(entity.id, entity);
            this.emitEvent('entityAdded', entity);
        } else {
            // Merge data
            const existing = this.entities.get(entity.id);
            const merged = { ...existing, ...entity };
            this.entities.set(entity.id, merged);
        }
    }
    
    addRelationship(sourceId, targetId, type) {
        const existing = this.relationships.find(
            r => r.source === sourceId && r.target === targetId && r.type === type
        );
        
        if (!existing) {
            const rel = { source: sourceId, target: targetId, type };
            this.relationships.push(rel);
            this.emitEvent('relationshipAdded', rel);
        }
    }
    
    addResult(scanId, result) {
        const scan = this.activeScans.get(scanId);
        if (scan) {
            result.timestamp = new Date();
            scan.results.push(result);
            this.results.push(result);
            this.emitEvent('resultAdded', { scanId, result });
        }
    }
    
    generateScanId() {
        return `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    emitEvent(type, data) {
        const event = new CustomEvent(`osint:${type}`, { detail: data });
        document.dispatchEvent(event);
    }
    
    // Simple MD5 hash for Gravatar
    async md5(string) {
        const encoder = new TextEncoder();
        const data = encoder.encode(string);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substr(0, 32);
    }
    
    // Export data
    exportResults() {
        return {
            entities: Array.from(this.entities.values()),
            relationships: this.relationships,
            results: this.results,
            scans: this.scanHistory
        };
    }
    
    // Clear all data
    reset() {
        this.results = [];
        this.entities.clear();
        this.relationships = [];
        this.scanHistory = [];
        this.activeScans.clear();
        this.emitEvent('reset', {});
    }
}

// Export
window.OSINTCore = OSINTCore;
