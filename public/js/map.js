/**
 * OSINT Playground - GeoInt Map Module
 * Leaflet-based intelligence mapping with dark theme
 */

class OSINTMap {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = [];
        this.layers = {};
        this.entityClusters = {};
        this.heatmapLayer = null;
        this.connectionLines = [];
        
        // Custom icons for different entity types
        this.iconTypes = {
            person: { color: '#00fff5', icon: 'fa-user' },
            organization: { color: '#bf00ff', icon: 'fa-building' },
            school: { color: '#00a8ff', icon: 'fa-graduation-cap' },
            infrastructure: { color: '#ff6b00', icon: 'fa-server' },
            event: { color: '#ff00ff', icon: 'fa-calendar' },
            threat: { color: '#ff0040', icon: 'fa-exclamation-triangle' },
            ip: { color: '#ffff00', icon: 'fa-network-wired' },
            camera: { color: '#39ff14', icon: 'fa-video' }
        };
        
        this.init();
    }
    
    init() {
        // Initialize map with dark theme
        this.map = L.map(this.containerId, {
            center: [20, 0],
            zoom: 2,
            minZoom: 2,
            maxZoom: 18,
            zoomControl: false,
            attributionControl: false
        });
        
        // Dark map tiles (CartoDB Dark Matter)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);
        
        // Add zoom control to bottom right
        L.control.zoom({
            position: 'bottomright'
        }).addTo(this.map);
        
        // Initialize layer groups
        this.layers = {
            entities: L.layerGroup().addTo(this.map),
            connections: L.layerGroup().addTo(this.map),
            heatmap: L.layerGroup(),
            infrastructure: L.layerGroup().addTo(this.map)
        };
        
        // Add scale
        L.control.scale({
            position: 'bottomleft',
            imperial: false
        }).addTo(this.map);
        
        // Custom attribution
        const attribution = L.control({ position: 'bottomleft' });
        attribution.onAdd = () => {
            const div = L.DomUtil.create('div', 'map-attribution');
            div.innerHTML = '<span style="color: #52525b; font-size: 10px;">GeoInt Module | OSINT Playground</span>';
            return div;
        };
        attribution.addTo(this.map);
        
        // Setup click handler
        this.map.on('click', (e) => this.handleMapClick(e));
    }
    
    createIcon(type, size = 30) {
        const config = this.iconTypes[type] || this.iconTypes.person;
        
        return L.divIcon({
            className: 'custom-marker',
            html: `
                <div class="marker-container" style="
                    width: ${size}px;
                    height: ${size}px;
                    background: ${config.color}22;
                    border: 2px solid ${config.color};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 0 15px ${config.color}66;
                ">
                    <i class="fas ${config.icon}" style="color: ${config.color}; font-size: ${size * 0.4}px;"></i>
                </div>
                <div class="marker-pulse" style="
                    position: absolute;
                    width: ${size}px;
                    height: ${size}px;
                    border: 2px solid ${config.color};
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                    top: 0;
                    left: 0;
                "></div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -size / 2]
        });
    }
    
    addEntity(entity) {
        if (!entity.lat || !entity.lng) return null;
        
        const icon = this.createIcon(entity.type || 'person', entity.size || 30);
        
        const marker = L.marker([entity.lat, entity.lng], { icon })
            .addTo(this.layers.entities);
        
        // Create popup content
        const popup = this.createPopup(entity);
        marker.bindPopup(popup, {
            className: 'dark-popup',
            maxWidth: 300
        });
        
        // Store reference
        marker.entityData = entity;
        this.markers.push(marker);
        
        // Emit event
        const event = new CustomEvent('entityPlotted', { detail: entity });
        document.dispatchEvent(event);
        
        return marker;
    }
    
    createPopup(entity) {
        const config = this.iconTypes[entity.type] || this.iconTypes.person;
        
        return `
            <div class="popup-content" style="
                font-family: 'Inter', sans-serif;
                min-width: 200px;
            ">
                <div class="popup-header" style="
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 12px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid #252535;
                ">
                    <div class="popup-icon" style="
                        width: 36px;
                        height: 36px;
                        background: ${config.color}22;
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">
                        <i class="fas ${config.icon}" style="color: ${config.color};"></i>
                    </div>
                    <div>
                        <div style="font-weight: 600; color: #e4e4e7;">${entity.label || entity.id}</div>
                        <div style="font-size: 11px; color: #a1a1aa; text-transform: uppercase;">${entity.type}</div>
                    </div>
                </div>
                
                ${entity.address ? `
                    <div class="popup-row" style="margin-bottom: 8px; font-size: 12px;">
                        <i class="fas fa-map-marker-alt" style="color: #ff0040; width: 16px;"></i>
                        <span style="color: #a1a1aa;">${entity.address}</span>
                    </div>
                ` : ''}
                
                ${entity.description ? `
                    <div class="popup-desc" style="
                        font-size: 12px;
                        color: #a1a1aa;
                        line-height: 1.5;
                        margin-bottom: 12px;
                    ">${entity.description}</div>
                ` : ''}
                
                ${entity.confidence ? `
                    <div class="popup-confidence" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 12px;
                    ">
                        <span style="font-size: 11px; color: #52525b;">Confidence</span>
                        <div style="
                            flex: 1;
                            height: 4px;
                            background: #252535;
                            border-radius: 2px;
                            overflow: hidden;
                        ">
                            <div style="
                                width: ${entity.confidence * 100}%;
                                height: 100%;
                                background: ${config.color};
                            "></div>
                        </div>
                        <span style="font-size: 11px; color: ${config.color};">${Math.round(entity.confidence * 100)}%</span>
                    </div>
                ` : ''}
                
                <div class="popup-actions" style="
                    display: flex;
                    gap: 8px;
                ">
                    <button onclick="osintMap.focusEntity('${entity.id}')" style="
                        flex: 1;
                        padding: 8px;
                        background: transparent;
                        border: 1px solid #252535;
                        border-radius: 6px;
                        color: #a1a1aa;
                        font-size: 11px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-search-plus"></i> Focus
                    </button>
                    <button onclick="osintMap.showConnections('${entity.id}')" style="
                        flex: 1;
                        padding: 8px;
                        background: ${config.color}22;
                        border: 1px solid ${config.color}44;
                        border-radius: 6px;
                        color: ${config.color};
                        font-size: 11px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-project-diagram"></i> Links
                    </button>
                </div>
            </div>
        `;
    }
    
    addConnection(from, to, options = {}) {
        const fromMarker = this.markers.find(m => m.entityData?.id === from);
        const toMarker = this.markers.find(m => m.entityData?.id === to);
        
        if (!fromMarker || !toMarker) return null;
        
        const color = options.color || '#00fff5';
        const weight = options.weight || 2;
        const dashArray = options.dashed ? '5, 10' : null;
        
        // Create curved line
        const latlngs = [
            fromMarker.getLatLng(),
            toMarker.getLatLng()
        ];
        
        // Calculate control point for curve
        const midLat = (latlngs[0].lat + latlngs[1].lat) / 2;
        const midLng = (latlngs[0].lng + latlngs[1].lng) / 2;
        const offset = Math.sqrt(
            Math.pow(latlngs[1].lat - latlngs[0].lat, 2) +
            Math.pow(latlngs[1].lng - latlngs[0].lng, 2)
        ) * 0.2;
        
        // Add slight curve
        const angle = Math.atan2(
            latlngs[1].lng - latlngs[0].lng,
            latlngs[1].lat - latlngs[0].lat
        ) + Math.PI / 2;
        
        const controlPoint = [
            midLat + Math.cos(angle) * offset,
            midLng + Math.sin(angle) * offset
        ];
        
        // Create polyline with arrow
        const line = L.polyline([latlngs[0], controlPoint, latlngs[1]], {
            color: color,
            weight: weight,
            opacity: 0.7,
            dashArray: dashArray,
            className: 'connection-line'
        }).addTo(this.layers.connections);
        
        // Add animated flow effect
        if (options.animated) {
            line.setStyle({
                dashArray: '10, 20',
                dashOffset: 0
            });
            
            let offset = 0;
            setInterval(() => {
                offset = (offset + 1) % 30;
                line.setStyle({ dashOffset: offset });
            }, 50);
        }
        
        this.connectionLines.push({
            from,
            to,
            line,
            options
        });
        
        return line;
    }
    
    focusEntity(entityId) {
        const marker = this.markers.find(m => m.entityData?.id === entityId);
        if (!marker) return;
        
        this.map.flyTo(marker.getLatLng(), 15, {
            duration: 1.5
        });
        
        marker.openPopup();
    }
    
    showConnections(entityId) {
        // Highlight connections for this entity
        this.connectionLines.forEach(conn => {
            if (conn.from === entityId || conn.to === entityId) {
                conn.line.setStyle({
                    color: '#ff00ff',
                    weight: 3,
                    opacity: 1
                });
            } else {
                conn.line.setStyle({
                    opacity: 0.2
                });
            }
        });
        
        // Reset after 5 seconds
        setTimeout(() => {
            this.connectionLines.forEach(conn => {
                conn.line.setStyle({
                    color: conn.options.color || '#00fff5',
                    weight: conn.options.weight || 2,
                    opacity: 0.7
                });
            });
        }, 5000);
    }
    
    fitToEntities() {
        if (this.markers.length === 0) return;
        
        const group = L.featureGroup(this.markers);
        this.map.fitBounds(group.getBounds(), {
            padding: [50, 50],
            maxZoom: 12
        });
    }
    
    addHeatmap(points) {
        if (!points || points.length === 0) return;
        
        // Simple heatmap using circles
        points.forEach(point => {
            const intensity = point.intensity || 0.5;
            const radius = point.radius || 50000;
            
            L.circle([point.lat, point.lng], {
                radius: radius,
                fillColor: '#ff0040',
                fillOpacity: intensity * 0.3,
                stroke: false
            }).addTo(this.layers.heatmap);
        });
        
        this.layers.heatmap.addTo(this.map);
    }
    
    toggleLayer(layerName, visible) {
        if (!this.layers[layerName]) return;
        
        if (visible) {
            this.layers[layerName].addTo(this.map);
        } else {
            this.map.removeLayer(this.layers[layerName]);
        }
    }
    
    setLayer(type) {
        // Remove existing tile layer
        this.map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                this.map.removeLayer(layer);
            }
        });
        
        // Add new tile layer based on type
        let tileUrl, attribution;
        
        switch(type) {
            case 'satellite':
                tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
                attribution = 'Tiles &copy; Esri';
                break;
            case 'dark':
                tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
                attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
                break;
            case 'default':
            default:
                tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
                attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
        }
        
        L.tileLayer(tileUrl, {
            attribution: attribution,
            maxZoom: 19
        }).addTo(this.map);
    }
    
    async searchLocation(query) {
        if (!query) return;
        
        try {
            const results = await this.geocode(query);
            if (results && results.length > 0) {
                const first = results[0];
                this.map.setView([first.lat, first.lon], 12);
                
                // Add a search marker
                this.addEntity({
                    id: 'search-' + Date.now(),
                    lat: first.lat,
                    lng: first.lon,
                    name: first.display_name,
                    type: 'location',
                    description: 'Search result'
                });
                
                return results;
            }
        } catch (error) {
            console.error('Location search error:', error);
        }
        return [];
    }
    
    getCountryCount() {
        // Get unique countries from markers
        const countries = new Set();
        this.markers.forEach(marker => {
            if (marker.entityData?.country) {
                countries.add(marker.entityData.country);
            }
        });
        return countries.size;
    }
    
    async geocode(query) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
                {
                    headers: {
                        'User-Agent': 'OSINTPlayground/1.0'
                    }
                }
            );
            
            if (!response.ok) throw new Error('Geocoding failed');
            
            const results = await response.json();
            return results.map(r => ({
                lat: parseFloat(r.lat),
                lng: parseFloat(r.lon),
                label: r.display_name,
                type: r.type,
                importance: r.importance
            }));
        } catch (error) {
            console.error('Geocoding error:', error);
            return [];
        }
    }
    
    async reverseGeocode(lat, lng) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                {
                    headers: {
                        'User-Agent': 'OSINTPlayground/1.0'
                    }
                }
            );
            
            if (!response.ok) throw new Error('Reverse geocoding failed');
            
            const result = await response.json();
            return {
                address: result.display_name,
                details: result.address
            };
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            return null;
        }
    }
    
    handleMapClick(e) {
        const event = new CustomEvent('mapClicked', {
            detail: {
                lat: e.latlng.lat,
                lng: e.latlng.lng
            }
        });
        document.dispatchEvent(event);
    }
    
    async searchNearby(lat, lng, type, radius = 1000) {
        // Use Overpass API for OSM data
        const query = `
            [out:json][timeout:25];
            (
                node["${type}"](around:${radius},${lat},${lng});
                way["${type}"](around:${radius},${lat},${lng});
            );
            out body center;
        `;
        
        try {
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: query
            });
            
            if (!response.ok) throw new Error('Overpass API error');
            
            const data = await response.json();
            return data.elements.map(el => ({
                id: el.id,
                lat: el.lat || el.center?.lat,
                lng: el.lon || el.center?.lon,
                name: el.tags?.name,
                type: type,
                tags: el.tags
            }));
        } catch (error) {
            console.error('Nearby search error:', error);
            return [];
        }
    }
    
    clear() {
        this.markers.forEach(m => m.remove());
        this.markers = [];
        this.connectionLines.forEach(c => c.line.remove());
        this.connectionLines = [];
        
        Object.values(this.layers).forEach(layer => layer.clearLayers());
    }
    
    exportAsImage() {
        // Return map canvas as image
        // Note: requires leaflet-image plugin in production
        return this.map.getContainer().innerHTML;
    }
}

// Add pulse animation CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.5); opacity: 0; }
        100% { transform: scale(1); opacity: 0; }
    }
    
    .marker-pulse {
        pointer-events: none;
    }
    
    .leaflet-popup-content-wrapper {
        background: #12121a !important;
        border: 1px solid #252535 !important;
        border-radius: 12px !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5) !important;
    }
    
    .leaflet-popup-tip {
        background: #12121a !important;
        border: 1px solid #252535 !important;
    }
    
    .leaflet-popup-close-button {
        color: #a1a1aa !important;
    }
    
    .leaflet-container {
        background: #0a0a0f !important;
    }
`;
document.head.appendChild(style);

// Export for use
window.OSINTMap = OSINTMap;
