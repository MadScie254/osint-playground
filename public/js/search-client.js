/**
 * OSINT Playground - Search Client
 * Frontend module for streaming search with live progress,
 * debounced input, and confidence scoring
 */

class OSINTSearchClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '';
        this.debounceDelay = options.debounceDelay || 300;
        this.minQueryLength = options.minQueryLength || 2;
        this.maxResults = options.maxResults || 100;
        
        // State
        this.currentScan = null;
        this.eventSource = null;
        this.debounceTimer = null;
        this.results = [];
        this.isScanning = false;
        
        // Callbacks
        this.onProgress = options.onProgress || (() => {});
        this.onResult = options.onResult || (() => {});
        this.onComplete = options.onComplete || (() => {});
        this.onError = options.onError || (() => {});
        this.onStart = options.onStart || (() => {});
        
        // DOM elements
        this.elements = {};
        
        // Initialize if autoInit is true
        if (options.autoInit !== false) {
            this.init();
        }
    }
    
    /**
     * Initialize the search client
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadAdapters();
        console.log('[SearchClient] Initialized');
    }
    
    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            searchInput: document.getElementById('searchInput') || document.querySelector('[data-search-input]'),
            searchButton: document.getElementById('searchBtn') || document.querySelector('[data-search-btn]'),
            resultsContainer: document.getElementById('searchResults') || document.querySelector('[data-search-results]'),
            progressBar: document.getElementById('scanProgress') || document.querySelector('[data-scan-progress]'),
            progressText: document.getElementById('progressText') || document.querySelector('[data-progress-text]'),
            statsContainer: document.getElementById('scanStats') || document.querySelector('[data-scan-stats]'),
            filterContainer: document.getElementById('platformFilters') || document.querySelector('[data-platform-filters]'),
            advancedToggle: document.querySelector('[data-advanced-toggle]'),
            advancedPanel: document.querySelector('[data-advanced-panel]')
        };
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Search input with debounce
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => {
                this.debouncedSearch(e.target.value);
            });
            
            this.elements.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.startScan(e.target.value);
                }
            });
        }
        
        // Search button
        if (this.elements.searchButton) {
            this.elements.searchButton.addEventListener('click', () => {
                const query = this.elements.searchInput?.value;
                if (query) {
                    this.startScan(query);
                }
            });
        }
        
        // Advanced toggle
        if (this.elements.advancedToggle && this.elements.advancedPanel) {
            this.elements.advancedToggle.addEventListener('click', () => {
                this.elements.advancedPanel.classList.toggle('hidden');
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+K or Cmd+K to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.elements.searchInput?.focus();
            }
            
            // Escape to cancel scan
            if (e.key === 'Escape' && this.isScanning) {
                this.cancelScan();
            }
        });
    }
    
    /**
     * Load available adapters
     */
    async loadAdapters() {
        try {
            const response = await fetch(`${this.baseUrl}/api/adapters`);
            const data = await response.json();
            this.adapters = data.adapters || [];
            this.renderFilters();
        } catch (error) {
            console.error('[SearchClient] Failed to load adapters:', error);
        }
    }
    
    /**
     * Render platform filters
     */
    renderFilters() {
        if (!this.elements.filterContainer || !this.adapters) return;
        
        const html = this.adapters.map(adapter => `
            <label class="filter-chip" data-adapter="${adapter.name}">
                <input type="checkbox" name="adapter" value="${adapter.name}" checked>
                <span class="chip-label">${this.formatAdapterName(adapter.name)}</span>
            </label>
        `).join('');
        
        this.elements.filterContainer.innerHTML = html;
    }
    
    formatAdapterName(name) {
        return name.charAt(0).toUpperCase() + name.slice(1);
    }
    
    /**
     * Debounced search (for autocomplete/suggestions)
     */
    debouncedSearch(query) {
        clearTimeout(this.debounceTimer);
        
        if (!query || query.length < this.minQueryLength) {
            return;
        }
        
        this.debounceTimer = setTimeout(() => {
            // Could implement autocomplete here
            console.log('[SearchClient] Debounced query:', query);
        }, this.debounceDelay);
    }
    
    /**
     * Get selected adapters
     */
    getSelectedAdapters() {
        if (!this.elements.filterContainer) return null;
        
        const checkboxes = this.elements.filterContainer.querySelectorAll('input[name="adapter"]:checked');
        if (checkboxes.length === 0 || checkboxes.length === this.adapters?.length) {
            return null; // All or none = search all
        }
        
        return Array.from(checkboxes).map(cb => cb.value);
    }
    
    /**
     * Start a new scan
     */
    async startScan(query) {
        if (!query || query.length < this.minQueryLength) {
            return;
        }
        
        // Cancel existing scan
        if (this.isScanning) {
            this.cancelScan();
        }
        
        this.isScanning = true;
        this.results = [];
        this.onStart({ query });
        
        // Update UI
        this.updateProgress(0, 'Initializing scan...');
        this.clearResults();
        this.setLoading(true);
        
        try {
            // Start the scan
            const response = await fetch(`${this.baseUrl}/api/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query.trim(),
                    adapters: this.getSelectedAdapters()
                })
            });
            
            if (!response.ok) {
                throw new Error(`Scan failed: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.currentScan = data;
            
            // Connect to SSE stream
            this.connectStream(data.scanId);
            
        } catch (error) {
            this.handleError(error);
        }
    }
    
    /**
     * Connect to SSE stream for live results
     */
    connectStream(scanId) {
        if (this.eventSource) {
            this.eventSource.close();
        }
        
        this.eventSource = new EventSource(`${this.baseUrl}/api/scan/${scanId}/stream`);
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleStreamEvent(data);
            } catch (error) {
                console.error('[SearchClient] Failed to parse SSE data:', error);
            }
        };
        
        this.eventSource.onerror = (error) => {
            console.error('[SearchClient] SSE error:', error);
            this.eventSource.close();
            
            // If not complete yet, try to fetch final results
            if (this.isScanning) {
                this.fetchFinalResults(scanId);
            }
        };
    }
    
    /**
     * Handle SSE events
     */
    handleStreamEvent(data) {
        switch (data.type) {
            case 'init':
                console.log('[SearchClient] Stream initialized:', data);
                break;
                
            case 'progress':
                this.updateProgress(data.progress, `Scanning ${data.adapter}...`);
                this.onProgress(data);
                break;
                
            case 'result':
                this.addResult(data.result);
                this.onResult(data.result);
                break;
                
            case 'complete':
                this.handleComplete(data.scan);
                break;
                
            case 'error':
                console.warn(`[SearchClient] Adapter error (${data.adapter}):`, data.error);
                break;
        }
    }
    
    /**
     * Fetch final results if stream fails
     */
    async fetchFinalResults(scanId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/scan/${scanId}`);
            const scan = await response.json();
            
            if (scan.status === 'completed') {
                this.handleComplete(scan);
            } else if (scan.status === 'error') {
                this.handleError(new Error('Scan failed'));
            }
        } catch (error) {
            this.handleError(error);
        }
    }
    
    /**
     * Handle scan completion
     */
    handleComplete(scan) {
        this.isScanning = false;
        this.eventSource?.close();
        this.setLoading(false);
        
        // Merge any missing results
        if (scan.results) {
            scan.results.forEach(result => {
                if (!this.results.find(r => r.id === result.id)) {
                    this.addResult(result, false);
                }
            });
        }
        
        // Sort by confidence
        this.results.sort((a, b) => b.confidence - a.confidence);
        this.renderAllResults();
        
        // Update progress
        this.updateProgress(100, `Scan complete - ${scan.stats?.uniqueResults || 0} results found`);
        this.updateStats(scan.stats, scan.duration);
        
        this.onComplete(scan);
    }
    
    /**
     * Add a result to the list
     */
    addResult(result, render = true) {
        // Dedupe
        if (this.results.find(r => r.id === result.id)) {
            return;
        }
        
        this.results.push(result);
        
        if (render && this.results.length <= this.maxResults) {
            this.renderResult(result);
        }
    }
    
    /**
     * Render a single result
     */
    renderResult(result) {
        if (!this.elements.resultsContainer) return;
        
        const resultEl = document.createElement('div');
        resultEl.className = `result-card result-${result.confidenceLevel || 'medium'}`;
        resultEl.dataset.resultId = result.id;
        resultEl.dataset.source = result.source;
        resultEl.dataset.confidence = result.confidence;
        
        resultEl.innerHTML = this.getResultHTML(result);
        
        // Animate in
        resultEl.style.opacity = '0';
        resultEl.style.transform = 'translateY(10px)';
        
        this.elements.resultsContainer.appendChild(resultEl);
        
        requestAnimationFrame(() => {
            resultEl.style.transition = 'opacity 0.3s, transform 0.3s';
            resultEl.style.opacity = '1';
            resultEl.style.transform = 'translateY(0)';
        });
    }
    
    /**
     * Render all results (after sort)
     */
    renderAllResults() {
        if (!this.elements.resultsContainer) return;
        
        this.clearResults();
        
        this.results.slice(0, this.maxResults).forEach(result => {
            this.renderResult(result);
        });
    }
    
    /**
     * Get HTML for a result card
     */
    getResultHTML(result) {
        const confidencePercent = Math.round(result.confidence * 100);
        const confidenceClass = this.getConfidenceClass(result.confidence);
        
        return `
            <div class="result-header">
                <div class="result-source">
                    <span class="source-icon">${this.getSourceIcon(result.source)}</span>
                    <span class="source-name">${this.formatAdapterName(result.source)}</span>
                </div>
                <div class="confidence-badge ${confidenceClass}">
                    <span class="confidence-value">${confidencePercent}%</span>
                    ${result.verified ? '<span class="verified-badge" title="Verified">✓</span>' : ''}
                </div>
            </div>
            
            <div class="result-content">
                ${result.avatar ? `<img src="${result.avatar}" alt="" class="result-avatar" loading="lazy" onerror="this.style.display='none'">` : ''}
                
                <div class="result-details">
                    ${result.username ? `<div class="result-username">@${result.username}</div>` : ''}
                    ${result.displayName ? `<div class="result-name">${result.displayName}</div>` : ''}
                    ${result.bio ? `<div class="result-bio">${this.truncate(result.bio, 120)}</div>` : ''}
                    ${result.location ? `<div class="result-location"><i class="fa-solid fa-location-dot"></i> ${result.location}</div>` : ''}
                    ${result.email ? `<div class="result-email"><i class="fa-solid fa-envelope"></i> ${result.email}</div>` : ''}
                </div>
            </div>
            
            ${this.getResultMetaHTML(result)}
            
            <div class="result-actions">
                ${result.url ? `<a href="${result.url}" target="_blank" rel="noopener" class="btn-result-action primary">
                    <i class="fa-solid fa-external-link-alt"></i> View Profile
                </a>` : ''}
                <button class="btn-result-action" onclick="osintSearch.addToGraph('${result.id}')">
                    <i class="fa-solid fa-diagram-project"></i> Add to Graph
                </button>
                <button class="btn-result-action" onclick="osintSearch.exportResult('${result.id}')">
                    <i class="fa-solid fa-download"></i> Export
                </button>
            </div>
        `;
    }
    
    /**
     * Get meta information HTML
     */
    getResultMetaHTML(result) {
        const meta = [];
        
        if (result.followers !== undefined) meta.push(`<span><i class="fa-solid fa-users"></i> ${this.formatNumber(result.followers)}</span>`);
        if (result.karma !== undefined) meta.push(`<span><i class="fa-solid fa-star"></i> ${this.formatNumber(result.karma)}</span>`);
        if (result.publicRepos !== undefined) meta.push(`<span><i class="fa-solid fa-code"></i> ${result.publicRepos} repos</span>`);
        if (result.createdAt) meta.push(`<span><i class="fa-solid fa-calendar"></i> ${this.formatDate(result.createdAt)}</span>`);
        
        if (meta.length === 0) return '';
        
        return `<div class="result-meta">${meta.join('')}</div>`;
    }
    
    /**
     * Get confidence class
     */
    getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'confidence-high';
        if (confidence >= 0.5) return 'confidence-medium';
        return 'confidence-low';
    }
    
    /**
     * Get source icon
     */
    getSourceIcon(source) {
        const icons = {
            github: '<i class="fa-brands fa-github"></i>',
            reddit: '<i class="fa-brands fa-reddit"></i>',
            gitlab: '<i class="fa-brands fa-gitlab"></i>',
            twitter: '<i class="fa-brands fa-x-twitter"></i>',
            instagram: '<i class="fa-brands fa-instagram"></i>',
            linkedin: '<i class="fa-brands fa-linkedin"></i>',
            keybase: '<i class="fa-solid fa-key"></i>',
            hackernews: '<i class="fa-brands fa-hacker-news"></i>',
            shodan: '<i class="fa-solid fa-radar"></i>',
            hunter: '<i class="fa-solid fa-envelope-circle-check"></i>',
            direct: '<i class="fa-solid fa-globe"></i>',
            searchengine: '<i class="fa-solid fa-magnifying-glass"></i>'
        };
        return icons[source] || '<i class="fa-solid fa-circle-info"></i>';
    }
    
    /**
     * Update progress bar
     */
    updateProgress(percent, text) {
        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = `${percent}%`;
            this.elements.progressBar.setAttribute('aria-valuenow', percent);
        }
        
        if (this.elements.progressText) {
            this.elements.progressText.textContent = text || `${percent}%`;
        }
    }
    
    /**
     * Update stats display
     */
    updateStats(stats, duration) {
        if (!this.elements.statsContainer || !stats) return;
        
        this.elements.statsContainer.innerHTML = `
            <div class="stat-item">
                <span class="stat-value">${stats.totalSources}</span>
                <span class="stat-label">Sources</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.uniqueResults}</span>
                <span class="stat-label">Results</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${this.formatDuration(duration)}</span>
                <span class="stat-label">Duration</span>
            </div>
        `;
    }
    
    /**
     * Clear results container
     */
    clearResults() {
        if (this.elements.resultsContainer) {
            this.elements.resultsContainer.innerHTML = '';
        }
    }
    
    /**
     * Set loading state
     */
    setLoading(loading) {
        if (this.elements.searchButton) {
            this.elements.searchButton.disabled = loading;
            this.elements.searchButton.innerHTML = loading 
                ? '<i class="fa-solid fa-spinner fa-spin"></i> Scanning...'
                : '<i class="fa-solid fa-search"></i> Search';
        }
        
        if (this.elements.searchInput) {
            this.elements.searchInput.disabled = loading;
        }
        
        document.body.classList.toggle('scanning', loading);
    }
    
    /**
     * Cancel current scan
     */
    cancelScan() {
        this.isScanning = false;
        
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        
        this.setLoading(false);
        this.updateProgress(0, 'Scan cancelled');
    }
    
    /**
     * Handle errors
     */
    handleError(error) {
        this.isScanning = false;
        this.setLoading(false);
        this.updateProgress(0, `Error: ${error.message}`);
        this.onError(error);
        
        console.error('[SearchClient] Error:', error);
    }
    
    /**
     * Add result to graph visualization
     */
    addToGraph(resultId) {
        const result = this.results.find(r => r.id === resultId);
        if (!result) return;
        
        // Emit event for graph integration
        window.dispatchEvent(new CustomEvent('osint:addToGraph', { detail: result }));
    }
    
    /**
     * Export single result
     */
    exportResult(resultId) {
        const result = this.results.find(r => r.id === resultId);
        if (!result) return;
        
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `osint-result-${result.source}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    /**
     * Export all results
     */
    exportAll(format = 'json') {
        if (this.results.length === 0) return;
        
        let content, mimeType, extension;
        
        if (format === 'csv') {
            content = this.resultsToCSV();
            mimeType = 'text/csv';
            extension = 'csv';
        } else {
            content = JSON.stringify({
                query: this.currentScan?.query,
                timestamp: new Date().toISOString(),
                totalResults: this.results.length,
                results: this.results
            }, null, 2);
            mimeType = 'application/json';
            extension = 'json';
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `osint-scan-${this.currentScan?.query || 'export'}-${Date.now()}.${extension}`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    /**
     * Convert results to CSV
     */
    resultsToCSV() {
        const headers = ['Source', 'Username', 'Display Name', 'URL', 'Email', 'Location', 'Confidence', 'Verified'];
        const rows = this.results.map(r => [
            r.source,
            r.username || '',
            r.displayName || '',
            r.url || '',
            r.email || '',
            r.location || '',
            Math.round(r.confidence * 100) + '%',
            r.verified ? 'Yes' : 'No'
        ]);
        
        return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    }
    
    // Utility methods
    truncate(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    formatNumber(num) {
        if (!num) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }
    
    formatDate(dateStr) {
        try {
            return new Date(dateStr).toLocaleDateString();
        } catch {
            return dateStr;
        }
    }
    
    formatDuration(ms) {
        if (!ms) return '0s';
        if (ms < 1000) return ms + 'ms';
        if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
        return (ms / 60000).toFixed(1) + 'm';
    }
}

// Global instance
let osintSearch;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    osintSearch = new OSINTSearchClient({
        onProgress: (data) => {
            console.log('[OSINT] Progress:', data.progress + '%', data.adapter);
        },
        onResult: (result) => {
            console.log('[OSINT] New result:', result.source, result.username || result.url);
        },
        onComplete: (scan) => {
            console.log('[OSINT] Scan complete:', scan.stats?.uniqueResults, 'results in', scan.duration + 'ms');
        },
        onError: (error) => {
            console.error('[OSINT] Error:', error.message);
        }
    });
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OSINTSearchClient };
}
