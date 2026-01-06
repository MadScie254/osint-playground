/**
 * Username OSINT Engine - Frontend Application
 * Multi-platform username reconnaissance tool
 */

class UsernameOSINT {
    constructor() {
        this.apiBase = '/api';
        this.results = [];
        this.searchHistory = [];
        this.isSearching = false;
        
        this.init();
    }
    
    init() {
        this.bindElements();
        this.bindEvents();
        this.loadHistory();
    }
    
    bindElements() {
        // Modal elements
        this.disclaimerModal = document.getElementById('disclaimerModal');
        this.agreeCheckbox = document.getElementById('agreeTerms');
        this.acceptBtn = document.getElementById('acceptBtn');
        this.declineBtn = document.getElementById('declineBtn');
        
        // Main app
        this.app = document.getElementById('app');
        
        // Search elements
        this.usernameInput = document.getElementById('usernameInput');
        this.searchBtn = document.getElementById('searchBtn');
        
        // Progress elements
        this.progressSection = document.getElementById('progressSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressCount = document.getElementById('progressCount');
        this.currentPlatform = document.getElementById('currentPlatform');
        
        // Stats elements
        this.statsSection = document.getElementById('statsSection');
        this.foundCount = document.getElementById('foundCount');
        this.notFoundCount = document.getElementById('notFoundCount');
        this.errorCount = document.getElementById('errorCount');
        this.totalCount = document.getElementById('totalCount');
        
        // Results elements
        this.resultsSection = document.getElementById('resultsSection');
        this.searchedUsername = document.getElementById('searchedUsername');
        this.resultsGrid = document.getElementById('resultsGrid');
        this.resultFilter = document.getElementById('resultFilter');
        this.categoryTabs = document.querySelectorAll('.tab-btn');
        
        // Export buttons
        this.exportJsonBtn = document.getElementById('exportJson');
        this.exportCsvBtn = document.getElementById('exportCsv');
        
        // Search engine results
        this.searchEngineResults = document.getElementById('searchEngineResults');
        this.searchEngineGrid = document.getElementById('searchEngineGrid');
    }
    
    bindEvents() {
        // Disclaimer modal
        this.agreeCheckbox?.addEventListener('change', () => {
            this.acceptBtn.disabled = !this.agreeCheckbox.checked;
        });
        
        this.acceptBtn?.addEventListener('click', () => this.acceptTerms());
        this.declineBtn?.addEventListener('click', () => this.declineTerms());
        
        // Search
        this.searchBtn?.addEventListener('click', () => this.startSearch());
        this.usernameInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startSearch();
        });
        
        // Filters
        this.resultFilter?.addEventListener('change', () => this.filterResults());
        this.categoryTabs?.forEach(tab => {
            tab.addEventListener('click', () => this.switchCategory(tab));
        });
        
        // Export
        this.exportJsonBtn?.addEventListener('click', () => this.exportJSON());
        this.exportCsvBtn?.addEventListener('click', () => this.exportCSV());
        
