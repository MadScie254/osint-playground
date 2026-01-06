/**
 * OSINT Playground - Theme Manager
 * Comprehensive theme system with system preference detection,
 * localStorage persistence, keyboard shortcuts, and accessibility
 */

class ThemeManager {
    static STORAGE_KEY = 'osint-theme-preference';
    static THEMES = ['system', 'dark', 'light'];
    static KEYBOARD_SHORTCUT = 'KeyT'; // Alt+Shift+T
    
    constructor() {
        this.currentTheme = 'system';
        this.resolvedTheme = 'dark';
        this.listeners = new Set();
        this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        this.init();
    }
    
    init() {
        // Load saved preference
        this.loadTheme();
        
        // Apply theme immediately
        this.applyTheme(false);
        
        // Listen for system preference changes
        this.mediaQuery.addEventListener('change', (e) => {
            if (this.currentTheme === 'system') {
                this.resolvedTheme = e.matches ? 'dark' : 'light';
                this.applyTheme(true);
                this.notifyListeners();
            }
        });
        
        // Setup keyboard shortcut (Alt+Shift+T)
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.shiftKey && e.code === ThemeManager.KEYBOARD_SHORTCUT) {
                e.preventDefault();
                this.cycleTheme();
            }
        });
        
        // Expose globally
        window.themeManager = this;
        
        console.log(`[ThemeManager] Initialized: ${this.currentTheme} → ${this.resolvedTheme}`);
    }
    
    loadTheme() {
        try {
            const saved = localStorage.getItem(ThemeManager.STORAGE_KEY);
            if (saved && ThemeManager.THEMES.includes(saved)) {
                this.currentTheme = saved;
            }
        } catch (e) {
            console.warn('[ThemeManager] Could not load theme from localStorage:', e);
        }
        
        this.resolveTheme();
    }
    
    resolveTheme() {
        if (this.currentTheme === 'system') {
            this.resolvedTheme = this.mediaQuery.matches ? 'dark' : 'light';
        } else {
            this.resolvedTheme = this.currentTheme;
        }
    }
    
    saveTheme() {
        try {
            localStorage.setItem(ThemeManager.STORAGE_KEY, this.currentTheme);
        } catch (e) {
            console.warn('[ThemeManager] Could not save theme to localStorage:', e);
        }
    }
    
    applyTheme(animate = true) {
        const root = document.documentElement;
        const body = document.body;
        
        // Add transition class for smooth theme switching
        if (animate) {
            root.classList.add('theme-transition');
            body.classList.add('theme-transition');
            
            setTimeout(() => {
                root.classList.remove('theme-transition');
                body.classList.remove('theme-transition');
            }, 300);
        }
        
        // Remove existing theme classes
        root.classList.remove('dark-mode', 'light-mode');
        body.classList.remove('dark-mode', 'light-mode');
        
        // Apply resolved theme
        const themeClass = `${this.resolvedTheme}-mode`;
        root.classList.add(themeClass);
        body.classList.add(themeClass);
        
        // Set data attribute
        root.setAttribute('data-theme', this.resolvedTheme);
        
        // Update meta theme-color for mobile browsers
        this.updateMetaThemeColor();
        
        // Update any theme toggle buttons
        this.updateToggleButtons();
        
        // Dispatch custom event
        document.dispatchEvent(new CustomEvent('themechange', {
            detail: {
                theme: this.currentTheme,
                resolved: this.resolvedTheme
            }
        }));
    }
    
    updateMetaThemeColor() {
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        
        meta.content = this.resolvedTheme === 'dark' ? '#0a0a0f' : '#ffffff';
    }
    
    updateToggleButtons() {
        const buttons = document.querySelectorAll('[data-theme-toggle]');
        buttons.forEach(btn => {
            const icon = btn.querySelector('i, svg, .icon');
            if (icon) {
                // Update icon based on current theme
                if (icon.classList.contains('fa-moon') || icon.classList.contains('fa-sun')) {
                    icon.classList.remove('fa-moon', 'fa-sun');
                    icon.classList.add(this.resolvedTheme === 'dark' ? 'fa-moon' : 'fa-sun');
                }
            }
            
            // Update aria-label
            btn.setAttribute('aria-label', `Current theme: ${this.currentTheme}. Click to change.`);
            btn.setAttribute('aria-pressed', this.resolvedTheme === 'light');
        });
        
        // Update theme select dropdowns
        const selects = document.querySelectorAll('[data-theme-select]');
        selects.forEach(select => {
            select.value = this.currentTheme;
        });
    }
    
    setTheme(theme) {
        if (!ThemeManager.THEMES.includes(theme)) {
            console.warn(`[ThemeManager] Invalid theme: ${theme}`);
            return;
        }
        
        this.currentTheme = theme;
        this.resolveTheme();
        this.saveTheme();
        this.applyTheme(true);
        this.notifyListeners();
        
        // Show toast notification
        if (window.darknetUI?.showToast) {
            const themeNames = { system: 'System', dark: 'Dark', light: 'Light' };
            window.darknetUI.showToast(
                `Theme: ${themeNames[theme]}${theme === 'system' ? ` (${this.resolvedTheme})` : ''}`,
                'info',
                2000
            );
        }
    }
    
    cycleTheme() {
        const currentIndex = ThemeManager.THEMES.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % ThemeManager.THEMES.length;
        this.setTheme(ThemeManager.THEMES[nextIndex]);
    }
    
    toggleDarkLight() {
        // Direct toggle between dark and light (ignoring system)
        this.setTheme(this.resolvedTheme === 'dark' ? 'light' : 'dark');
    }
    
    // Subscribe to theme changes
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
    
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback({
                    theme: this.currentTheme,
                    resolved: this.resolvedTheme
                });
            } catch (e) {
                console.error('[ThemeManager] Listener error:', e);
            }
        });
    }
    
    // Get current theme info
    getTheme() {
        return {
            preference: this.currentTheme,
            resolved: this.resolvedTheme,
            isDark: this.resolvedTheme === 'dark',
            isLight: this.resolvedTheme === 'light',
            isSystem: this.currentTheme === 'system'
        };
    }
    
    // Get CSS variable value
    getCSSVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    
    // Set custom CSS variable
    setCSSVar(name, value) {
        document.documentElement.style.setProperty(name, value);
    }
}

