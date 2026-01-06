/**
 * OSINT Playground - Entity Graph Visualization
 * Force-directed relationship graph using D3.js
 */

class OSINTGraph {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        
        this.nodes = [];
        this.links = [];
        this.nodeTypes = {
            person: { color: '#00fff5', icon: '\uf007', label: 'Person' },
            username: { color: '#ff00ff', icon: '\uf2c1', label: 'Username' },
            email: { color: '#39ff14', icon: '\uf0e0', label: 'Email' },
            phone: { color: '#ff6b00', icon: '\uf095', label: 'Phone' },
            domain: { color: '#00a8ff', icon: '\uf0ac', label: 'Domain' },
            ip: { color: '#ffff00', icon: '\uf233', label: 'IP Address' },
            organization: { color: '#bf00ff', icon: '\uf1ad', label: 'Organization' },
            location: { color: '#ff0040', icon: '\uf3c5', label: 'Location' },
            social: { color: '#00fff5', icon: '\uf1e0', label: 'Social Profile' },
            breach: { color: '#ff0040', icon: '\uf21b', label: 'Data Breach' },
            document: { color: '#a1a1aa', icon: '\uf15b', label: 'Document' },
            school: { color: '#00a8ff', icon: '\uf19d', label: 'School' },
            event: { color: '#ff6b00', icon: '\uf073', label: 'Event' }
        };
        
        this.simulation = null;
        this.svg = null;
        this.g = null;
        this.nodeGroup = null;
        this.linkGroup = null;
        this.zoom = null;
        this.selectedNode = null;
        