        // Check if user already accepted terms
        if (localStorage.getItem('osint_terms_accepted')) {
            this.disclaimerModal.classList.remove('active');
            this.app.classList.remove('hidden');
        }
    }
    
    acceptTerms() {
        localStorage.setItem('osint_terms_accepted', Date.now());
        this.disclaimerModal.classList.remove('active');
        this.app.classList.remove('hidden');
    }
    
    declineTerms() {
        window.location.href = 'about:blank';
    }
    
    async startSearch() {
        const username = this.usernameInput.value.trim();
        
        if (!username) {
            this.showNotification('Please enter a username', 'warning');
            return;
        }
        
        if (this.isSearching) {
            this.showNotification('Search already in progress', 'warning');
            return;
        }
        
        // Validate username format
        if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
            this.showNotification('Invalid username format. Use only letters, numbers, dots, underscores, and hyphens.', 'error');
            return;
        }
        
        this.isSearching = true;
        this.results = [];
        this.searchBtn.disabled = true;
        this.searchBtn.innerHTML = '<i class="fas fa-spinner spinner"></i> Searching...';
        
        // Get selected options
        const selectedEngines = Array.from(document.querySelectorAll('input[name="engine"]:checked'))
            .map(el => el.value);
        const selectedCategories = Array.from(document.querySelectorAll('input[name="category"]:checked'))
            .map(el => el.value);
        
        // Show progress
        this.progressSection.classList.remove('hidden');
        this.statsSection.classList.remove('hidden');
        this.resultsSection.classList.remove('hidden');
        this.searchedUsername.textContent = username;
        this.resultsGrid.innerHTML = '';
        
        try {
            // Start the search via API
            const response = await fetch(`${this.apiBase}/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    engines: selectedEngines,
                    categories: selectedCategories.includes('all') ? 'all' : selectedCategories
                })
            });
            
            if (!response.ok) {
                throw new Error('Search request failed');
            }
            
            // Handle streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());
                
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        this.handleSearchUpdate(data);
                    } catch (e) {
                        console.error('Error parsing response:', e);
                    }
                }
            }
            
            this.onSearchComplete(username);
            
        } catch (error) {
            console.error('Search error:', error);
            // Fallback to client-side search if API fails
            await this.clientSideSearch(username);
        }
        
        this.isSearching = false;
        this.searchBtn.disabled = false;
        this.searchBtn.innerHTML = '<i class="fas fa-search"></i> Search';
    }
    
    async clientSideSearch(username) {
        // Load platforms config
        const platforms = await this.loadPlatforms();
        const total = platforms.length;
        let completed = 0;
        
        this.progressCount.textContent = `0 / ${total}`;
        
        // Process platforms in batches to avoid rate limiting
        const batchSize = 5;
        const batches = [];
        
        for (let i = 0; i < platforms.length; i += batchSize) {
            batches.push(platforms.slice(i, i + batchSize));
        }
        
        for (const batch of batches) {
            const promises = batch.map(async (platform) => {
                this.currentPlatform.textContent = `Checking ${platform.name}...`;
                
                const result = await this.checkPlatform(platform, username);
                this.results.push(result);
                this.renderResult(result);
                
                completed++;
                this.updateProgress(completed, total);
            });
            
            await Promise.all(promises);
            
            // Small delay between batches
            await this.sleep(200);
        }
        
        // Generate search engine URLs
        this.generateSearchEngineLinks(username);
        this.onSearchComplete(username);
    }
    
    async loadPlatforms() {
        try {
            const response = await fetch('/config/platforms.json');
            const data = await response.json();
            return data.platforms;
        } catch (error) {
            console.error('Failed to load platforms config:', error);
            return this.getDefaultPlatforms();
        }
    }
    
    getDefaultPlatforms() {
        // Fallback platform list
        return [
            { name: 'GitHub', url: 'https://github.com/{username}', icon: 'fab fa-github', color: '#333', category: 'development' },
            { name: 'Twitter', url: 'https://twitter.com/{username}', icon: 'fab fa-twitter', color: '#1DA1F2', category: 'social' },
            { name: 'Instagram', url: 'https://instagram.com/{username}', icon: 'fab fa-instagram', color: '#E4405F', category: 'social' },
            { name: 'LinkedIn', url: 'https://linkedin.com/in/{username}', icon: 'fab fa-linkedin', color: '#0A66C2', category: 'professional' },
            { name: 'Reddit', url: 'https://reddit.com/user/{username}', icon: 'fab fa-reddit', color: '#FF4500', category: 'social' },
            { name: 'TikTok', url: 'https://tiktok.com/@{username}', icon: 'fab fa-tiktok', color: '#000', category: 'social' },
            { name: 'YouTube', url: 'https://youtube.com/@{username}', icon: 'fab fa-youtube', color: '#FF0000', category: 'social' },
            { name: 'Twitch', url: 'https://twitch.tv/{username}', icon: 'fab fa-twitch', color: '#9146FF', category: 'streaming' },
            { name: 'Medium', url: 'https://medium.com/@{username}', icon: 'fab fa-medium', color: '#000', category: 'blogging' },
            { name: 'Dev.to', url: 'https://dev.to/{username}', icon: 'fab fa-dev', color: '#0A0A0A', category: 'development' }
        ];
    }
    
    async checkPlatform(platform, username) {
        const url = platform.url.replace('{username}', username);
        const startTime = Date.now();
        
        const result = {
            platform: platform.name,
            url: url,
            icon: platform.icon,
            color: platform.color,
            category: platform.category,
            status: 'checking',
            responseTime: 0
        };
        
        try {
            // Use a CORS proxy or the backend API
            const response = await fetch(`${this.apiBase}/check?url=${encodeURIComponent(url)}`, {
                method: 'GET',
                signal: AbortSignal.timeout(10000)
            });
            
            const data = await response.json();
            result.status = data.exists ? 'found' : 'not-found';
            result.responseTime = Date.now() - startTime;
            
        } catch (error) {
            // If API check fails, mark as needs manual verification
            result.status = 'error';
            result.error = error.message;
            result.responseTime = Date.now() - startTime;
        }
        
        return result;
    }
    
    handleSearchUpdate(data) {
        switch (data.type) {
            case 'progress':
                this.updateProgress(data.completed, data.total);
                this.currentPlatform.textContent = `Checking ${data.platform}...`;
                break;
            case 'result':
                this.results.push(data.result);
                this.renderResult(data.result);
                this.updateStats();
                break;
            case 'complete':
                this.onSearchComplete(data.username);
                break;
            case 'error':
                this.showNotification(data.message, 'error');
                break;
        }
    }
    
    updateProgress(completed, total) {
        const percentage = (completed / total) * 100;
        this.progressFill.style.width = `${percentage}%`;
        this.progressCount.textContent = `${completed} / ${total}`;
    }
    
    updateStats() {
        const found = this.results.filter(r => r.status === 'found').length;
        const notFound = this.results.filter(r => r.status === 'not-found').length;
        const errors = this.results.filter(r => r.status === 'error').length;
        
        this.foundCount.textContent = found;
        this.notFoundCount.textContent = notFound;
        this.errorCount.textContent = errors;
        this.totalCount.textContent = this.results.length;
    }
    
    renderResult(result) {
        const card = document.createElement('div');
        card.className = `result-card ${result.status}`;
        card.dataset.category = result.category;
        card.dataset.status = result.status;
        
        card.innerHTML = `
            <div class="result-icon" style="background: ${result.color}20; color: ${result.color}">
                <i class="${result.icon}"></i>
            </div>
            <div class="result-info">
                <h4>${result.platform}</h4>
                <span class="url">${result.url}</span>
            </div>
            <div class="result-status">
                <span class="status-badge ${result.status}">
                    ${result.status === 'found' ? 'Found' : 
                      result.status === 'not-found' ? 'Not Found' : 
                      result.status === 'checking' ? 'Checking...' : 'Error'}
                </span>
                ${result.status === 'found' ? 
                    `<a href="${result.url}" target="_blank" rel="noopener" class="result-link">
                        <i class="fas fa-external-link-alt"></i> Visit
                    </a>` : ''}
            </div>
        `;
        
        this.resultsGrid.appendChild(card);
    }
    
    generateSearchEngineLinks(username) {
        this.searchEngineResults.classList.remove('hidden');
        
        const searchEngines = [
            { name: 'Google', icon: 'fab fa-google', color: '#4285F4', url: `https://www.google.com/search?q="${username}"` },
            { name: 'Yandex', icon: 'fab fa-yandex', color: '#FF0000', url: `https://yandex.com/search/?text="${username}"` },
            { name: 'DuckDuckGo', icon: 'fas fa-search', color: '#DE5833', url: `https://duckduckgo.com/?q="${username}"` },
            { name: 'Bing', icon: 'fab fa-microsoft', color: '#00809D', url: `https://www.bing.com/search?q="${username}"` },
            { name: 'Google Images', icon: 'fas fa-images', color: '#4285F4', url: `https://www.google.com/search?tbm=isch&q="${username}"` },
            { name: 'Yandex Images', icon: 'fas fa-image', color: '#FF0000', url: `https://yandex.com/images/search?text="${username}"` }
        ];
        
        this.searchEngineGrid.innerHTML = searchEngines.map(engine => `
            <a href="${engine.url}" target="_blank" rel="noopener" class="search-engine-card">
                <h4>
                    <i class="${engine.icon}" style="color: ${engine.color}"></i>
                    ${engine.name}
                </h4>
                <p>Search for "${username}" on ${engine.name}</p>
            </a>
        `).join('');
    }
    
    onSearchComplete(username) {
        this.currentPlatform.textContent = 'Search complete!';
        this.updateStats();
        this.saveToHistory(username);
        this.showNotification(`Search complete! Found ${this.results.filter(r => r.status === 'found').length} matches.`, 'success');
    }
    
    filterResults() {
        const filter = this.resultFilter.value;
        const cards = this.resultsGrid.querySelectorAll('.result-card');
        
        cards.forEach(card => {
            if (filter === 'all' || card.dataset.status === filter) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }
    
    switchCategory(activeTab) {
        this.categoryTabs.forEach(tab => tab.classList.remove('active'));
        activeTab.classList.add('active');
        
        const category = activeTab.dataset.category;
        const cards = this.resultsGrid.querySelectorAll('.result-card');
        
        cards.forEach(card => {
            if (category === 'all' || card.dataset.category === category) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }
    
    exportJSON() {
        const data = {
            username: this.searchedUsername.textContent,
            timestamp: new Date().toISOString(),
            results: this.results,
            stats: {
                found: this.results.filter(r => r.status === 'found').length,
                notFound: this.results.filter(r => r.status === 'not-found').length,
                errors: this.results.filter(r => r.status === 'error').length,
                total: this.results.length
            }
        };
        
        this.downloadFile(
            JSON.stringify(data, null, 2),
            `osint-${this.searchedUsername.textContent}-${Date.now()}.json`,
            'application/json'
        );
    }
    
    exportCSV() {
        const headers = ['Platform', 'URL', 'Status', 'Category', 'Response Time (ms)'];
        const rows = this.results.map(r => [
            r.platform,
            r.url,
            r.status,
            r.category,
            r.responseTime
        ]);
        
        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        this.downloadFile(
            csv,
            `osint-${this.searchedUsername.textContent}-${Date.now()}.csv`,
            'text/csv'
        );
    }
    
    downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    saveToHistory(username) {
        const entry = {
            username,
            timestamp: Date.now(),
            found: this.results.filter(r => r.status === 'found').length,
            total: this.results.length
        };
        
        this.searchHistory.unshift(entry);
        this.searchHistory = this.searchHistory.slice(0, 50); // Keep last 50
        localStorage.setItem('osint_history', JSON.stringify(this.searchHistory));
    }
    
    loadHistory() {
        try {
            const stored = localStorage.getItem('osint_history');
            this.searchHistory = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.searchHistory = [];
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 
                              type === 'error' ? 'times-circle' : 
                              type === 'warning' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        // Add styles if not present
        if (!document.querySelector('.notification-styles')) {
            const style = document.createElement('style');
            style.className = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    padding: 1rem 1.5rem;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    z-index: 1001;
                    animation: slideIn 0.3s ease;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                .notification-success { background: #22c55e; color: white; }
                .notification-error { background: #ef4444; color: white; }
                .notification-warning { background: #f59e0b; color: white; }
                .notification-info { background: #6366f1; color: white; }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.osintApp = new UsernameOSINT();
});
