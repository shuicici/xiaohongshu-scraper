import { Dataset, Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

interface Input {
    mode: string;
    keyword?: string;
    noteUrl?: string;
    userId?: string;
    userUrl?: string;
    limit?: number;
    // Backend API URL - can be set as environment variable or input
    apiUrl?: string;
}

// Get API URL from env or input
function getApiUrl(input: Input): string {
    return input.apiUrl || process.env.XHS_API_URL || 'http://localhost:5000';
}

async function main() {
    await Actor.init();
    
    const input = await Actor.getInput<Input>();
    
    if (!input || !input.mode) {
        throw new Error('Input is required with mode (search/note/user/comments)');
    }
    
    const apiUrl = getApiUrl(input);
    
    let endpoint = '';
    let method = 'POST';
    let body: any = {};
    
    switch (input.mode) {
        case 'search':
            if (!input.keyword) throw new Error('Keyword required for search');
            endpoint = '/search';
            body = { keyword: input.keyword, page_size: input.limit || 20 };
            break;
            
        case 'note':
            if (!input.noteUrl) throw new Error('noteUrl required for note');
            // Extract note ID from URL
            const noteId = input.noteUrl.match(/explore\/([a-zA-Z0-9]+)/)?.[1];
            if (!noteId) throw new Error('Invalid note URL');
            endpoint = `/note/${noteId}`;
            method = 'GET';
            break;
            
        case 'user':
            const userId = input.userId || input.userUrl?.match(/profile\/([a-zA-Z0-9-]+)/)?.[1];
            if (!userId) throw new Error('userId or userUrl required');
            endpoint = `/user/${userId}`;
            method = 'GET';
            break;
            
        case 'comments':
            if (!input.noteUrl) throw new Error('noteUrl required for comments');
            const commentNoteId = input.noteUrl.match(/explore\/([a-zA-Z0-9]+)/)?.[1];
            if (!commentNoteId) throw new Error('Invalid note URL');
            endpoint = `/notes/${commentNoteId}/comments`;
            method = 'GET';
            break;
            
        default:
            throw new Error(`Unknown mode: ${input.mode}`);
    }
    
    log.info(`Calling backend API: ${method} ${apiUrl}${endpoint}`);
    
    try {
        let response;
        
        if (method === 'GET') {
            response = await fetch(`${apiUrl}${endpoint}`);
        } else {
            response = await fetch(`${apiUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
        }
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        await Dataset.pushData({
            mode: input.mode,
            data,
            apiUrl,
            endpoint
        });
        
        log.info(`Successfully fetched data from ${input.mode}`);
        
    } catch (error: any) {
        log.error(`API call failed: ${error.message}`);
        
        // If backend is unavailable, try direct scraping as fallback
        log.info('Falling back to direct scraping...');
        await fallbackScraping(input);
    }
    
    await Actor.exit();
}

// Fallback: direct scraping when backend unavailable
async function fallbackScraping(input: Input) {
    log.info('Starting fallback scraping...');
    
    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 60,
        preNavigationHooks: [
            async ({ page }) => {
                await page.setViewportSize({ width: 1920, height: 1080 });
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                });
            }
        ]
    });
    
    let url = '';
    
    switch (input.mode) {
        case 'search':
            url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(input.keyword || '')}&type=51`;
            break;
        case 'note':
            url = input.noteUrl || '';
            break;
        case 'user':
            url = input.userUrl || `https://www.xiaohongshu.com/user/profile/${input.userId}`;
            break;
        case 'comments':
            url = input.noteUrl || '';
            break;
    }
    
    if (!url) {
        throw new Error('No URL to scrape');
    }
    
    await crawler.run([{ url, userData: { type: input.mode } }]);
    
    await Dataset.pushData({
        mode: input.mode,
        note: 'Fallback scraping completed - results in dataset',
        warning: 'Direct scraping may be limited due to anti-bot measures'
    });
}

main().catch((error) => {
    console.error('Actor error:', error);
    process.exit(1);
});
