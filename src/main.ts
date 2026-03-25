import { Dataset, Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright';

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
    proxy?: {
        groups?: { proxyUrl: string }[];
        countryCode?: string;
    };
}

// Stealth script injected into every page before navigation
const STEALTH_SCRIPT = `
() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Mock chrome runtime
    window.chrome = { runtime: {}, app: {} };
    
    // Remove automation properties
    delete window._phantom;
    delete window.__nightmare;
    delete window.callPhantom;
    delete window.puppeteer;
    
    // Mock permissions
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
    );
    
    // Fake plugins
    Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5].map(() => ({
            name: Math.random().toString(36).substring(7),
            description: Math.random().toString(36).substring(7),
            filename: Math.random().toString(36).substring(7)
        }))
    });
    
    // Fake languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en']
    });
    
    // Remove CDP detection
    window.__ CDP = undefined;
    window.__WEBDRIVER_BRIDGE_TESTS = undefined;
}
`;

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
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    
    // Scroll if needed (Xiaohongshu uses infinite scroll)
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

    // Check if blocked
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('访问过于频繁') || bodyText.includes('请稍后') || bodyText.includes('验证码')) {
        log.warning('Detected rate limit or captcha - backing off');
        throw new Error('Rate limited by Xiaohongshu - need proxy');
    }

    if (userData.type === 'search') {
        const results = await page.evaluate(() => {
            const items: any[] = [];
            // Xiaohongshu search result selectors
            const selectors = [
                '.note-item', 
                'section.note-item', 
                '[class*="note-card"]', 
                '.item-holder',
                '[class*="feeds"] > [class*="item"]'
            ];
            
            let cards: NodeListOf<Element> = document.querySelectorAll('.non-existent');
            for (const s of selectors) {
                const found = document.querySelectorAll(s);
                if (found.length > 0) { cards = found; break; }
            }
            
            cards.forEach((card) => {
                const titleEl = card.querySelector('.title, [class*="title"], .note-desc, .content');
                const authorEl = card.querySelector('.nickname, [class*="user"], .author, [class*="name"]');
                const linkEl = card.querySelector('a[href*="/discovery/item/"], a[href*="/user/profile/"]');
                const coverEl = card.querySelector('img[src*="sns-img"]');
                
                items.push({
                    title: titleEl?.textContent?.trim(),
                    author: authorEl?.textContent?.trim(),
                    url: (linkEl as HTMLAnchorElement)?.href || '',
                    cover: (coverEl as HTMLImageElement)?.src || ''
                });
            });
            return items;
        });
        
        log.info(`Found ${results.length} search results`);
        if (results.length === 0) {
            const screenshot = await page.screenshot({ fullPage: true });
            await Actor.setValue('debug_screenshot.png', screenshot, { contentType: 'image/png' });
            const html = await page.content();
            await Actor.setValue('debug_page.html', html, { contentType: 'text/html' });
            log.warning('No results found - debug data saved');
        }

        await Dataset.pushData({ mode: 'search', keyword: userData.keyword, results, url: request.url });
    } else if (userData.type === 'note') {
        const data = await page.evaluate(() => {
            return {
                title: document.querySelector('h1, .title, [class*="title"]')?.textContent?.trim(),
                content: document.querySelector('.desc, .content, [class*="desc"]')?.textContent?.trim(),
                author: document.querySelector('.nickname, [class*="user-name"], .author')?.textContent?.trim(),
                likes: document.querySelector('[class*="like"] span, .like-count')?.textContent?.trim(),
                url: window.location.href
            };
        });
        await Dataset.pushData({ mode: 'note', data, url: request.url });
    } else if (userData.type === 'comments') {
        const comments = await page.evaluate(() => {
            const items: any[] = [];
            document.querySelectorAll('.comment-item, [class*="comment"]').forEach(item => {
                items.push({
                    user: item.querySelector('.nickname, [class*="user"]')?.textContent?.trim(),
                    content: item.querySelector('.content, .text')?.textContent?.trim()
                });
            });
            return items;
        });
        await Dataset.pushData({ mode: 'comments', comments, url: request.url });
    }
}

async function main() {
    await Actor.init();
    
    let input = await Actor.getInput<Input>();
    
    // CLI Overrides for local testing
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
        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
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

    // Extract proxy from Apify proxy groups
    let proxyUrl = '';
    if (input.proxy?.groups?.[0]?.proxyUrl) {
        proxyUrl = input.proxy.groups[0].proxyUrl;
        log.info(`Using Apify proxy: ${proxyUrl}`);
    }

    // User agents rotation
    const userAgents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

    // Initialize Crawler with stealth + proxy
    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 180,
        useSessionPool: true,
        launchContext: {
            launchOptions: {
                headless: true,
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                    '--start-maximized'
                ]
            }
        },
        preNavigationHooks: [
            async ({ page, request, session }) => {
                // Set viewport
                await page.setViewportSize({ width: 1920, height: 1080 });
                
                // Inject stealth
                await page.addInitScript(STEALTH_SCRIPT);
                
                // Set random UA
                await page.setExtraHTTPHeaders({});
                
                // Restore session if exists
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
                        log.info('Session cookies restored');
                    } catch (e: any) { log.error(`Session restore error: ${e.message}`); }
                }
            }
        ],
        requestHandler
    });

    let url = '';
    let type = '';
    
    if (mode === 'search') {
        url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(input.keyword || '咖啡')}&type=51`;
        type = 'search';
    } else if (mode === 'note') {
        url = input.noteUrl || '';
        type = 'note';
    } else if (mode === 'user') {
        url = input.userUrl || `https://www.xiaohongshu.com/user/profile/${input.userId}`;
        type = 'user';
    } else if (mode === 'comments') {
        url = input.noteUrl || '';
        type = 'comments';
    }

    log.info(`Starting scrape: ${mode} - ${url}`);
    log.info(`Proxy: ${proxyUrl || 'None (DEVELOPMENT mode - add Apify proxy for production)'}`);
    
    try {
        await crawler.run([{ url, userData: { type, keyword: input.keyword, input } }]);
    } catch (e: any) {
        log.error(`Crawler error: ${e.message}`);
    }
    
    await Actor.exit();
}

main().catch((error) => {
    console.error('Actor error:', error);
    process.exit(1);
});
