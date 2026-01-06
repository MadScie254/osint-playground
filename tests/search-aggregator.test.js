/**
 * Search Aggregator Integration Tests
 */

const { 
    SearchAggregator, 
    BaseAdapter, 
    GitHubAdapter,
    AGGREGATOR_CONFIG 
} = require('../lib/search-aggregator');

// Mock axios
jest.mock('axios');
const axios = require('axios');

describe('SearchAggregator', () => {
    let aggregator;
    
    beforeEach(() => {
        aggregator = new SearchAggregator({ enableCache: false });
        jest.clearAllMocks();
    });
    
    describe('initialization', () => {
        test('should initialize with default adapters', () => {
            const adapters = aggregator.getAdapters();
            expect(adapters.length).toBeGreaterThan(0);
            expect(adapters.map(a => a.name)).toContain('github');
            expect(adapters.map(a => a.name)).toContain('reddit');
        });
        
        test('should allow registering custom adapters', () => {
            class CustomAdapter extends BaseAdapter {
                constructor() {
                    super('custom', { priority: 1 });
                }
                async search() { return []; }
            }
            
            aggregator.registerAdapter(new CustomAdapter());
            const adapters = aggregator.getAdapters();
            expect(adapters.map(a => a.name)).toContain('custom');
        });
    });
    
    describe('startScan', () => {
        test('should return scan object with id and status', async () => {
            axios.get.mockResolvedValue({ status: 404 });
            
            const scan = await aggregator.startScan('testuser');
            
            expect(scan).toHaveProperty('id');
            expect(scan).toHaveProperty('status');
            expect(scan).toHaveProperty('query', 'testuser');
            expect(scan.id).toMatch(/^scan-\d+-[a-z0-9]+$/);
        });
        
        test('should emit progress events', (done) => {
            axios.get.mockResolvedValue({ status: 404 });
            
            aggregator.on('scan:progress', (data) => {
                expect(data).toHaveProperty('scanId');
                expect(data).toHaveProperty('progress');
                done();
            });
            
            aggregator.startScan('testuser');
        });
        
        test('should emit complete event when done', (done) => {
            axios.get.mockResolvedValue({ status: 404 });
            
            aggregator.on('scan:complete', (scan) => {
                expect(scan.status).toBe('completed');
                expect(scan.progress).toBe(100);
                done();
            });
            
            aggregator.startScan('testuser');
        });
    });
    
    describe('getScan', () => {
        test('should return null for unknown scan id', () => {
            expect(aggregator.getScan('unknown-id')).toBeNull();
        });
        
        test('should return scan object for valid id', async () => {
            axios.get.mockResolvedValue({ status: 404 });
            
            const scan = await aggregator.startScan('testuser');
            const retrieved = aggregator.getScan(scan.id);
            
            expect(retrieved).not.toBeNull();
            expect(retrieved.id).toBe(scan.id);
        });
    });
    
    describe('deduplication', () => {
        test('should deduplicate results with same URL', async () => {
            // Create mock adapter that returns duplicates
            class DupeAdapter extends BaseAdapter {
                constructor() {
                    super('dupe', { priority: 1 });
                }
                async search() {
                    return [
                        { id: '1', url: 'https://example.com/user', confidence: 0.8 },
                        { id: '2', url: 'https://example.com/user', confidence: 0.6 }
                    ];
                }
            }
            
            const testAggregator = new SearchAggregator({ enableCache: false });
            
            // Clear default adapters and add only test adapter
            testAggregator.adapters.clear();
            testAggregator.registerAdapter(new DupeAdapter());
            
            await new Promise((resolve) => {
                testAggregator.on('scan:complete', (scan) => {
                    // Should keep the one with higher confidence
                    expect(scan.results.length).toBe(1);
                    expect(scan.results[0].confidence).toBe(0.8);
                    resolve();
                });
                
                testAggregator.startScan('testuser');
            });
        });
    });
    
    describe('confidence scoring', () => {
        test('should boost verified results', async () => {
            class VerifiedAdapter extends BaseAdapter {
                constructor() {
                    super('verified', { priority: 1 });
                }
                async search() {
                    return [
                        { id: '1', confidence: 0.5, verified: true, username: 'testuser' },
                        { id: '2', confidence: 0.5, verified: false, username: 'other' }
                    ];
                }
            }
            
            const testAggregator = new SearchAggregator({ enableCache: false });
            testAggregator.adapters.clear();
            testAggregator.registerAdapter(new VerifiedAdapter());
            
            await new Promise((resolve) => {
                testAggregator.on('scan:complete', (scan) => {
                    const verified = scan.results.find(r => r.verified);
                    const unverified = scan.results.find(r => !r.verified);
                    
                    expect(verified.confidence).toBeGreaterThan(unverified.confidence);
                    resolve();
                });
                
                testAggregator.startScan('testuser');
            });
        });
        
        test('should assign confidence levels correctly', async () => {
            class LevelAdapter extends BaseAdapter {
                constructor() {
                    super('levels', { priority: 1 });
                }
                async search() {
                    return [
                        { id: '1', confidence: 0.9 },
                        { id: '2', confidence: 0.6 },
                        { id: '3', confidence: 0.3 }
                    ];
                }
            }
            
            const testAggregator = new SearchAggregator({ enableCache: false });
            testAggregator.adapters.clear();
            testAggregator.registerAdapter(new LevelAdapter());
            
            await new Promise((resolve) => {
                testAggregator.on('scan:complete', (scan) => {
                    expect(scan.results[0].confidenceLevel).toBe('high');
                    expect(scan.results[1].confidenceLevel).toBe('medium');
                    expect(scan.results[2].confidenceLevel).toBe('low');
                    resolve();
                });
                
                testAggregator.startScan('testuser');
            });
        });
    });
});

