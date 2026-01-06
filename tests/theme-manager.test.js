/**
 * Theme Manager Unit Tests
 */

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: jest.fn(key => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = value; }),
        removeItem: jest.fn(key => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; })
    };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock matchMedia
const matchMediaMock = jest.fn().mockImplementation(query => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
}));

Object.defineProperty(window, 'matchMedia', { value: matchMediaMock });

// Import or define ThemeManager for testing
class ThemeManager {
    static STORAGE_KEY = 'osint-theme-preference';
    static THEMES = ['system', 'dark', 'light'];
    
    constructor() {
        this.theme = 'system';
        this.listeners = [];
        this.loadTheme();
    }
    
    loadTheme() {
        const stored = localStorage.getItem(ThemeManager.STORAGE_KEY);
        if (stored && ThemeManager.THEMES.includes(stored)) {
            this.theme = stored;
        }
    }
    
    saveTheme() {
        localStorage.setItem(ThemeManager.STORAGE_KEY, this.theme);
    }
    
    setTheme(theme) {
        if (!ThemeManager.THEMES.includes(theme)) {
            throw new Error(`Invalid theme: ${theme}`);
        }
        this.theme = theme;
        this.saveTheme();
        this.notify();
    }
    
    getCurrentTheme() {
        return this.theme;
    }
    
    getEffectiveTheme() {
        if (this.theme === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return this.theme;
    }
    
    cycleTheme() {
        const currentIndex = ThemeManager.THEMES.indexOf(this.theme);
        const nextIndex = (currentIndex + 1) % ThemeManager.THEMES.length;
        this.setTheme(ThemeManager.THEMES[nextIndex]);
    }
    
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }
    
    notify() {
        this.listeners.forEach(listener => listener(this.theme));
    }
}

describe('ThemeManager', () => {
    let themeManager;
    
    beforeEach(() => {
        localStorageMock.clear();
        themeManager = new ThemeManager();
    });
    
    describe('initialization', () => {
        test('should initialize with system theme by default', () => {
            expect(themeManager.getCurrentTheme()).toBe('system');
        });
        
        test('should load saved theme from localStorage', () => {
            localStorage.setItem(ThemeManager.STORAGE_KEY, 'dark');
            const manager = new ThemeManager();
            expect(manager.getCurrentTheme()).toBe('dark');
        });
        
        test('should ignore invalid saved theme', () => {
            localStorage.setItem(ThemeManager.STORAGE_KEY, 'invalid');
            const manager = new ThemeManager();
            expect(manager.getCurrentTheme()).toBe('system');
        });
    });
    
    describe('setTheme', () => {
        test('should set valid theme', () => {
            themeManager.setTheme('light');
            expect(themeManager.getCurrentTheme()).toBe('light');
        });
        
        test('should save theme to localStorage', () => {
            themeManager.setTheme('dark');
            expect(localStorage.setItem).toHaveBeenCalledWith(ThemeManager.STORAGE_KEY, 'dark');
        });
        
        test('should throw error for invalid theme', () => {
            expect(() => themeManager.setTheme('invalid')).toThrow('Invalid theme: invalid');
        });
        
        test('should notify subscribers on theme change', () => {
            const callback = jest.fn();
            themeManager.subscribe(callback);
            themeManager.setTheme('light');
            expect(callback).toHaveBeenCalledWith('light');
        });
    });
    
    describe('getEffectiveTheme', () => {
        test('should return dark when system prefers dark', () => {
            matchMediaMock.mockImplementation(query => ({
                matches: query.includes('dark'),
                media: query,
                addEventListener: jest.fn(),
                removeEventListener: jest.fn()
            }));
            
            themeManager.setTheme('system');
            expect(themeManager.getEffectiveTheme()).toBe('dark');
        });
        
        test('should return explicit theme when not system', () => {
            themeManager.setTheme('light');
            expect(themeManager.getEffectiveTheme()).toBe('light');
        });
    });
    
    describe('cycleTheme', () => {
        test('should cycle through themes in order', () => {
            expect(themeManager.getCurrentTheme()).toBe('system');
            
            themeManager.cycleTheme();
            expect(themeManager.getCurrentTheme()).toBe('dark');
            
            themeManager.cycleTheme();
            expect(themeManager.getCurrentTheme()).toBe('light');
            
            themeManager.cycleTheme();
            expect(themeManager.getCurrentTheme()).toBe('system');
        });
    });
    
    describe('subscribe', () => {
        test('should allow subscribing to theme changes', () => {
            const callback = jest.fn();
            themeManager.subscribe(callback);
            
            themeManager.setTheme('dark');
            expect(callback).toHaveBeenCalledTimes(1);
            
            themeManager.setTheme('light');
            expect(callback).toHaveBeenCalledTimes(2);
        });
        
        test('should return unsubscribe function', () => {
            const callback = jest.fn();
            const unsubscribe = themeManager.subscribe(callback);
            
            themeManager.setTheme('dark');
            expect(callback).toHaveBeenCalledTimes(1);
            
            unsubscribe();
            
            themeManager.setTheme('light');
            expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
        });
    });
});

describe('ThemeManager.THEMES', () => {
    test('should contain system, dark, and light', () => {
        expect(ThemeManager.THEMES).toEqual(['system', 'dark', 'light']);
    });
});
