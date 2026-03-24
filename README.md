# Xiaohongshu Scraper (Apify Actor)

![GitHub](https://img.shields.io/github/license/yourusername/xiaohongshu-scraper)
![Apify](https://img.shields.io/badge/Platform-Apify-blue)

Scrape Xiaohongshu (小红书 / RED) social platform - search notes, extract user profiles, and collect comments.

## Features

- 🔍 **Search Notes** - Search by keyword and get title, content, author, engagement metrics
- 📝 **Note Details** - Get full note content, images, tags, and timestamps
- 👤 **User Profiles** - Extract user info, follower counts, and their notes
- 💬 **Comments** - Extract comments and replies from any note
- 📱 **Anti-Bot** - Uses mobile user-agent to bypass detection
- 🔄 **Retry Logic** - Built-in error handling with automatic retries

## Use Cases

- **Market Research** - Analyze trending topics and engagement
- **Lead Generation** - Find influencers and content creators
- **Competitor Analysis** - Monitor brand mentions and sentiment
- **Academic Research** - Collect social media data for studies

## Input

```json
{
  "mode": "search",
  "keyword": "美妆",
  "limit": 20
}
```

### Available Modes

| Mode | Description | Required Fields |
|------|-------------|-----------------|
| `search` | Search notes by keyword | `keyword` |
| `note` | Get single note details | `noteUrl` |
| `user` | Get user profile & notes | `userId` or `userUrl` |
| `comments` | Extract note comments | `noteUrl` |

### Input Examples

**Search Notes:**
```json
{
  "mode": "search",
  "keyword": "护肤",
  "limit": 50
}
```

**Get Note Details:**
```json
{
  "mode": "note",
  "noteUrl": "https://www.xiaohongshu.com/explore/abc123xyz"
}
```

**Get User Profile:**
```json
{
  "mode": "user",
  "userUrl": "https://www.xiaohongshu.com/user/profile/1234567890abcdef",
  "limit": 30
}
```

**Get Comments:**
```json
{
  "mode": "comments",
  "noteUrl": "https://www.xiaohongshu.com/explore/abc123xyz",
  "limit": 100
}
```

## Output

Each run produces a JSON dataset with the scraped data.

### Search Results Example:
```json
{
  "mode": "search",
  "keyword": "美妆",
  "results": [
    {
      "id": "abc123",
      "title": "超好用的护肤分享",
      "content": "最近发现了一款...",
      "author": {
        "id": "user456",
        "nickname": "美妆达人",
        "avatar": "https://..."
      },
      "images": ["https://..."],
      "tags": ["护肤", "好物分享"],
      "likes": 5234,
      "collects": 1203,
      "comments": 89,
      "url": "https://www.xiaohongshu.com/explore/abc123"
    }
  ],
  "total": 20
}
```

## Running on Apify

1. Go to [Apify Console](https://console.apify.com)
2. Create a new Actor or use this Actor's page
3. Paste your input JSON
4. Click "Run"

## Running Locally

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run with Apify CLI
apify run --input=input.json
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APIFY_TOKEN` | Apify API token | - |
| `APIFY_PROXY_URL` | Custom proxy URL | Apify proxy |

## Limitations

- Rate limiting may occur with aggressive scraping
- Some data may require authentication
- Proxy is recommended for production use

## License

MIT License

## Disclaimer

This tool is for educational and research purposes only. Ensure you comply with Xiaohongshu's Terms of Service and respect their robots.txt when scraping.
