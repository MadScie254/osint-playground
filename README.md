# OSINT Playground

> A powerful, real-time multi-source intelligence platform for username reconnaissance, featuring streaming search aggregation, graph visualization, and geospatial mapping.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-brightgreen.svg)

## ⚠️ Legal Disclaimer

**This tool is intended for legitimate OSINT research purposes only.** 

By using this tool, you agree to:
- Only search for usernames you have legitimate reason to investigate
- Not use this tool for harassment, stalking, or illegal purposes
- Comply with all applicable laws and platform Terms of Service
- Accept full responsibility for your use of this tool

## 🚀 Features

- **100+ Platform Search** - Aggregate results from GitHub, Reddit, GitLab, Twitter, HackerNews, and 50+ other platforms
- **Real-time SSE Streaming** - Live results as they come in with progress tracking
- **Confidence Scoring** - Automatic deduplication and intelligent result scoring
- **Dark/Light Theme** - System-preference aware theming with keyboard shortcuts (Alt+Shift+T)
- **Graph Visualization** - D3.js powered entity relationship mapping
- **GeoInt Mapping** - Leaflet-based location intelligence
- **Timeline View** - Chronological activity tracking
- **Intel Feed** - Live feeds from security sources (HackerNews, etc.)

## 📦 Installation

```bash
# Clone or navigate to the project directory
cd username-osint

# Install dependencies
npm install

# Copy environment example
cp .env.example .env

# Start the server
npm start

# Open http://localhost:3000
```

## 🔧 Configuration

Edit `.env` file to add API keys for enhanced functionality:

```env
# Search Engines (optional - enables API search)
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CSE_ID=your_custom_search_engine_id
YANDEX_API_KEY=your_yandex_api_key
BING_API_KEY=your_bing_api_key

# OSINT APIs (optional - enables additional lookups)
GITHUB_TOKEN=your_github_personal_access_token
HUNTER_API_KEY=your_hunter_io_api_key
SHODAN_API_KEY=your_shodan_api_key
HIBP_API_KEY=your_haveibeenpwned_api_key
STEAM_API_KEY=your_steam_web_api_key

# Rate Limiting
RATE_LIMIT_REQUESTS=30
RATE_LIMIT_WINDOW_MS=60000

# Server
PORT=3000
NODE_ENV=development
```

## 🖥️ Usage

### Web Interface

1. Start the server: `npm start`
2. Open browser: `http://localhost:3000`
3. Accept the terms of use
4. Enter a username and click Search

### API Endpoints

```bash
# Health check
GET /api/health

# Get available platforms
GET /api/platforms

# Check single URL
GET /api/check?url=https://github.com/username

# Full username search (streaming)
POST /api/search
Content-Type: application/json
{
  "username": "johndoe",
  "engines": ["google", "yandex"],
  "categories": ["social", "development"]
}

# Search engines query
POST /api/search-engines
{
  "username": "johndoe",
  "engines": ["google", "duckduckgo"]
}

# GitHub profile lookup
GET /api/github/:username
```

## 📊 Supported Platforms

### Social Media
- Twitter/X, Instagram, Facebook, TikTok, Reddit
- Pinterest, Tumblr, Mastodon, VK, OK.ru

### Development
- GitHub, GitLab, Bitbucket, Stack Overflow
- CodePen, Replit, Dev.to, LeetCode, Kaggle

### Professional
- LinkedIn, Medium, About.me, Linktree

### Gaming
- Steam, PlayStation, Xbox, Twitch

### Security
- Keybase, HackerOne, BugCrowd, TryHackMe, HackTheBox

### And many more...

## 🔌 API Integration

### With API Keys (Enhanced)
- **Google Custom Search**: Full search results
- **Yandex Search**: Russian web search
- **Bing Search**: Microsoft search results
- **Hunter.io**: Email discovery
- **Shodan**: IP/Host intelligence
- **Have I Been Pwned**: Breach checking

### Without API Keys
- Direct platform checking (HTTP status)
- DuckDuckGo Instant Answers
- Public GitHub/GitLab APIs
- Reddit public API
- Keybase public API

## 🛡️ Rate Limiting

Built-in rate limiting protects against abuse:
- Default: 30 requests per minute per IP
- Configurable via environment variables
- Automatic batch processing with delays

## 📁 Project Structure

```
username-osint/
├── server.js                 # Express server with API routes
├── lib/
│   └── search-aggregator.js  # Multi-source search engine with 12 adapters
├── config/
│   └── platforms.json        # Platform definitions (50+ sites)
├── public/
│   ├── index.html            # Main SPA with 6 views
│   ├── css/
│   │   ├── theme-system.css  # CSS variable theming (dark/light/system)
│   │   ├── darknet.css       # Main cyberpunk styles
│   │   └── search-results.css# Result card & progress styles
│   └── js/
│       ├── theme-manager.js  # Theme controller with persistence
│       ├── search-client.js  # SSE streaming search client
│       ├── darknet-ui.js     # UI controller
│       ├── graph.js          # D3.js entity visualization
│       ├── map.js            # Leaflet GeoInt integration
│       └── osint-core.js     # OSINT utilities
├── tests/
│   ├── theme-manager.test.js     # Unit tests
│   ├── search-aggregator.test.js # Integration tests
│   └── e2e/
│       └── osint.spec.js         # Playwright E2E tests
├── jest.config.json
├── playwright.config.js
├── package.json
├── .env.example
└── README.md
```

## 📡 API Endpoints

### Core
```bash
GET  /api/health              # Health check
GET  /api/status              # API configuration status
GET  /api/adapters            # List available search adapters
```

### Scan (Streaming)
```bash
POST /api/scan                # Start scan (returns scanId)
GET  /api/scan/:id            # Get scan results
GET  /api/scan/:id/stream     # SSE stream for live results
POST /api/scan/quick          # Blocking scan (waits for completion)
```

### OSINT Lookups
```bash
GET  /api/osint/github/:user  # GitHub profile
GET  /api/osint/reddit/:user  # Reddit profile
GET  /api/osint/gitlab/:user  # GitLab profile
GET  /api/osint/keybase/:user # Keybase lookup
GET  /api/osint/shodan/:ip    # Shodan host (requires key)
GET  /api/osint/hunter/domain # Email discovery (requires key)
GET  /api/osint/hibp/:email   # Breach check (requires key)
GET  /api/dns/:domain         # DNS records
```

## 🧪 Testing

```bash
# Unit tests (Jest)
npm test
npm run test:coverage

# E2E tests (Playwright)
npx playwright install    # First time only
npm run test:e2e
npm run test:e2e:ui       # Interactive mode

# All tests
npm run test:all
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Focus search input |
| `Alt+Shift+T` | Cycle theme (system → dark → light) |
| `Escape` | Cancel current scan |

## 🤝 Contributing

Contributions are welcome! Please ensure your contributions:
1. Maintain ethical usage standards
2. Include appropriate documentation
3. Follow existing code style
4. Add tests for new features

## 📄 License

MIT License - See LICENSE file for details.

## ⚡ Quick Start

```bash
npm install && npm start
```

Then open `http://localhost:3000` in your browser.

---

**Remember**: Use responsibly and ethically. This tool is for legitimate research only.
