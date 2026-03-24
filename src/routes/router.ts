import { Dataset, Actor } from 'apify';
import { PlaywrightCrawler, log as crawleeLog } from 'crawlee';

// Suppress Crawlee logs
crawleeLog.setLevel('warning');

interface Note {
    id: string;
    title: string;
    content: string;
    author: {
        id: string;
        nickname: string;
        avatar: string;
    };
    images: string[];
    tags: string[];
    likes: number;
    collects: number;
    comments: number;
    url: string;
}

class XiaohongshuScraper {
    private crawler: PlaywrightCrawler;
    
    constructor() {
        this.crawler = new PlaywrightCrawler({
            maxConcurrency: 2,
            maxRequestRetries: 3,
            requestHandlerTimeoutSecs: 60,
            useSessionPool: true,
            persistCookiesPerSession: true,
            preNavigationHooks: [
                async ({ page }) => {
                    // Set mobile viewport
                    await page.setViewportSize({ width: 390, height: 844 });
                    
                    // Inject stealth script
                    await page.addInitScript(() => {
                        // Remove webdriver property
                        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                        // Add permissions
                        const originalQuery = window.navigator.permissions.query;
                        (window.navigator.permissions as any).query = (parameters: any) => 
                            parameters.name === 'notifications' ? 
                                Promise.resolve({ state: Notification.permission } as any) :
                                originalQuery(parameters);
                        // Mock plugins
                        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
                    });
                }
            ]
        });
    }

    /**
     * Search notes by keyword - scrape search results page
     */
    async handleSearch(keyword: string, limit: number): Promise<void> {
        Actor.log.info(`Searching for: ${keyword}, limit: ${limit}`);
        
        const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=51`;
        
        const notes: Note[] = [];
        
        await this.crawler.run([{
            url: searchUrl,
            userData: { keyword, limit, notes: [] as Note[] }
        }]);
        
        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get results from dataset
        const dataset = await Dataset.getData();
        const items = dataset.items as any[];
        
        for (const item of items) {
            if (item.notes) {
                notes.push(...item.notes);
            }
        }
        
        // Fallback: try to extract from page directly
        if (notes.length === 0) {
            Actor.log.info('No data from dataset, need direct page extraction');
        }
        
        await Dataset.pushData({
            mode: 'search',
            keyword,
            results: notes.slice(0, limit),
            total: notes.length
        });
        
        Actor.log.info(`Found ${notes.length} notes for keyword: ${keyword}`);
    }

    /**
     * Get single note details
     */
    async handleNote(noteUrl: string): Promise<void> {
        Actor.log.info(`Fetching note: ${noteUrl}`);
        
        const noteId = this.extractNoteId(noteUrl);
        
        if (!noteId) {
            throw new Error(`Invalid note URL: ${noteUrl}`);
        }
        
        // Navigate to note page and extract data
        await this.crawler.run([{
            url: noteUrl,
            userData: { mode: 'note' }
        }]);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get from dataset
        const dataset = await Dataset.getData();
        const items = dataset.items as any[];
        const noteData = items.find(i => i.mode === 'note');
        
        await Dataset.pushData({
            mode: 'note',
            url: noteUrl,
            data: noteData?.data || { error: 'Could not extract note data' }
        });
        
        Actor.log.info(`Fetched note details`);
    }

    /**
     * Get user profile and notes
     */
    async handleUser(userIdentifier: string, limit: number): Promise<void> {
        Actor.log.info(`Fetching user: ${userIdentifier}`);
        
        let userUrl: string;
        
        if (userIdentifier.startsWith('http')) {
            userUrl = userIdentifier;
        } else {
            userUrl = `https://www.xiaohongshu.com/user/profile/${userIdentifier}`;
        }
        
        await this.crawler.run([{
            url: userUrl,
            userData: { mode: 'user', limit }
        }]);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const dataset = await Dataset.getData();
        const items = dataset.items as any[];
        const userData = items.find(i => i.mode === 'user');
        
        await Dataset.pushData({
            mode: 'user',
            identifier: userIdentifier,
            data: userData?.data || { error: 'Could not extract user data' }
        });
        
        Actor.log.info(`Fetched user profile`);
    }

    /**
     * Extract comments from a note
     */
    async handleComments(noteUrl: string, limit: number): Promise<void> {
        Actor.log.info(`Fetching comments for: ${noteUrl}`);
        
        await this.crawler.run([{
            url: noteUrl,
            userData: { mode: 'comments', limit }
        }]);
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const dataset = await Dataset.getData();
        const items = dataset.items as any[];
        const commentsData = items.find(i => i.mode === 'comments');
        
        await Dataset.pushData({
            mode: 'comments',
            noteUrl,
            comments: commentsData?.comments || [],
            total: commentsData?.comments?.length || 0
        });
        
        Actor.log.info(`Fetched comments`);
    }

    private extractNoteId(url: string): string | null {
        const match = url.match(/explore\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }
}

export { XiaohongshuScraper };
