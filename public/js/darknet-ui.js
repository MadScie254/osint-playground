/**
 * OSINT Playground - Darknet UI Controller
 * Manages all UI interactions, view switching, and animations
 */

class DarknetUI {
    constructor() {
        this.currentView = 'searchView';
        this.graph = null;
        this.map = null;
        this.osint = null;
        this.resultsPanel = null;
        this.intelStream = [];
        
        this.init();
    }
    
    init() {
        // Wait for DOM - use multiple fallbacks
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }
    
    setup() {
        console.log('[DarknetUI] Starting setup...');
        
        // Run boot sequence with guaranteed completion
        this.runBootSequence();
        
        // Setup all handlers immediately (they'll work once app is visible)
        try {
            this.setupNavigation();
            this.setupIntakeTabs();
            this.setupScanProfiles();
            this.setupSearchActions();
            this.setupResultsPanel();
            this.setupGlobalSearch();
            this.setupOSINTEvents();
            this.setupKeyboardShortcuts();
            this.setupHeaderActions(); // NEW: Setup theme, notifications, settings
            this.setupFeedTabs(); // Setup intel feed tabs
            this.setupPersonSearch(); // Setup person name search
            this.setupGraphControls(); // Setup graph controls
            this.setupMapControls(); // Setup map controls
            this.setupTimelineFilters(); // Setup timeline filters
            console.log('[DarknetUI] All handlers setup complete');
        } catch (err) {
            console.error('[DarknetUI] Setup error:', err);
        }
    }
    