describe('GitHubAdapter', () => {
    let adapter;
    
    beforeEach(() => {
        adapter = new GitHubAdapter();
        jest.clearAllMocks();
    });
    
    test('should return profile for existing user', async () => {
        axios.get.mockImplementation((url) => {
            if (url.includes('/users/octocat')) {
                return Promise.resolve({
                    status: 200,
                    data: {
                        login: 'octocat',
                        name: 'The Octocat',
                        bio: 'A cat that codes',
                        avatar_url: 'https://avatars.githubusercontent.com/u/583231',
                        html_url: 'https://github.com/octocat',
                        followers: 1000,
                        public_repos: 50
                    }
                });
            }
            if (url.includes('/repos')) {
                return Promise.resolve({ data: [] });
            }
            return Promise.resolve({ status: 404 });
        });
        
        const results = await adapter.search('octocat');
        
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].username).toBe('octocat');
        expect(results[0].displayName).toBe('The Octocat');
        expect(results[0].verified).toBe(true);
    });
    
    test('should return empty for non-existent user', async () => {
        axios.get.mockResolvedValue({ status: 404 });
        
        const results = await adapter.search('nonexistent_user_12345');
        expect(results).toEqual([]);
    });
    
    test('should handle API errors gracefully', async () => {
        axios.get.mockRejectedValue(new Error('Network error'));
        
        const results = await adapter.search('testuser');
        expect(results).toEqual([]);
    });
});

describe('BaseAdapter', () => {
    test('should enforce search implementation', async () => {
        const adapter = new BaseAdapter('test');
        await expect(adapter.search('query')).rejects.toThrow('search() must be implemented');
    });
    
    test('should generate unique result ids', () => {
        const adapter = new BaseAdapter('test');
        const result1 = adapter.normalizeResult({}, 'profile');
        const result2 = adapter.normalizeResult({}, 'profile');
        
        expect(result1.id).not.toBe(result2.id);
        expect(result1.id).toMatch(/^test-\d+-[a-z0-9]+$/);
    });
    
    test('should include source and timestamp in normalized results', () => {
        const adapter = new BaseAdapter('test');
        const result = adapter.normalizeResult({ foo: 'bar' }, 'profile');
        
        expect(result.source).toBe('test');
        expect(result.type).toBe('profile');
        expect(result.timestamp).toBeDefined();
        expect(result.raw).toEqual({ foo: 'bar' });
    });
});

describe('AGGREGATOR_CONFIG', () => {
    test('should have required config values', () => {
        expect(AGGREGATOR_CONFIG).toHaveProperty('defaultTimeout');
        expect(AGGREGATOR_CONFIG).toHaveProperty('maxConcurrentJobs');
        expect(AGGREGATOR_CONFIG).toHaveProperty('maxRetries');
        expect(AGGREGATOR_CONFIG).toHaveProperty('cacheTTL');
    });
    
    test('should have reasonable timeout values', () => {
        expect(AGGREGATOR_CONFIG.defaultTimeout).toBeGreaterThan(5000);
        expect(AGGREGATOR_CONFIG.totalTimeout).toBeGreaterThan(AGGREGATOR_CONFIG.defaultTimeout);
    });
});
