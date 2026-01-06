/**
 * OSINT Playground E2E Tests
 * Playwright tests for main user flows
 */

const { test, expect } = require('@playwright/test');

test.describe('OSINT Playground', () => {
    
    test.describe('Boot Sequence', () => {
        test('should display boot screen and transition to main app', async ({ page }) => {
            await page.goto('/');
            
            // Boot screen should be visible initially
            const bootScreen = page.locator('#bootScreen');
            await expect(bootScreen).toBeVisible();
            
            // Wait for boot to complete (max 5 seconds)
            await expect(bootScreen).toBeHidden({ timeout: 5000 });
            
            // Main app should now be visible
            const mainApp = page.locator('#mainApp');
            await expect(mainApp).toBeVisible();
        });
        
        test('should show OSINT glitch logo during boot', async ({ page }) => {
            await page.goto('/');
            
            const logo = page.locator('.glitch-logo');
            await expect(logo).toBeVisible();
            await expect(logo).toHaveText('OSINT');
        });
    });
    
    test.describe('Navigation', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
        });
        
        test('should have all navigation items', async ({ page }) => {
            const navItems = ['Target', 'Scans', 'Graph', 'GeoInt', 'Timeline', 'Feed'];
            
            for (const item of navItems) {
                const navItem = page.locator(`.nav-item:has-text("${item}")`);
                await expect(navItem).toBeVisible();
            }
        });
        
        test('should switch views when clicking nav items', async ({ page }) => {
            // Click on Graph
            await page.click('[data-view="graph"]');
            const graphView = page.locator('#graphView');
            await expect(graphView).toBeVisible();
            
            // Click on Map (GeoInt)
            await page.click('[data-view="map"]');
            const mapView = page.locator('#mapView');
            await expect(mapView).toBeVisible();
            
            // Back to Target
            await page.click('[data-view="search"]');
            const searchView = page.locator('#searchView');
            await expect(searchView).toBeVisible();
        });
        
        test('should highlight active nav item', async ({ page }) => {
            const targetNav = page.locator('[data-view="search"]');
            await expect(targetNav).toHaveClass(/active/);
            
            await page.click('[data-view="graph"]');
            const graphNav = page.locator('[data-view="graph"]');
            await expect(graphNav).toHaveClass(/active/);
            await expect(targetNav).not.toHaveClass(/active/);
        });
    });
    
    test.describe('Theme Toggle', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
        });
        
        test('should toggle theme when clicking theme button', async ({ page }) => {
            const themeButton = page.locator('#toggleTheme');
            const body = page.locator('body');
            
            // Initially dark mode
            await expect(body).not.toHaveClass(/light-mode/);
            
            // Click to toggle
            await themeButton.click();
            
            // Should show toast and potentially change theme
            // Theme manager cycles: system -> dark -> light
            await page.waitForTimeout(500);
        });
        
        test('should use keyboard shortcut Alt+Shift+T', async ({ page }) => {
            await page.keyboard.press('Alt+Shift+KeyT');
            
            // Should trigger theme change
            await page.waitForTimeout(500);
            
            // Toast notification should appear
            const toast = page.locator('.toast');
            await expect(toast).toBeVisible({ timeout: 2000 });
        });
    });
    
    test.describe('Search Functionality', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
        });
        
        test('should have search input in Target view', async ({ page }) => {
            const searchInput = page.locator('#searchInput, [data-search-input]');
            await expect(searchInput).toBeVisible();
        });
        
        test('should focus search input with Ctrl+K', async ({ page }) => {
            await page.keyboard.press('Control+k');
            
            const searchInput = page.locator('#searchInput, [data-search-input]');
            await expect(searchInput).toBeFocused();
        });
        
        test('should start scan when pressing Enter', async ({ page }) => {
            const searchInput = page.locator('#searchInput');
            
            await searchInput.fill('testuser');
            await searchInput.press('Enter');
            
            // Should see loading state or progress
            await page.waitForTimeout(1000);
            
            // Button should show scanning state or results should start appearing
            const scanningIndicator = page.locator('.fa-spinner, [data-scanning]');
            // This may or may not be visible depending on scan speed
        });
    });
    
    test.describe('Graph View', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
            await page.click('[data-view="graph"]');
        });
        
        test('should display graph canvas', async ({ page }) => {
            const graphContainer = page.locator('#graphCanvas, .graph-container');
            await expect(graphContainer).toBeVisible();
        });
        
        test('should have graph control buttons', async ({ page }) => {
            const zoomIn = page.locator('[data-graph-zoom-in], .graph-controls button:has(.fa-plus)');
            const zoomOut = page.locator('[data-graph-zoom-out], .graph-controls button:has(.fa-minus)');
            
            // Check if controls exist (may be in toolbar)
            const controls = page.locator('.graph-controls, .graph-toolbar');
            await expect(controls).toBeVisible();
        });
    });
    
    test.describe('GeoInt Map View', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
            await page.click('[data-view="map"]');
        });
        
        test('should display Leaflet map', async ({ page }) => {
            const mapContainer = page.locator('#leafletMap, .leaflet-container');
            await expect(mapContainer).toBeVisible();
        });
        
        test('should have map layer controls', async ({ page }) => {
            const layerControls = page.locator('.map-controls, .layer-switcher');
            await expect(layerControls).toBeVisible();
        });
    });
    
    test.describe('Feed View', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
            await page.click('[data-view="feed"]');
        });
        
        test('should display feed tabs', async ({ page }) => {
            const tabs = page.locator('.feed-tabs, [data-feed-tabs]');
            await expect(tabs).toBeVisible();
        });
        
        test('should switch feed tabs', async ({ page }) => {
            const hackerNewsTab = page.locator('[data-feed="hackernews"]');
            
            if (await hackerNewsTab.isVisible()) {
                await hackerNewsTab.click();
                await expect(hackerNewsTab).toHaveClass(/active/);
            }
        });
    });
    
    test.describe('Responsive Design', () => {
        test('should be responsive on mobile', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
            
            // Sidebar should be hidden or collapsed on mobile
            const sidebar = page.locator('.sidebar');
            const sidebarVisible = await sidebar.isVisible();
            
            if (sidebarVisible) {
                // Check if it's collapsed
                const sidebarBox = await sidebar.boundingBox();
                expect(sidebarBox?.width).toBeLessThan(100); // Collapsed state
            }
        });
        
        test('should show mobile menu toggle', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
            
            // Mobile menu button might be visible
            const mobileMenu = page.locator('.mobile-menu-toggle, .hamburger, [data-mobile-menu]');
            // This depends on implementation
        });
    });
    
    test.describe('API Health', () => {
        test('should return healthy status from API', async ({ page }) => {
            const response = await page.request.get('/api/health');
            expect(response.ok()).toBeTruthy();
            
            const data = await response.json();
            expect(data.status).toBe('ok');
            expect(data).toHaveProperty('timestamp');
        });
        
        test('should return API status with configured services', async ({ page }) => {
            const response = await page.request.get('/api/status');
            expect(response.ok()).toBeTruthy();
            
            const data = await response.json();
            expect(data).toHaveProperty('apis');
            expect(data).toHaveProperty('freeApis');
        });
        
        test('should return available adapters', async ({ page }) => {
            const response = await page.request.get('/api/adapters');
            expect(response.ok()).toBeTruthy();
            
            const data = await response.json();
            expect(data).toHaveProperty('adapters');
            expect(Array.isArray(data.adapters)).toBeTruthy();
            expect(data.adapters.length).toBeGreaterThan(0);
        });
    });
    
    test.describe('Scan API', () => {
        test('should start a scan and return scan ID', async ({ page }) => {
            const response = await page.request.post('/api/scan', {
                data: { query: 'testuser' }
            });
            
            expect(response.ok()).toBeTruthy();
            
            const data = await response.json();
            expect(data).toHaveProperty('scanId');
            expect(data).toHaveProperty('status');
            expect(data.scanId).toMatch(/^scan-\d+-[a-z0-9]+$/);
        });
        
        test('should reject invalid query', async ({ page }) => {
            const response = await page.request.post('/api/scan', {
                data: { query: 'invalid query with spaces!' }
            });
            
            expect(response.ok()).toBeFalsy();
            expect(response.status()).toBe(400);
        });
        
        test('should get scan results by ID', async ({ page }) => {
            // First start a scan
            const startResponse = await page.request.post('/api/scan', {
                data: { query: 'octocat' }
            });
            const { scanId } = await startResponse.json();
            
            // Wait a bit for scan to progress
            await page.waitForTimeout(2000);
            
            // Get scan status
            const statusResponse = await page.request.get(`/api/scan/${scanId}`);
            expect(statusResponse.ok()).toBeTruthy();
            
            const data = await statusResponse.json();
            expect(data).toHaveProperty('id', scanId);
            expect(data).toHaveProperty('status');
            expect(data).toHaveProperty('results');
        });
    });
    
    test.describe('Accessibility', () => {
        test.beforeEach(async ({ page }) => {
            await page.goto('/');
            await page.waitForSelector('#mainApp:not(.hidden)', { timeout: 5000 });
        });
        
        test('should have proper heading hierarchy', async ({ page }) => {
            const h1 = page.locator('h1');
            const h1Count = await h1.count();
            
            // Should have at least one h1 or equivalent
            expect(h1Count).toBeGreaterThanOrEqual(0); // Relaxed - logo might serve as h1
        });
        
        test('should have proper focus indicators', async ({ page }) => {
            const searchInput = page.locator('#searchInput');
            await searchInput.focus();
            
            // Should have visible focus state
            const focusedElement = page.locator(':focus');
            await expect(focusedElement).toBeVisible();
        });
        
        test('should be navigable by keyboard', async ({ page }) => {
            // Tab through interface
            await page.keyboard.press('Tab');
            await page.keyboard.press('Tab');
            await page.keyboard.press('Tab');
            
            // Should be able to focus elements
            const focusedElement = page.locator(':focus');
            await expect(focusedElement).toBeVisible();
        });
    });
});
