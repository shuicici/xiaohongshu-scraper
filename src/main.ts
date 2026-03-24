import { Dataset, Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import path from 'path';
import fs from 'fs';
import * as playwright from 'playwright';

interface Input {
    mode: 'search' | 'note' | 'user' | 'comments' | 'login';
    keyword?: string;
    noteUrl?: string;
    userId?: string;
    userUrl?: string;
    limit?: number;
    cookie?: string;
    maxPages?: number;
    useSession?: boolean;
    proxy?: any;
}

// Function to scroll and load more content
async function scrollToLoad(page: any, maxPages: number) {
    for (let i = 0; i < maxPages; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(1000 + Math.random() * 1000);
    }
}

// This function is called for each URL
async function requestHandler({ page, request }: { page: any, request: any }) {
    const userData = request.userData as any;
    const input = userData.input as Input;
    
    // Wait for page to load
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    
    // Scroll if needed
    if (userData.type === 'search' || userData.type === 'user') {
        const scrollCount = input.maxPages ?? 3;
        if (scrollCount > 0) {
            log.info(`Scrolling ${scrollCount} times to load more results...`);
            await scrollToLoad(page, scrollCount);
        }
    }

    // Add delay to appear more human
    await page.waitForTimeout(2000 + Math.random() * 2000);
    
    const title = await page.title();
    log.info(`Page title: ${title}`);

    if (userData.type === 'search') {
        const results = await page.evaluate(() => {
            const items: any[] = [];
            const selectors = ['.note-item', 'section.note-item', '[class*="note-card"]', '.item-holder'];
            
            let cards: NodeListOf<Element> = document.querySelectorAll('.non-existent');
            for (const s of selectors) {
                const found = document.querySelectorAll(s);
                if (found.length > 0) { cards = found; break; }
            }
            
            cards.forEach((card, idx) => {
                const title = card.querySelector('.title, [class*="title"]')?.textContent?.trim();
                const author = card.querySelector('.nickname, [class*="user"]')?.textContent?.trim();
                const link = card.querySelector('a')?.href;
                if (title || author) items.push({ title, author, url: link, index: idx });
            });
            return items;
        });
        
        log.info(`Found ${results.length} search results`);
        if (results.length === 0) {
            const screenshot = await page.screenshot();
            await Actor.setValue('debug_screenshot.png', screenshot, { contentType: 'image/png' });
            const html = await page.content();
            await Actor.setValue('debug_page.html', html, { contentType: 'text/html' });
        }

        await Dataset.pushData({ mode: 'search', keyword: userData.keyword, results, url: request.url });
    } else if (userData.type === 'note' || userData.type === 'comments') {
        const data = await page.evaluate(() => ({
            title: document.querySelector('.title, h1')?.textContent?.trim(),
            content: document.querySelector('.desc, .content')?.textContent?.trim(),
            author: document.querySelector('.nickname')?.textContent?.trim(),
            url: window.location.href
        }));
        await Dataset.pushData({ mode: userData.type, data });
    }
}

async function main() {
    await Actor.init();
    
    let input = await Actor.getInput<Input>();
    
    // CLI Overrides for local testing (node dist/main.js --mode=login)
    const args = process.argv.slice(2);
    const cliInput: any = {};
    args.forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            if (key) cliInput[key] = value === undefined ? true : (value === 'true' ? true : (value === 'false' ? false : (!isNaN(Number(value)) ? Number(value) : value)));
        }
    });
    input = { ...input, ...cliInput } as Input;

    if (!input || !input.mode) {
        throw new Error('Input is required (search/note/user/comments/login)');
    }

    const { mode, useSession = true } = input;
    const sessionPath = path.join(process.cwd(), 'session.json');
    
    if (mode === 'login') {
        log.info('Entering Login Mode. Launching headful browser...');
        const browser = await playwright.chromium.launch({ headless: false });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        await page.goto('https://www.xiaohongshu.com');
        
        log.info('------------------------------------------------------------');
        log.info('PLEASE LOG IN MANUALLY IN THE BROWSER.');
        log.info('The session will be saved to session.json when login is detected.');
        log.info('------------------------------------------------------------');

        try {
            await page.waitForSelector('.side-bar-avatar, .user-name, .logout, .user-avatar', { timeout: 300000 });
            log.info('Login detected! Saving session...');
            await context.storageState({ path: sessionPath });
            log.info(`Session saved successfully to ${sessionPath}`);
            await browser.close();
            await Actor.exit();
            return;
        } catch (error) {
            log.error('Login timed out.');
            await browser.close();
            await Actor.exit();
            return;
        }
    }

    // Initialize Crawler
    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 180,
        useSessionPool: true,
        launchContext: {
            launchOptions: {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
        },
        preNavigationHooks: [
            async ({ page, request }) => {
                await page.setViewportSize({ width: 1920, height: 1080 });
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                });

                // Manual Session Restoration
                if (useSession && fs.existsSync(sessionPath)) {
                    try {
                        const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
                        if (sessionData.cookies) await page.context().addCookies(sessionData.cookies);
                        if (sessionData.origins) {
                            for (const originState of sessionData.origins) {
                                if (originState.origin.includes('xiaohongshu.com') && originState.localStorage) {
                                    await page.addInitScript((ls: any) => {
                                        for (const item of ls) window.localStorage.setItem(item.name, item.value);
                                    }, originState.localStorage);
                                }
                            }
                        }
                    } catch (e: any) { log.error(`Session error: ${e.message}`); }
                }
            }
        ],
        requestHandler
    });

    let url = '';
    let type = '';
    
    if (mode === 'search') {
        url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(input.keyword || 'coffee')}&type=51`;
        type = 'search';
    } else if (mode === 'note') {
        url = input.noteUrl || '';
        type = 'note';
    } else if (mode === 'user') {
        url = input.userUrl || `https://www.xiaohongshu.com/user/profile/${input.userId}`;
        type = 'user';
    }

    log.info(`Starting scrape: ${mode} - ${url}`);
    await crawler.run([{ url, userData: { type, input } }]);
    await Actor.exit();
}

main().catch((error) => {
    console.error('Actor error:', error);
    process.exit(1);
});
