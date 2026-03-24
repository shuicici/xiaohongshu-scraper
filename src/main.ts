import { Dataset, Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

interface Input {
    mode: string;
    keyword?: string;
    noteUrl?: string;
    userId?: string;
    userUrl?: string;
    limit?: number;
}

// This function is called for each URL
async function requestHandler({ page, request }: { page: any, request: any }) {
    const userData = request.userData as any;
    
    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    
    // Add delay to appear more human
    await page.waitForTimeout(2000 + Math.random() * 2000);
    
    if (userData.type === 'search') {
        // Try to extract search results
        const results = await page.evaluate(() => {
            const items: any[] = [];
            
            // Try different selectors for search results
            const cards = document.querySelectorAll('.note-item, [class*="note-card"], .item-holder');
            
            cards.forEach((card, idx) => {
                const title = card.querySelector('.title, [class*="title"]')?.textContent?.trim();
                const content = card.querySelector('.content, .desc, [class*="desc"]')?.textContent?.trim();
                const author = card.querySelector('.author, [class*="user"]')?.textContent?.trim();
                const likes = card.querySelector('.likes, [class*="like"]')?.textContent?.trim();
                
                if (title || content) {
                    items.push({ title, content, author, likes, index: idx });
                }
            });
            
            return items;
        });
        
        log.info(`Found ${results.length} search results`);
        
        await Dataset.pushData({
            mode: 'search',
            keyword: userData.keyword,
            results: results,
            url: request.url
        });
    }
    else if (userData.type === 'note') {
        // Extract note detail
        const noteData = await page.evaluate(() => {
            return {
                title: document.querySelector('.title, [class*="title"]')?.textContent?.trim(),
                content: document.querySelector('.content, .desc, [class*="desc"]')?.textContent?.trim(),
                author: document.querySelector('.author-name, [class*="user"]')?.textContent?.trim(),
                likes: document.querySelector('.likes, [class*="like"]')?.textContent?.trim(),
                url: window.location.href
            };
        });
        
        log.info('Extracted note data');
        
        await Dataset.pushData({
            mode: 'note',
            data: noteData
        });
    }
    else if (userData.type === 'user') {
        // Extract user profile
        const userData2 = await page.evaluate(() => {
            return {
                nickname: document.querySelector('.nickname, [class*="name"]')?.textContent?.trim(),
                desc: document.querySelector('.desc, [class*="bio"]')?.textContent?.trim(),
                fans: document.querySelector('.fans, [class*="follower"]')?.textContent?.trim(),
                url: window.location.href
            };
        });
        
        log.info('Extracted user data');
        
        await Dataset.pushData({
            mode: 'user',
            data: userData2
        });
    }
    else if (userData.type === 'comments') {
        // Extract comments
        const comments = await page.evaluate(() => {
            const items: any[] = [];
            const commentEls = document.querySelectorAll('.comment-item, [class*="comment"]');
            
            commentEls.forEach((el) => {
                const user = el.querySelector('.user-name, [class*="user"]')?.textContent?.trim();
                const content = el.querySelector('.text, [class*="content"]')?.textContent?.trim();
                
                if (user && content) {
                    items.push({ user, content });
                }
            });
            
            return items;
        });
        
        log.info(`Found ${comments.length} comments`);
        
        await Dataset.pushData({
            mode: 'comments',
            comments: comments,
            total: comments.length
        });
    }
}

async function main() {
    await Actor.init();
    
    const input = await Actor.getInput<Input>();
    
    if (!input || !input.mode) {
        throw new Error('Input is required with mode (search/note/user/comments)');
    }
    
    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 90,
        useSessionPool: true,
        preNavigationHooks: [
            async ({ page }) => {
                // Set viewport
                await page.setViewportSize({ width: 1920, height: 1080 });
                
                // Add basic anti-detection
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                });
            }
        ]
    });
    
    let url = '';
    let userData: any = { type: '' };
    
    switch (input.mode) {
        case 'search':
            if (!input.keyword) throw new Error('Keyword required for search');
            url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(input.keyword)}&type=51`;
            userData = { type: 'search', keyword: input.keyword };
            break;
            
        case 'note':
            if (!input.noteUrl) throw new Error('noteUrl required for note');
            url = input.noteUrl;
            userData = { type: 'note' };
            break;
            
        case 'user':
            const userId = input.userId || input.userUrl;
            if (!userId) throw new Error('userId or userUrl required');
            url = userId.startsWith('http') ? userId : `https://www.xiaohongshu.com/user/profile/${userId}`;
            userData = { type: 'user' };
            break;
            
        case 'comments':
            if (!input.noteUrl) throw new Error('noteUrl required for comments');
            url = input.noteUrl;
            userData = { type: 'comments' };
            break;
            
        default:
            throw new Error(`Unknown mode: ${input.mode}`);
    }
    
    log.info(`Starting scrape: ${input.mode} - ${url}`);
    
    await crawler.run([{
        url,
        userData
    }]);
    
    log.info('Scraping completed');
    
    await Actor.exit();
}

main().catch((error) => {
    console.error('Actor error:', error);
    process.exit(1);
});