// ==========================================
// ICON ADAPTER UTILITIES
// ==========================================

const IconUtils = {
    /**
     * Convert FontAwesome icon to inline SVG
     * Makes icons truly theme-aware with currentColor
     */
    faToSVG: {
        // Common icons as SVG paths
        'fa-moon': `<svg viewBox="0 0 512 512" fill="currentColor"><path d="M283.2 512c78.9 0 150.6-35 199-91.4 11.8-13.8 5.8-35.4-11.7-42.1-61.6-23.6-105.5-82.5-105.5-151.3 0-68.8 43.9-127.7 105.5-151.3 17.5-6.7 23.5-28.3 11.7-42.1C434 -21.5 362.1-56 283.2-56c-141.4 0-256 114.6-256 256s114.6 256 256 256z"/></svg>`,
        'fa-sun': `<svg viewBox="0 0 512 512" fill="currentColor"><path d="M256 160c-52.9 0-96 43.1-96 96s43.1 96 96 96 96-43.1 96-96-43.1-96-96-96zm246.4 80.5l-94.7-47.3 33.5-100.4c4.5-13.6-8.4-26.5-21.9-21.9l-100.4 33.5-47.4-94.8c-6.4-12.8-24.6-12.8-31 0l-47.3 94.7L92.7 70.8c-13.6-4.5-26.5 8.4-21.9 21.9l33.5 100.4-94.7 47.4c-12.8 6.4-12.8 24.6 0 31l94.7 47.3-33.5 100.5c-4.5 13.6 8.4 26.5 21.9 21.9l100.4-33.5 47.3 94.7c6.4 12.8 24.6 12.8 31 0l47.3-94.7 100.4 33.5c13.6 4.5 26.5-8.4 21.9-21.9l-33.5-100.4 94.7-47.3c13-6.5 13-24.7.1-31.1z"/></svg>`,
        'fa-search': `<svg viewBox="0 0 512 512" fill="currentColor"><path d="M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z"/></svg>`,
        'fa-check': `<svg viewBox="0 0 512 512" fill="currentColor"><path d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"/></svg>`,
        'fa-times': `<svg viewBox="0 0 352 512" fill="currentColor"><path d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"/></svg>`
    },
    
    /**
     * Create theme-aware SVG icon element
     */
    createIcon(name, options = {}) {
        const {
            size = '1em',
            className = '',
            ariaLabel = '',
            strokeWidth = null
        } = options;
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', `icon icon-${name} ${className}`.trim());
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('fill', 'currentColor');
        svg.setAttribute('aria-hidden', ariaLabel ? 'false' : 'true');
        
        if (ariaLabel) {
            svg.setAttribute('aria-label', ariaLabel);
            svg.setAttribute('role', 'img');
        }
        
        if (strokeWidth) {
            svg.setAttribute('stroke-width', strokeWidth);
        }
        
        return svg;
    },
    
    /**
     * Apply adaptive filter to PNG images
     */
    adaptPNGIcon(imgElement) {
        imgElement.classList.add('icon-png-adaptive');
        imgElement.style.filter = 'var(--icon-filter)';
    }
};

// ==========================================
// THEME-AWARE COMPONENT BASE
// ==========================================

class ThemeAwareComponent {
    constructor(element) {
        this.element = element;
        this.unsubscribe = null;
        
        if (window.themeManager) {
            this.onThemeChange(window.themeManager.getTheme());
            this.unsubscribe = window.themeManager.subscribe(
                (theme) => this.onThemeChange(theme)
            );
        }
    }
    
    onThemeChange(theme) {
        // Override in subclass
    }
    
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}

// ==========================================
// AUTO-INITIALIZE
// ==========================================

// Initialize theme manager when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.themeManager = new ThemeManager();
    });
} else {
    window.themeManager = new ThemeManager();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ThemeManager, IconUtils, ThemeAwareComponent };
}
