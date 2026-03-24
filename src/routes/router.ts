import { Dataset, Actor } from 'apify';
import { PlaywrightCrawler, log as crawleeLog } from 'crawlee';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Suppress Crawlee logs
crawleeLog.setLevel('warning');

// Use stealth plugin
puppeteerExtra.use(StealthPlugin());

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
        // Use stealth browser
        this.crawler = new PlaywrightCrawler({
            launchContext: {
                launcher: async () => {
                    const browser = await puppeteerExtra.launch({
                        headless: true,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-blink-features=AutomationControlled'
                        ]
                    });
                    return browser;
                }
            },
            maxConcurrency: 1,
            maxRequestRetries: 3,
            requestHandlerTimeoutSecs: 90,
            useSessionPool: true,
            persistCookiesPerSession: true,
            preNavigationHooks: [
                async ({ page }) => {
                    await page.setViewportSize({ width: 1920, height: 1080 });
                }
            ]
        });
    }

    /**
     * Search notes by keyword
     */
    async handleSearch(keyword: string, limit: number): Promise<void> {
        Actor.log.info(`Searching for: ${keyword}, limit: ${limit}`);
        
        const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&type=51`;
        
        await this.crawler.run([{
            url: searchUrl,
            userData: { keyword, limit, type: 'search' },
            handledOnce: true
        }]);
        
        await Dataset.pushData({
            mode: 'search',
            keyword,
            message: 'Search completed - check output dataset for results'
        });
        
        Actor.log.info(`Search completed for: ${keyword}`);
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
        
        await this.crawler.run([{
            url: noteUrl,
            userData: { type: 'note' },
            handledOnce: true
        }]);
        
        await Dataset.pushData({
            mode: 'note',
            url: noteUrl,
            message: 'Note fetch completed'
        });
        
        Actor.log.info(`Note fetch completed`);
    }

    /**
     * Get user profile
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
            userData: { type: 'user', limit },
            handledOnce: true
        }]);
        
        await Dataset.pushData({
            mode: 'user',
            identifier: userIdentifier,
            message: 'User fetch completed'
        });
        
        Actor.log.info(`User fetch completed`);
    }

    /**
     * Extract comments from a note
     */
    async handleComments(noteUrl: string, limit: number): Promise<void> {
        Actor.log.info(`Fetching comments for: ${noteUrl}`);
        
        await this.crawler.run([{
            url: noteUrl,
            userData: { type: 'comments', limit },
            handledOnce: true
        }]);
        
        await Dataset.pushData({
            mode: 'comments',
            noteUrl,
            message: 'Comments fetch completed'
        });
        
        Actor.log.info(`Comments fetch completed`);
    }

    private extractNoteId(url: string): string | null {
        const match = url.match(/explore\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }
}

export { XiaohongshuScraper };