    // ==========================================
    // 🎨 HEADER ACTIONS - Theme, Notifications, Settings
    // ==========================================
    setupHeaderActions() {
        // Theme toggle
        const themeBtn = document.getElementById('toggleTheme');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => this.toggleTheme());
        }
        
        // Notifications panel
        const notifBtn = document.getElementById('notifications');
        const notifPanel = document.getElementById('notificationsPanel');
        const closeNotifBtn = document.getElementById('closeNotifications');
        const clearAllBtn = document.getElementById('clearAllNotifs');
        
        if (notifBtn && notifPanel) {
            notifBtn.addEventListener('click', () => {
                notifPanel.classList.toggle('hidden');
                notifPanel.classList.toggle('visible');
                
                // Clear badge on open
                const badge = notifBtn.querySelector('.badge');
                if (badge && !notifPanel.classList.contains('hidden')) {
                    setTimeout(() => {
                        badge.textContent = '0';
                        badge.style.display = 'none';
                    }, 1000);
                }
            });
        }
        
        if (closeNotifBtn) {
            closeNotifBtn.addEventListener('click', () => {
                notifPanel?.classList.add('hidden');
                notifPanel?.classList.remove('visible');
            });
        }
        
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                const list = document.querySelector('.notifications-list');
                if (list) {
                    list.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>All caught up!</p></div>';
                }
                this.showToast('All notifications cleared', 'success');
            });
        }
        
        // Settings modal
        const settingsBtn = document.getElementById('settings');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettingsBtn = document.getElementById('closeSettings');
        const saveSettingsBtn = document.getElementById('saveSettings');
        const resetSettingsBtn = document.getElementById('resetSettings');
        
        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                settingsModal.classList.remove('hidden');
            });
        }
        
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => {
                settingsModal?.classList.add('hidden');
            });
        }
        
        // Close modal on overlay click
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    settingsModal.classList.add('hidden');
                }
            });
        }
        
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                this.saveSettings();
                settingsModal?.classList.add('hidden');
                this.showToast('Settings saved successfully!', 'success');
            });
        }
        
        if (resetSettingsBtn) {
            resetSettingsBtn.addEventListener('click', () => {
                this.resetSettings();
                this.showToast('Settings reset to defaults', 'info');
            });
        }
        
        // Color picker
        const colorBtns = document.querySelectorAll('.color-btn');
        colorBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                colorBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setAccentColor(btn.dataset.color);
            });
        });
        
        // Theme selector
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            themeSelect.addEventListener('change', () => {
                this.setTheme(themeSelect.value);
            });
        }
        
        // Close panels on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                notifPanel?.classList.add('hidden');
                notifPanel?.classList.remove('visible');
                settingsModal?.classList.add('hidden');
            }
        });
    }
    
    toggleTheme() {
        // Use ThemeManager if available
        if (window.themeManager) {
            window.themeManager.cycleTheme();
            const theme = window.themeManager.getCurrentTheme();
            const icon = document.querySelector('#toggleTheme i');
            
            if (theme === 'light') {
                icon.className = 'fas fa-sun';
            } else if (theme === 'system') {
                icon.className = 'fas fa-circle-half-stroke';
            } else {
                icon.className = 'fas fa-moon';
            }
            this.showToast(`Theme: ${theme}`, 'info');
        } else {
            // Fallback to legacy toggle
            const icon = document.querySelector('#toggleTheme i');
            document.body.classList.toggle('light-mode');
            
            if (document.body.classList.contains('light-mode')) {
                icon.className = 'fas fa-sun';
                this.showToast('Light mode enabled', 'info');
            } else {
                icon.className = 'fas fa-moon';
                this.showToast('Dark mode enabled', 'info');
            }
        }
    }
    
    setTheme(theme) {
        // Use ThemeManager if available
        if (window.themeManager) {
            window.themeManager.setTheme(theme);
        }
        document.body.classList.remove('light-mode', 'cyber-mode');
        if (theme === 'light') {
            document.body.classList.add('light-mode');
        } else if (theme === 'cyber') {
            document.body.classList.add('cyber-mode');
        }
        this.showToast(`Theme changed to ${theme}`, 'info');
    }
    
    setAccentColor(color) {
        const colors = {
            cyan: { primary: '#00fff5', secondary: '#00a8ff' },
            purple: { primary: '#bf00ff', secondary: '#8000ff' },
            green: { primary: '#39ff14', secondary: '#00ff88' },
            orange: { primary: '#ff6b00', secondary: '#ffaa00' },
            pink: { primary: '#ff00ff', secondary: '#ff6b9d' }
        };
        
        if (colors[color]) {
            document.documentElement.style.setProperty('--neon-cyan', colors[color].primary);
            document.documentElement.style.setProperty('--accent-secondary', colors[color].secondary);
        }
    }
    
    saveSettings() {
        const settings = {
            theme: document.getElementById('themeSelect')?.value,
            deepScan: document.getElementById('deepScanToggle')?.checked,
            autoExport: document.getElementById('autoExportToggle')?.checked,
            soundNotif: document.getElementById('soundToggle')?.checked
        };
        localStorage.setItem('osint_settings', JSON.stringify(settings));
    }
    
    resetSettings() {
        localStorage.removeItem('osint_settings');
        document.getElementById('themeSelect').value = 'dark';
        document.getElementById('deepScanToggle').checked = true;
        document.getElementById('autoExportToggle').checked = false;
        document.getElementById('soundToggle').checked = true;
        document.body.classList.remove('light-mode', 'cyber-mode');
    }
    
    // ==========================================
    // 🔥 TOAST NOTIFICATIONS
    // ==========================================
    showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${icons[type]}"></i></div>
            <div class="toast-content">
                <h4>${type.charAt(0).toUpperCase() + type.slice(1)}</h4>
                <p>${message}</p>
            </div>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;
        
        container.appendChild(toast);
        
        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('exit');
            setTimeout(() => toast.remove(), 300);
        });
        
        // Auto remove
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.add('exit');
                setTimeout(() => toast.remove(), 300);
            }
        }, duration);
    }
    
    // Add notification to panel
    addNotification(title, message, type = 'info') {
        const list = document.querySelector('.notifications-list');
        if (!list) return;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const colors = {
            success: 'green',
            error: 'red',
            warning: 'orange',
            info: 'cyan'
        };
        
        const item = document.createElement('div');
        item.className = 'notif-item unread';
        item.innerHTML = `
            <div class="notif-icon ${colors[type]}"><i class="fas ${icons[type]}"></i></div>
            <div class="notif-content">
                <h4>${title}</h4>
                <p>${message}</p>
                <span class="notif-time">Just now</span>
            </div>
        `;
        
        list.insertBefore(item, list.firstChild);
        
        // Update badge
        const badge = document.querySelector('#notifications .badge');
        if (badge) {
            const count = parseInt(badge.textContent) || 0;
            badge.textContent = count + 1;
            badge.style.display = 'flex';
        }
    }
    
    runBootSequence() {
        console.log('[DarknetUI] Running boot sequence...');
        
        const bootScreen = document.getElementById('bootScreen');
        const bootLog = document.getElementById('bootLog');
        const app = document.getElementById('mainApp');
        
        // Debug
        console.log('[DarknetUI] Elements found:', {
            bootScreen: !!bootScreen,
            bootLog: !!bootLog,
            app: !!app
        });
        
        // If elements not found, just show whatever we can
        if (!app) {
            console.error('[DarknetUI] mainApp not found!');
            return;
        }
        
        // If no boot screen, just show app directly
        if (!bootScreen) {
            console.log('[DarknetUI] No boot screen, showing app directly');
            app.classList.remove('hidden');
            this.initializeComponents();
            return;
        }
        
        const bootMessages = [
            '[SYS] Initializing OSINT Playground v2.0...',
            '[NET] Establishing secure connections...',
            '[API] Loading intelligence modules...',
            '[API] Shodan: ONLINE',
            '[API] Hunter.io: ONLINE', 
            '[API] GitHub: ONLINE',
            '[GEO] Nominatim geocoder: CONNECTED',
            '[VIZ] D3.js graph engine: LOADED',
            '[MAP] Leaflet GeoInt: LOADED',
            '[SYS] All systems operational.',
            '[SYS] Welcome, Operator.'
        ];
        
        // Force completion after 3 seconds no matter what
        const forceComplete = setTimeout(() => {
            console.log('[DarknetUI] Forcing boot completion');
            this.completeBoot(bootScreen, app);
        }, 3000);
        
        let index = 0;
        
        const addMessage = () => {
            if (index < bootMessages.length && bootLog) {
                const line = document.createElement('div');
                line.className = 'log-line';
                line.textContent = bootMessages[index];
                
                if (bootMessages[index].includes('ONLINE') || 
                    bootMessages[index].includes('LOADED') || 
                    bootMessages[index].includes('CONNECTED')) {
                    line.style.color = '#39ff14';
                } else if (bootMessages[index].includes('Welcome')) {
                    line.style.color = '#00fff5';
                }
                
                bootLog.appendChild(line);
                index++;
                setTimeout(addMessage, 120);
            } else {
                // Done with messages
                clearTimeout(forceComplete);
                setTimeout(() => this.completeBoot(bootScreen, app), 400);
            }
        };
        
        // Start message sequence
        setTimeout(addMessage, 200);
    }
    
    completeBoot(bootScreen, app) {
        console.log('[DarknetUI] Completing boot...');
        
        // Force hide boot screen immediately
        if (bootScreen) {
            bootScreen.style.opacity = '0';
            bootScreen.style.pointerEvents = 'none';
            bootScreen.classList.add('hidden');
        }
        
        // Show app immediately
        if (app) {
            app.classList.remove('hidden');
            app.style.display = 'grid';
        }
        
        // Then finish cleanup after transition
        setTimeout(() => {
            if (bootScreen) {
                bootScreen.style.display = 'none';
            }
            this.initializeComponents();
            console.log('[DarknetUI] Boot complete!');
        }, 400);
    }
    
    initializeComponents() {
        try {
            // Initialize OSINT Core
            if (typeof OSINTCore !== 'undefined') {
                this.osint = new OSINTCore();
            } else {
                console.warn('[DarknetUI] OSINTCore not loaded');
            }
        } catch (e) {
            console.error('[DarknetUI] Failed to init OSINTCore:', e);
        }
        
        // Initialize graph (will be created when view is shown)
        // Initialize map (will be created when view is shown)
        
        // Load Intel Feed data
        this.loadIntelFeed();
        
        // Load saved settings
        this.loadSettings();
        
        console.log('[DarknetUI] All components initialized');
    }
    
    loadSettings() {
        try {
            const saved = localStorage.getItem('osint_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                if (settings.theme === 'light') {
                    document.body.classList.add('light-mode');
                    const icon = document.querySelector('#toggleTheme i');
                    if (icon) icon.className = 'fas fa-sun';
                } else if (settings.theme === 'cyber') {
                    document.body.classList.add('cyber-mode');
                }
            }
        } catch (e) {
            console.warn('Could not load settings:', e);
        }
    }
    
    async loadIntelFeed(feedType = 'all') {
        try {
            const feedContent = document.getElementById('feedContent');
            const featuredTitle = document.getElementById('featuredTitle');
            const featuredMeta = document.getElementById('featuredMeta');
            
            // Show loading state
            if (feedContent) {
                feedContent.innerHTML = `
                    <div class="feed-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Loading ${feedType} feed...</p>
                    </div>
                `;
            }
            
            // Determine what to load based on feed type
            let stories = [];
            
            if (feedType === 'all' || feedType === 'hackernews') {
                const topRes = await fetch('/api/hackernews/top?limit=15');
                const topData = await topRes.json();
                if (topData.stories) {
                    stories = [...stories, ...topData.stories.map(s => ({...s, source: 'hackernews'}))];
                }
            }
            
            if (feedType === 'all' || feedType === 'security') {
                // Security news - use ask stories that mention security keywords
                const askRes = await fetch('/api/hackernews/search?q=security%20vulnerability%20CVE&tags=story');
                const askData = await askRes.json();
                if (askData.hits) {
                    stories = [...stories, ...askData.hits.map(s => ({
                        id: s.objectID,
                        title: s.title,
                        url: s.url,
                        score: s.points,
                        by: s.author,
                        time: Math.floor(new Date(s.created_at).getTime() / 1000),
                        descendants: s.num_comments,
                        source: 'security'
                    }))];
                }
            }
            
            if (feedType === 'all' || feedType === 'osint') {
                // OSINT news - search for relevant topics
                const osintRes = await fetch('/api/hackernews/search?q=osint%20recon%20investigation&tags=story');
                const osintData = await osintRes.json();
                if (osintData.hits) {
                    stories = [...stories, ...osintData.hits.map(s => ({
                        id: s.objectID,
                        title: s.title,
                        url: s.url,
                        score: s.points,
                        by: s.author,
                        time: Math.floor(new Date(s.created_at).getTime() / 1000),
                        descendants: s.num_comments,
                        source: 'osint'
                    }))];
                }
            }
            
            // Sort by score/relevance
            stories.sort((a, b) => (b.score || 0) - (a.score || 0));
            
            // Set featured story
            if (stories.length > 0 && featuredTitle && featuredMeta) {
                const featured = stories[0];
                featuredTitle.innerHTML = `<a href="${featured.url || `https://news.ycombinator.com/item?id=${featured.id}`}" target="_blank">${featured.title}</a>`;
                featuredMeta.innerHTML = `
                    <span><i class="fas fa-arrow-up"></i> ${featured.score || 0} points</span>
                    <span><i class="fas fa-comment"></i> ${featured.descendants || 0} comments</span>
                    <span><i class="fas fa-user"></i> ${featured.by || 'anonymous'}</span>
                    <span><i class="fas fa-clock"></i> ${this.timeAgo((featured.time || 0) * 1000)}</span>
                `;
                stories = stories.slice(1); // Remove featured from main list
            }
            
            // Populate feed content
            if (feedContent && stories.length > 0) {
                feedContent.innerHTML = stories.slice(0, 20).map(story => `
                    <article class="feed-item" data-source="${story.source}">
                        <div class="feed-item-header">
                            <span class="feed-source ${story.source}">
                                <i class="${this.getSourceIcon(story.source)}"></i> ${this.getSourceName(story.source)}
                            </span>
                            <span class="feed-time">${this.timeAgo((story.time || 0) * 1000)}</span>
                        </div>
                        <h3 class="feed-title">
                            <a href="${story.url || `https://news.ycombinator.com/item?id=${story.id}`}" target="_blank">
                                ${story.title}
                            </a>
                        </h3>
                        <div class="feed-meta">
                            <span><i class="fas fa-arrow-up"></i> ${story.score || 0}</span>
                            <span><i class="fas fa-comment"></i> ${story.descendants || 0}</span>
                            <span><i class="fas fa-user"></i> ${story.by || 'anonymous'}</span>
                        </div>
                    </article>
                `).join('');
            } else if (feedContent) {
                feedContent.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-rss"></i>
                        <p>No stories found for this category</p>
                    </div>
                `;
            }
            
            // Load sidebar content
            await this.loadFeedSidebar();
            
            console.log(`[DarknetUI] Intel feed loaded: ${feedType}`);
        } catch (error) {
            console.error('Failed to load Intel feed:', error);
            const feedContent = document.getElementById('feedContent');
            if (feedContent) {
                feedContent.innerHTML = `
                    <div class="empty-state error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Failed to load feed. Please try again.</p>
                        <button class="btn-outline" onclick="darknetUI.loadIntelFeed()">
                            <i class="fas fa-refresh"></i> Retry
                        </button>
                    </div>
                `;
            }
        }
    }
    
    async loadFeedSidebar() {
        try {
            // Load Ask HN for trending
            const askRes = await fetch('/api/hackernews/ask?limit=5');
            const askData = await askRes.json();
            
            const trendingList = document.getElementById('trendingTechniques');
            if (trendingList && askData.stories) {
                trendingList.innerHTML = askData.stories.map(story => `
                    <li>
                        <a href="https://news.ycombinator.com/item?id=${story.id}" target="_blank">
                            <i class="fas fa-fire"></i> ${story.title.replace('Ask HN: ', '').substring(0, 40)}${story.title.length > 40 ? '...' : ''}
                        </a>
                    </li>
                `).join('');
            }
            
            // Load Show HN for tips
            const showRes = await fetch('/api/hackernews/show?limit=5');
            const showData = await showRes.json();
            
            const tipsList = document.getElementById('osintTips');
            if (tipsList && showData.stories) {
                tipsList.innerHTML = showData.stories.map(story => `
                    <li>
                        <a href="${story.url || `https://news.ycombinator.com/item?id=${story.id}`}" target="_blank">
                            <i class="fas fa-lightbulb"></i> ${story.title.replace('Show HN: ', '').substring(0, 40)}${story.title.length > 40 ? '...' : ''}
                        </a>
                    </li>
                `).join('');
            }
        } catch (error) {
            console.error('Failed to load feed sidebar:', error);
        }
    }
    
    getSourceIcon(source) {
        const icons = {
            hackernews: 'fa-brands fa-hacker-news',
            security: 'fas fa-shield-halved',
            osint: 'fas fa-user-secret'
        };
        return icons[source] || 'fas fa-rss';
    }
    
    getSourceName(source) {
        const names = {
            hackernews: 'Hacker News',
            security: 'Security',
            osint: 'OSINT'
        };
        return names[source] || source;
    }
    
    setupFeedTabs() {
        const feedTabs = document.querySelectorAll('.feed-tab');
        feedTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                feedTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadIntelFeed(tab.dataset.feed);
            });
        });
    }
    
    // ==========================================
    // 🔍 PERSON NAME SEARCH
    // ==========================================
    setupPersonSearch() {
        const initScanBtn = document.getElementById('initScan');
        if (initScanBtn) {
            initScanBtn.addEventListener('click', () => this.initiateScan());
        }
    }
    
    async initiateScan() {
        const activeForm = document.querySelector('.intake-form.active');
        if (!activeForm) {
            this.showToast('Please select a search type', 'warning');
            return;
        }
        
        const formType = activeForm.dataset.form;
        const btn = document.getElementById('initScan');
        const originalContent = btn.innerHTML;
        
        // Show loading state
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Scanning...</span>';
        btn.disabled = true;
        
        try {
            let query = '';
            let searchData = {};
            
            switch (formType) {
                case 'person':
                    const name = document.getElementById('personName')?.value?.trim();
                    const school = document.getElementById('personSchool')?.value?.trim();
                    const location = document.getElementById('personLocation')?.value?.trim();
                    const usernames = document.getElementById('personUsernames')?.value?.trim();
                    
                    if (!name && !usernames) {
                        this.showToast('Please enter a name or username', 'warning');
                        btn.innerHTML = originalContent;
                        btn.disabled = false;
                        return;
                    }
                    
                    query = name || usernames?.split(',')[0];
                    searchData = { name, school, location, usernames: usernames?.split(',').map(u => u.trim()) };
                    break;
                    
                case 'organization':
                    query = document.getElementById('orgName')?.value?.trim();
                    searchData = { 
                        org: query,
                        domain: document.getElementById('orgDomain')?.value?.trim(),
                        location: document.getElementById('orgLocation')?.value?.trim()
                    };
                    break;
                    
                case 'domain':
                    query = document.getElementById('domainTarget')?.value?.trim();
                    searchData = { domain: query };
                    break;
                    
                case 'username':
                    query = document.getElementById('usernameTarget')?.value?.trim();
                    searchData = { username: query };
                    break;
                    
                case 'ip':
                    query = document.getElementById('ipTarget')?.value?.trim();
                    searchData = { ip: query };
                    break;
            }
            
            if (!query) {
                this.showToast('Please enter a search query', 'warning');
                btn.innerHTML = originalContent;
                btn.disabled = false;
                return;
            }
            
            // Get selected modules
            const selectedModules = [];
            document.querySelectorAll('.profile-card input:checked').forEach(input => {
                selectedModules.push(input.value);
            });
            
            this.showToast(`Starting ${formType} scan for "${query}"...`, 'info');
            this.addNotification('Scan Started', `${formType.toUpperCase()} scan initiated for "${query}"`, 'info');
            
            // Switch to scans view to show progress
            this.switchView('scanView');
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelector('.nav-item[data-view="scan"]')?.classList.add('active');
            
            // Update stats
            const activeCount = document.getElementById('activeScansCount');
            if (activeCount) activeCount.textContent = parseInt(activeCount.textContent) + 1;
            
            // Add to active scans list
            this.addActiveScan(query, formType, selectedModules);
            
            // Execute the search
            const results = await this.executeSearch(query, formType, searchData, selectedModules);
            
            // Update completed count
            const completedCount = document.getElementById('completedScansCount');
            if (completedCount) completedCount.textContent = parseInt(completedCount.textContent) + 1;
            if (activeCount) activeCount.textContent = Math.max(0, parseInt(activeCount.textContent) - 1);
            
            // Show results
            this.displaySearchResults(query, results);
            
            this.showToast(`Scan complete! Found ${results.found} sources with data.`, 'success');
            this.addNotification('Scan Complete', `Found data in ${results.found} sources for "${query}"`, 'success');
            
        } catch (error) {
            console.error('Scan error:', error);
            this.showToast('Scan failed: ' + error.message, 'error');
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    }
    
    addActiveScan(query, type, modules) {
        const scansList = document.getElementById('activeScansList');
        if (!scansList) return;
        
        // Remove empty state
        const emptyState = scansList.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
        
        const scanId = `scan-${Date.now()}`;
        const scanItem = document.createElement('div');
        scanItem.className = 'scan-item active';
        scanItem.id = scanId;
        scanItem.innerHTML = `
            <div class="scan-status running">
                <i class="fas fa-spinner fa-spin"></i>
            </div>
            <div class="scan-info">
                <h4>${query}</h4>
                <div class="scan-meta">
                    <span class="scan-type">${type.toUpperCase()}</span>
                    <span class="scan-modules">${modules.join(', ')}</span>
                    <span class="scan-time">${new Date().toLocaleTimeString()}</span>
                </div>
            </div>
            <div class="scan-progress">
                <div class="progress-bar" style="width: 0%"></div>
            </div>
        `;
        
        scansList.insertBefore(scanItem, scansList.firstChild);
        
        // Animate progress
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                this.completeScanItem(scanId);
            }
            scanItem.querySelector('.progress-bar').style.width = progress + '%';
        }, 200);
        
        return scanId;
    }
    
    completeScanItem(scanId) {
        const scanItem = document.getElementById(scanId);
        if (scanItem) {
            scanItem.classList.remove('active');
            scanItem.classList.add('completed');
            scanItem.querySelector('.scan-status').innerHTML = '<i class="fas fa-check"></i>';
            scanItem.querySelector('.scan-status').classList.remove('running');
            scanItem.querySelector('.scan-status').classList.add('done');
        }
    }
    
    async executeSearch(query, type, data, modules) {
        // Call global search API
        const response = await fetch(`/api/search/global?q=${encodeURIComponent(query)}&type=${type}`);
        const results = await response.json();
        
        // Add to intel stream
        Object.entries(results.sources || {}).forEach(([source, result]) => {
            if (result) {
                this.addToStream({
                    type: 'found',
                    content: `[${source.toUpperCase()}] Data found for "${query}"`,
                    source: source
                });
            }
        });
        
        // Update total results
        const totalResults = document.getElementById('totalResultsCount');
        if (totalResults) {
            totalResults.textContent = parseInt(totalResults.textContent) + results.found;
        }
        
        return results;
    }
    
    // ==========================================
    // 📊 GRAPH CONTROLS
    // ==========================================
    setupGraphControls() {
        document.getElementById('graphZoomIn')?.addEventListener('click', () => {
            if (this.graph) this.graph.zoomIn();
        });
        
        document.getElementById('graphZoomOut')?.addEventListener('click', () => {
            if (this.graph) this.graph.zoomOut();
        });
        
        document.getElementById('graphReset')?.addEventListener('click', () => {
            if (this.graph) this.graph.resetView();
        });
        
        document.getElementById('graphCenter')?.addEventListener('click', () => {
            if (this.graph) this.graph.centerGraph();
        });
        
        document.getElementById('graphLayout')?.addEventListener('change', (e) => {
            if (this.graph) this.graph.setLayout(e.target.value);
        });
        
        document.getElementById('closeNodeDetails')?.addEventListener('click', () => {
            document.getElementById('nodeDetails')?.classList.add('hidden');
        });
    }
    
    // ==========================================
    // 🗺️ MAP CONTROLS
    // ==========================================
    setupMapControls() {
        document.querySelectorAll('.map-controls .btn-sm').forEach(btn => {
            btn.addEventListener('click', () => {
                const layer = btn.dataset.layer;
                if (layer && this.map) {
                    document.querySelectorAll('.map-controls .btn-sm').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.map.setLayer(layer);
                }
            });
        });
        
        document.getElementById('mapFitAll')?.addEventListener('click', () => {
            if (this.map) this.map.fitToEntities();
        });
        
        document.getElementById('mapSearch')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this.map) {
                this.map.searchLocation(e.target.value);
            }
        });
    }
    
    // ==========================================
    // ⏰ TIMELINE FILTERS
    // ==========================================
    setupTimelineFilters() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.filterTimeline(btn.dataset.filter);
            });
        });
        
        document.getElementById('timelineRange')?.addEventListener('input', (e) => {
            this.updateTimelineRange(e.target.value);
        });
    }
    
    filterTimeline(filter) {
        const items = document.querySelectorAll('.timeline-item');
        items.forEach(item => {
            if (filter === 'all' || item.dataset.type === filter) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    updateTimelineRange(value) {
        const percent = parseInt(value);
        const labels = ['1 Day', '1 Week', '1 Month', '6 Months', '1 Year', 'All Time'];
        const index = Math.floor(percent / 20);
        const timeStart = document.getElementById('timeStart');
        if (timeStart) timeStart.textContent = labels[Math.min(index, labels.length - 1)];
    }
    
    timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
            }
        }
        return 'just now';
    }
    
    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const viewType = item.dataset.view;
                
                // Map view types to actual view IDs
                const viewMap = {
                    'search': 'searchView',
                    'scan': 'scanView',
                    'graph': 'graphView',
                    'map': 'mapView',
                    'geoint': 'mapView',
                    'timeline': 'timelineView',
                    'feed': 'feedView'
                };
                
                const viewId = viewMap[viewType] || `${viewType}View`;
                this.switchView(viewId);
                
                // Update active state
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }
    
    switchView(viewId) {
        // Hide all views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        // Show target view
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
            this.currentView = viewId;
            
            // Initialize view-specific components
            if (viewId === 'graphView' && !this.graph) {
                this.initGraph();
            }
            
            if (viewId === 'mapView' && !this.map) {
                this.initMap();
            }
            
            // Load feed when switching to feed view
            if (viewId === 'feedView') {
                this.loadIntelFeed();
            }
        }
    }
    
    initGraph() {
        const container = document.getElementById('graphCanvas');
        if (container && typeof OSINTGraph !== 'undefined') {
            this.graph = new OSINTGraph('graphCanvas');
            console.log('[DarknetUI] Graph initialized');
        }
    }
    
    initMap() {
        const container = document.getElementById('leafletMap');
        if (container && typeof OSINTMap !== 'undefined') {
            // Small delay to ensure container is visible
            setTimeout(() => {
                this.map = new OSINTMap('leafletMap');
                console.log('[DarknetUI] Map initialized');
                
                // Update map stats
                this.updateMapStats();
            }, 100);
        }
    }
    
    updateMapStats() {
        const markerCount = document.getElementById('mapMarkerCount');
        const countryCount = document.getElementById('mapCountryCount');
        if (markerCount) markerCount.textContent = this.map?.markers?.length || 0;
        if (countryCount) countryCount.textContent = this.map?.getCountryCount?.() || 0;
    }
    
    setupIntakeTabs() {
        const tabs = document.querySelectorAll('.intake-tab');
        const forms = document.querySelectorAll('.intake-form');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetType = tab.dataset.type; // Using data-type attribute
                
                // Update tab states
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Show target form
                forms.forEach(f => f.classList.remove('active'));
                const targetForm = document.querySelector(`.intake-form[data-form="${targetType}"]`);
                if (targetForm) {
                    targetForm.classList.add('active');
                }
            });
        });
    }
    
    setupScanProfiles() {
        const profileCards = document.querySelectorAll('.profile-card input');
        
        profileCards.forEach(input => {
            input.addEventListener('change', () => {
                // Visual feedback
                const content = input.nextElementSibling;
                if (input.checked) {
                    content.style.borderColor = '#00fff5';
                } else {
                    content.style.borderColor = '';
                }
            });
        });
    }
    
    setupSearchActions() {
        // Main execute button - supports both IDs for backwards compatibility
        const initScanBtn = document.getElementById('initScan') || document.getElementById('executeBtn');
        if (initScanBtn) {
            initScanBtn.addEventListener('click', () => this.executeScan());
        }
        
        // Form submissions
        document.querySelectorAll('.intake-form').forEach(form => {
            form.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.executeScan();
                }
            });
        });
    }
    
    async executeScan() {
        // Get active form
        const activeForm = document.querySelector('.intake-form.active');
        if (!activeForm) return;
        
        // Collect form data
        const formData = new FormData(activeForm);
        const data = Object.fromEntries(formData.entries());
        
        // Get selected profiles
        const selectedProfiles = [];
        document.querySelectorAll('.profile-card input:checked').forEach(input => {
            selectedProfiles.push(input.value);
        });
        
        // Validate
        if (!this.validateInput(data)) {
            this.showNotification('Please enter a valid target', 'error');
            return;
        }
        
        // Show loading state
        const btn = document.getElementById('initScan') || document.getElementById('executeBtn');
        const originalText = btn?.innerHTML;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Scanning...</span>';
            btn.disabled = true;
        }
        
        // Open results panel
        this.openResultsPanel();
        
        // Add to intel stream
        this.addToStream({
            type: 'info',
            content: `Initiating scan for: ${JSON.stringify(data)}`,
            source: 'System'
        });
        
        try {
            // Determine target type and execute appropriate scan
            const target = this.buildTarget(data, activeForm.id);
            
            // Start scan
            const scan = await this.osint.startScan(target, {
                profile: selectedProfiles[0] || 'social'
            });
            
            this.addToStream({
                type: 'found',
                content: `Scan completed: ${scan.results.length} results found`,
                source: 'System'
            });
            
        } catch (error) {
            console.error('Scan error:', error);
            this.addToStream({
                type: 'warning',
                content: `Scan error: ${error.message}`,
                source: 'System'
            });
        }
        
        // Reset button
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
    
    buildTarget(data, formType) {
        switch (formType) {
            case 'personForm':
                return {
                    type: 'person',
                    firstName: data.firstName,
                    lastName: data.lastName,
                    location: data.location,
                    email: data.email,
                    domain: data.domain
                };
            
            case 'orgForm':
                return {
                    type: 'organization',
                    name: data.orgName,
                    domain: data.domain,
                    location: data.orgLocation
                };
            
            case 'domainForm':
                return {
                    type: 'domain',
                    value: data.domain
                };
            
            case 'usernameForm':
                return {
                    type: 'username',
                    value: data.username
                };
            
            case 'ipForm':
                return {
                    type: 'ip',
                    value: data.ipAddress
                };
            
            default:
                return { value: Object.values(data)[0] };
        }
    }
    
    validateInput(data) {
        return Object.values(data).some(v => v && v.trim().length > 0);
    }
    
    setupResultsPanel() {
        const panel = document.getElementById('resultsPanel');
        const closeBtn = panel?.querySelector('.close-panel');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeResultsPanel());
        }
        
        // Panel tabs
        const panelTabs = panel?.querySelectorAll('.panel-tab');
        panelTabs?.forEach(tab => {
            tab.addEventListener('click', () => {
                panelTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                // TODO: Switch panel content
            });
        });
    }
    
    openResultsPanel() {
        const panel = document.getElementById('resultsPanel');
        if (panel) {
            panel.classList.remove('hidden');
            setTimeout(() => panel.classList.add('active'), 10);
        }
    }
    
    closeResultsPanel() {
        const panel = document.getElementById('resultsPanel');
        if (panel) {
            panel.classList.remove('active');
            setTimeout(() => panel.classList.add('hidden'), 300);
        }
    }
    
    setupGlobalSearch() {
        const searchInput = document.querySelector('.search-global input');
        const searchContainer = document.querySelector('.search-global');
        
        if (searchInput) {
            // Show loading state
            searchInput.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') {
                    const query = searchInput.value.trim();
                    if (query) {
                        searchContainer?.classList.add('searching');
                        searchInput.disabled = true;
                        
                        try {
                            await this.performGlobalSearch(query);
                        } finally {
                            searchContainer?.classList.remove('searching');
                            searchInput.disabled = false;
                        }
                    }
                }
            });
        }
    }
    
    async performGlobalSearch(query) {
        this.showToast(`Searching for "${query}"...`, 'info');
        
        // Switch to scan view to show results
        this.switchView('scanView');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector('.nav-item[data-view="scan"]')?.classList.add('active');
        
        try {
            // Call the unified global search API
            const response = await fetch(`/api/search/global?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (data.error) {
                this.showToast(data.error, 'error');
                return;
            }
            
            // Display results
            this.displaySearchResults(query, data);
            
            this.showToast(`Found ${data.found} sources with results!`, 'success');
            this.addNotification('Search Complete', `Found data in ${data.found} sources for "${query}"`, 'success');
            
        } catch (error) {
            console.error('Search error:', error);
            this.showToast('Search failed: ' + error.message, 'error');
        }
    }
    
    displaySearchResults(query, data) {
        const streamContainer = document.getElementById('intelStream');
        const scansList = document.getElementById('activeScansList');
        
        if (streamContainer) {
            streamContainer.innerHTML = '';
            
            // Add header
            const header = document.createElement('div');
            header.className = 'stream-header';
            header.innerHTML = `
                <h3><i class="fas fa-search"></i> Results for: ${query}</h3>
                <span class="result-count">${data.found} sources found</span>
            `;
            streamContainer.appendChild(header);
            
            // Add results from each source
            Object.entries(data.sources).forEach(([source, result]) => {
                if (result) {
                    const item = document.createElement('div');
                    item.className = 'stream-item found';
                    
                    const sourceIcons = {
                        github: { icon: 'fa-brands fa-github', color: '#333' },
                        reddit: { icon: 'fa-brands fa-reddit', color: '#ff4500' },
                        gitlab: { icon: 'fa-brands fa-gitlab', color: '#fc6d26' },
                        keybase: { icon: 'fa-key', color: '#33a0ff' },
                        hackernews: { icon: 'fa-brands fa-hacker-news', color: '#ff6600' },
                        wikidata: { icon: 'fa-wikipedia-w', color: '#0645ad' }
                    };
                    
                    const iconInfo = sourceIcons[source] || { icon: 'fa-circle', color: '#00fff5' };
                    
                    item.innerHTML = `
                        <div class="stream-icon" style="background: ${iconInfo.color}">
                            <i class="fas ${iconInfo.icon}"></i>
                        </div>
                        <div class="stream-content">
                            <h4>${source.toUpperCase()}</h4>
                            <p>${this.formatResultPreview(source, result)}</p>
                        </div>
                        <a href="${this.getResultUrl(source, query, result)}" target="_blank" class="stream-action">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                    `;
                    
                    streamContainer.appendChild(item);
                }
            });
            
            // If no results
            if (data.found === 0) {
                streamContainer.innerHTML += `
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <p>No results found for "${query}"</p>
                    </div>
                `;
            }
        }
    }
    
    formatResultPreview(source, data) {
        switch(source) {
            case 'github':
                return `${data.name || data.login} - ${data.bio || 'No bio'} | ${data.public_repos} repos, ${data.followers} followers`;
            case 'reddit':
                return `Karma: ${data.total_karma || data.link_karma + data.comment_karma} | Account created: ${new Date(data.created_utc * 1000).toLocaleDateString()}`;
            case 'gitlab':
                return `${data.name} (@${data.username}) - ${data.bio || 'No bio'}`;
            case 'keybase':
                return data?.basics?.username ? `@${data.basics.username}` : 'Profile found';
            case 'hackernews':
                return `Karma: ${data.karma} | Created: ${new Date(data.created * 1000).toLocaleDateString()}`;
            case 'wikidata':
                return data?.length ? `Found ${data.length} entities` : 'No entities found';
            default:
                return 'Data found';
        }
    }
    
    getResultUrl(source, query, data) {
        switch(source) {
            case 'github': return data.html_url || `https://github.com/${query}`;
            case 'reddit': return `https://reddit.com/user/${query}`;
            case 'gitlab': return data.web_url || `https://gitlab.com/${query}`;
            case 'keybase': return `https://keybase.io/${query}`;
            case 'hackernews': return `https://news.ycombinator.com/user?id=${query}`;
            case 'wikidata': return `https://www.wikidata.org/wiki/Special:Search?search=${query}`;
            default: return '#';
        }
    }
    
    async quickSearch(query) {
        await this.performGlobalSearch(query);
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + K for global search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                document.querySelector('.search-global input')?.focus();
            }
            
            // Escape to close panel
            if (e.key === 'Escape') {
                this.closeResultsPanel();
            }
            
            // 1-6 for view switching
            if (e.key >= '1' && e.key <= '6' && !e.ctrlKey && !e.metaKey) {
                const views = ['targetView', 'scansView', 'graphView', 'mapView', 'timelineView', 'feedView'];
                const index = parseInt(e.key) - 1;
                if (views[index]) {
                    this.switchView(views[index]);
                    document.querySelectorAll('.nav-item').forEach((n, i) => {
                        n.classList.toggle('active', i === index);
                    });
                }
            }
        });
    }
    
    setupOSINTEvents() {
        // Listen for OSINT core events
        document.addEventListener('osint:resultFound', (e) => {
            const result = e.detail.result;
            this.addToStream({
                type: 'found',
                content: `Found: ${result.label || result.type}`,
                source: result.platform || 'OSINT'
            });
            
            // Add to graph if available
            if (this.graph && result.id) {
                this.graph.addNode(result);
            }
        });
        
        document.addEventListener('osint:entityAdded', (e) => {
            const entity = e.detail;
            
            // Add to graph
            if (this.graph) {
                this.graph.addNode(entity);
            }
            
            // Add to map if has location
            if (this.map && entity.lat && entity.lng) {
                this.map.addEntity(entity);
            }
        });
        
        document.addEventListener('osint:relationshipAdded', (e) => {
            const rel = e.detail;
            
            if (this.graph) {
                this.graph.addLink(rel.source, rel.target, { label: rel.type });
            }
            
            if (this.map) {
                this.map.addConnection(rel.source, rel.target);
            }
        });
        
        document.addEventListener('osint:geoFound', (e) => {
            const entity = e.detail.entity;
            
            if (this.map) {
                this.map.addEntity(entity);
            }
        });
        
        document.addEventListener('osint:scanCompleted', (e) => {
            const scan = e.detail;
            this.showNotification(`Scan completed: ${scan.results.length} results`, 'success');
            
            // Update scans view
            this.updateScansView(scan);
        });
    }
    
    addToStream(item) {
        const stream = document.getElementById('intelStream');
        if (!stream) return;
        
        const time = new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        const element = document.createElement('div');
        element.className = 'stream-item';
        element.innerHTML = `
            <span class="time">${time}</span>
            <span class="type ${item.type}">[${item.type.toUpperCase()}]</span>
            <span class="content">${item.content}</span>
            <span class="source">${item.source}</span>
        `;
        
        stream.insertBefore(element, stream.firstChild);
        
        // Keep only last 100 items
        while (stream.children.length > 100) {
            stream.removeChild(stream.lastChild);
        }
        
        this.intelStream.unshift(item);
    }
    
    updateScansView(scan) {
        const scansList = document.getElementById('scansList');
        if (!scansList) return;
        
        const scanCard = document.createElement('div');
        scanCard.className = 'scan-card';
        scanCard.innerHTML = `
            <div class="scan-header">
                <div class="scan-status ${scan.status}"></div>
                <div class="scan-info">
                    <div class="scan-target">${JSON.stringify(scan.target)}</div>
                    <div class="scan-meta">
                        Profile: ${scan.profile} | 
                        Results: ${scan.results.length} | 
                        ${new Date(scan.startTime).toLocaleString()}
                    </div>
                </div>
            </div>
        `;
        
        scansList.insertBefore(scanCard, scansList.firstChild);
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: ${type === 'success' ? '#39ff1422' : type === 'error' ? '#ff004022' : '#00fff522'};
            border: 1px solid ${type === 'success' ? '#39ff14' : type === 'error' ? '#ff0040' : '#00fff5'};
            color: ${type === 'success' ? '#39ff14' : type === 'error' ? '#ff0040' : '#00fff5'};
            padding: 12px 20px;
            border-radius: 8px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            z-index: 9999;
            animation: slideInUp 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutDown 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // Graph controls
    setGraphLayout(type) {
        if (this.graph) {
            this.graph.setLayout(type);
        }
    }
    
    filterGraphByType(types) {
        if (this.graph) {
            this.graph.filterByType(types);
        }
    }
    
    exportGraphData() {
        if (this.graph) {
            return this.graph.exportData();
        }
        return null;
    }
    
    // Map controls
    toggleMapLayer(layer, visible) {
        if (this.map) {
            this.map.toggleLayer(layer, visible);
        }
    }
    
    fitMapToEntities() {
        if (this.map) {
            this.map.fitToEntities();
        }
    }
    
    // Export all data
    exportAllData() {
        const data = {
            graph: this.graph?.exportData(),
            osint: this.osint?.exportResults(),
            stream: this.intelStream,
            exportedAt: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `osint-export-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

// Add animations CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
    
    @keyframes slideOutDown {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(20px); opacity: 0; }
    }
    
    .scan-card {
        background: var(--bg-surface);
        border: 1px solid var(--bg-highlight);
        border-radius: var(--radius-md);
        padding: var(--space-4);
        margin-bottom: var(--space-3);
    }
    
    .scan-header {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }
    
    .scan-status {
        width: 10px;
        height: 10px;
        border-radius: 50%;
    }
    
    .scan-status.completed { background: var(--neon-green); }
    .scan-status.running { background: var(--neon-cyan); animation: pulse 1s infinite; }
    .scan-status.error { background: var(--neon-red); }
    
    .scan-target {
        font-family: var(--font-mono);
        font-size: 0.9rem;
    }
    
    .scan-meta {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: var(--space-1);
    }
`;
document.head.appendChild(style);

// Initialize UI
const darknetUI = new DarknetUI();

// Export for global access
window.darknetUI = darknetUI;