        this.init();
    }
    
    init() {
        // Clear container
        this.container.innerHTML = '';
        
        // Create SVG
        this.svg = d3.select('#' + this.containerId)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', [0, 0, this.width, this.height]);
        
        // Add defs for markers and gradients
        const defs = this.svg.append('defs');
        
        // Arrow marker for directed edges
        defs.append('marker')
            .attr('id', 'arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 25)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('fill', '#52525b')
            .attr('d', 'M0,-5L10,0L0,5');
        
        // Glow filter
        const filter = defs.append('filter')
            .attr('id', 'glow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');
        
        filter.append('feGaussianBlur')
            .attr('stdDeviation', '3')
            .attr('result', 'coloredBlur');
        
        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');
        
        // Main group for zoom/pan
        this.g = this.svg.append('g');
        
        // Link and node groups
        this.linkGroup = this.g.append('g').attr('class', 'links');
        this.nodeGroup = this.g.append('g').attr('class', 'nodes');
        
        // Setup zoom
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });
        
        this.svg.call(this.zoom);
        
        // Initialize force simulation
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink()
                .id(d => d.id)
                .distance(150)
                .strength(0.5))
            .force('charge', d3.forceManyBody()
                .strength(-300)
                .distanceMax(500))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide().radius(50))
            .on('tick', () => this.tick());
        
        // Handle window resize
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.svg.attr('viewBox', [0, 0, this.width, this.height]);
        this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
        this.simulation.alpha(0.3).restart();
    }
    
    addNode(node) {
        if (this.nodes.find(n => n.id === node.id)) return;
        
        const newNode = {
            id: node.id,
            label: node.label || node.id,
            type: node.type || 'person',
            confidence: node.confidence || 1,
            data: node.data || {},
            x: this.width / 2 + (Math.random() - 0.5) * 100,
            y: this.height / 2 + (Math.random() - 0.5) * 100
        };
        
        this.nodes.push(newNode);
        this.update();
        return newNode;
    }
    
    addLink(sourceId, targetId, options = {}) {
        const existing = this.links.find(l => 
            (l.source.id || l.source) === sourceId && 
            (l.target.id || l.target) === targetId
        );
        if (existing) return;
        
        const link = {
            source: sourceId,
            target: targetId,
            type: options.type || 'related',
            label: options.label || '',
            strength: options.strength || 0.5
        };
        
        this.links.push(link);
        this.update();
        return link;
    }
    
    update() {
        // Update links
        const link = this.linkGroup
            .selectAll('.link')
            .data(this.links, d => `${d.source.id || d.source}-${d.target.id || d.target}`);
        
        link.exit().remove();
        
        const linkEnter = link.enter()
            .append('g')
            .attr('class', 'link');
        
        linkEnter.append('line')
            .attr('stroke', '#52525b')
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.6)
            .attr('marker-end', 'url(#arrow)');
        
        linkEnter.append('text')
            .attr('class', 'link-label')
            .attr('fill', '#a1a1aa')
            .attr('font-size', '10px')
            .attr('text-anchor', 'middle')
            .text(d => d.label);
        
        // Update nodes
        const node = this.nodeGroup
            .selectAll('.node')
            .data(this.nodes, d => d.id);
        
        node.exit()
            .transition()
            .duration(300)
            .attr('opacity', 0)
            .remove();
        
        const nodeEnter = node.enter()
            .append('g')
            .attr('class', 'node')
            .attr('cursor', 'pointer')
            .call(this.drag())
            .on('click', (event, d) => this.selectNode(d))
            .on('dblclick', (event, d) => this.expandNode(d));
        
        // Node circle
        nodeEnter.append('circle')
            .attr('r', 20)
            .attr('fill', d => this.nodeTypes[d.type]?.color || '#00fff5')
            .attr('fill-opacity', 0.2)
            .attr('stroke', d => this.nodeTypes[d.type]?.color || '#00fff5')
            .attr('stroke-width', 2)
            .attr('filter', 'url(#glow)');
        
        // Node icon (using text as placeholder - in production would use proper icons)
        nodeEnter.append('text')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', d => this.nodeTypes[d.type]?.color || '#00fff5')
            .attr('font-family', 'Font Awesome 6 Free')
            .attr('font-size', '12px')
            .text(d => {
                const icons = {
                    person: '👤',
                    username: '@',
                    email: '✉',
                    phone: '☎',
                    domain: '🌐',
                    ip: '🔢',
                    organization: '🏢',
                    location: '📍',
                    social: '🔗',
                    breach: '⚠',
                    document: '📄',
                    school: '🎓',
                    event: '📅'
                };
                return icons[d.type] || '●';
            });
        
        // Node label
        nodeEnter.append('text')
            .attr('class', 'node-label')
            .attr('dy', 35)
            .attr('text-anchor', 'middle')
            .attr('fill', '#e4e4e7')
            .attr('font-size', '11px')
            .text(d => this.truncate(d.label, 15));
        
        // Confidence ring
        nodeEnter.append('circle')
            .attr('class', 'confidence-ring')
            .attr('r', 25)
            .attr('fill', 'none')
            .attr('stroke', d => this.nodeTypes[d.type]?.color || '#00fff5')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', d => {
                const circumference = 2 * Math.PI * 25;
                const filled = circumference * d.confidence;
                return `${filled} ${circumference - filled}`;
            })
            .attr('stroke-dashoffset', 2 * Math.PI * 25 * 0.25)
            .attr('opacity', 0.5);
        
        // Merge and update simulation
        this.simulation.nodes(this.nodes);
        this.simulation.force('link').links(this.links);
        this.simulation.alpha(0.5).restart();
    }
    
    tick() {
        // Update link positions
        this.linkGroup.selectAll('.link line')
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        this.linkGroup.selectAll('.link text')
            .attr('x', d => (d.source.x + d.target.x) / 2)
            .attr('y', d => (d.source.y + d.target.y) / 2);
        
        // Update node positions
        this.nodeGroup.selectAll('.node')
            .attr('transform', d => `translate(${d.x},${d.y})`);
    }
    
    drag() {
        const simulation = this.simulation;
        
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        
        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    }
    
    selectNode(node) {
        this.selectedNode = node;
        
        // Highlight selected node
        this.nodeGroup.selectAll('.node circle')
            .attr('stroke-width', d => d.id === node.id ? 4 : 2);
        
        // Emit event for details panel
        const event = new CustomEvent('nodeSelected', { detail: node });
        document.dispatchEvent(event);
    }
    
    expandNode(node) {
        // Emit event to request more data for this node
        const event = new CustomEvent('nodeExpand', { detail: node });
        document.dispatchEvent(event);
    }
    
    focusNode(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        const transform = d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(1.5)
            .translate(-node.x, -node.y);
        
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    }
    
    clear() {
        this.nodes = [];
        this.links = [];
        this.update();
    }
    
    exportData() {
        return {
            nodes: this.nodes.map(n => ({
                id: n.id,
                label: n.label,
                type: n.type,
                confidence: n.confidence,
                data: n.data
            })),
            links: this.links.map(l => ({
                source: l.source.id || l.source,
                target: l.target.id || l.target,
                type: l.type,
                label: l.label
            }))
        };
    }
    
    importData(data) {
        this.clear();
        
        if (data.nodes) {
            data.nodes.forEach(n => this.addNode(n));
        }
        
        if (data.links) {
            data.links.forEach(l => this.addLink(l.source, l.target, l));
        }
    }
    
    truncate(str, len) {
        return str.length > len ? str.substring(0, len) + '...' : str;
    }
    
    // Apply different layouts
    setLayout(type) {
        switch (type) {
            case 'force':
                this.simulation
                    .force('charge', d3.forceManyBody().strength(-300))
                    .force('center', d3.forceCenter(this.width / 2, this.height / 2));
                break;
            
            case 'radial':
                this.simulation
                    .force('charge', d3.forceManyBody().strength(-100))
                    .force('center', null)
                    .force('radial', d3.forceRadial(200, this.width / 2, this.height / 2));
                break;
            
            case 'cluster':
                // Group by type
                const types = [...new Set(this.nodes.map(n => n.type))];
                const clusterCenters = {};
                types.forEach((t, i) => {
                    const angle = (2 * Math.PI * i) / types.length;
                    clusterCenters[t] = {
                        x: this.width / 2 + Math.cos(angle) * 200,
                        y: this.height / 2 + Math.sin(angle) * 200
                    };
                });
                
                this.simulation
                    .force('x', d3.forceX(d => clusterCenters[d.type]?.x || this.width / 2).strength(0.5))
                    .force('y', d3.forceY(d => clusterCenters[d.type]?.y || this.height / 2).strength(0.5));
                break;
        }
        
        this.simulation.alpha(1).restart();
    }
    
    // Filter nodes by type
    filterByType(types) {
        this.nodeGroup.selectAll('.node')
            .attr('opacity', d => types.includes(d.type) ? 1 : 0.1);
        
        this.linkGroup.selectAll('.link')
            .attr('opacity', d => {
                const sourceType = (d.source.type || this.nodes.find(n => n.id === d.source)?.type);
                const targetType = (d.target.type || this.nodes.find(n => n.id === d.target)?.type);
                return types.includes(sourceType) && types.includes(targetType) ? 1 : 0.1;
            });
    }
    
    resetFilter() {
        this.nodeGroup.selectAll('.node').attr('opacity', 1);
        this.linkGroup.selectAll('.link').attr('opacity', 1);
    }
    
    // Zoom controls
    zoomIn() {
        this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.5);
    }
    
    zoomOut() {
        this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.67);
    }
    
    resetView() {
        this.svg.transition().duration(500).call(
            this.zoom.transform,
            d3.zoomIdentity.translate(this.width / 2, this.height / 2).scale(1)
        );
    }
    
    centerGraph() {
        if (this.nodes.length === 0) return;
        
        const bounds = this.g.node().getBBox();
        const fullWidth = this.width;
        const fullHeight = this.height;
        const width = bounds.width;
        const height = bounds.height;
        const midX = bounds.x + width / 2;
        const midY = bounds.y + height / 2;
        
        const scale = 0.8 / Math.max(width / fullWidth, height / fullHeight);
        const translateX = fullWidth / 2 - scale * midX;
        const translateY = fullHeight / 2 - scale * midY;
        
        this.svg.transition().duration(500).call(
            this.zoom.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
        );
    }
    
    // Get stats
    getNodeCount() {
        return this.nodes.length;
    }
    
    getLinkCount() {
        return this.links.length;
    }
}

// Export for use
window.OSINTGraph = OSINTGraph;
