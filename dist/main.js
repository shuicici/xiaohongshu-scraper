"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const apify_1 = require("apify");
const crawlee_1 = require("crawlee");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const playwright = __importStar(require("playwright"));
// Function to scroll and load more content
async function scrollToLoad(page, maxPages) {
    for (let i = 0; i < maxPages; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(1000 + Math.random() * 1000);
    }
}
// This function is called for each URL
async function requestHandler({ page, request }) {
    const userData = request.userData;
    const input = userData.input;
    // Wait for page to load
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => { });
    // Scroll if needed
    if (userData.type === 'search' || userData.type === 'user') {
        const scrollCount = input.maxPages ?? 3;
        if (scrollCount > 0) {
            apify_1.log.info(`Scrolling ${scrollCount} times to load more results...`);
            await scrollToLoad(page, scrollCount);
        }
    }
    // Add delay to appear more human
    await page.waitForTimeout(2000 + Math.random() * 2000);
    const title = await page.title();
    apify_1.log.info(`Page title: ${title}`);
    if (userData.type === 'search') {
        const results = await page.evaluate(() => {
            const items = [];
            const selectors = ['.note-item', 'section.note-item', '[class*="note-card"]', '.item-holder'];
            let cards = document.querySelectorAll('.non-existent');
            for (const s of selectors) {
                const found = document.querySelectorAll(s);
                if (found.length > 0) {
                    cards = found;
                    break;
                }
            }
            cards.forEach((card, idx) => {
                const title = card.querySelector('.title, [class*="title"]')?.textContent?.trim();
                const author = card.querySelector('.nickname, [class*="user"]')?.textContent?.trim();
                const link = card.querySelector('a')?.href;
                if (title || author)
                    items.push({ title, author, url: link, index: idx });
            });
            return items;
        });
        apify_1.log.info(`Found ${results.length} search results`);
        if (results.length === 0) {
            const screenshot = await page.screenshot();
            await apify_1.Actor.setValue('debug_screenshot.png', screenshot, { contentType: 'image/png' });
            const html = await page.content();
            await apify_1.Actor.setValue('debug_page.html', html, { contentType: 'text/html' });
        }
        await apify_1.Dataset.pushData({ mode: 'search', keyword: userData.keyword, results, url: request.url });
    }
    else if (userData.type === 'note' || userData.type === 'comments') {
        const data = await page.evaluate(() => ({
            title: document.querySelector('.title, h1')?.textContent?.trim(),
            content: document.querySelector('.desc, .content')?.textContent?.trim(),
            author: document.querySelector('.nickname')?.textContent?.trim(),
            url: window.location.href
        }));
        await apify_1.Dataset.pushData({ mode: userData.type, data });
    }
}
async function main() {
    await apify_1.Actor.init();
    let input = await apify_1.Actor.getInput();
    // CLI Overrides for local testing (node dist/main.js --mode=login)
    const args = process.argv.slice(2);
    const cliInput = {};
    args.forEach(arg => {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            if (key)
                cliInput[key] = value === undefined ? true : (value === 'true' ? true : (value === 'false' ? false : (!isNaN(Number(value)) ? Number(value) : value)));
        }
    });
    input = { ...input, ...cliInput };
    if (!input || !input.mode) {
        throw new Error('Input is required (search/note/user/comments/login)');
    }
    const { mode, useSession = true } = input;
    const sessionPath = path_1.default.join(process.cwd(), 'session.json');
    if (mode === 'login') {
        apify_1.log.info('Entering Login Mode. Launching headful browser...');
        const browser = await playwright.chromium.launch({ headless: false });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        await page.goto('https://www.xiaohongshu.com');
        apify_1.log.info('------------------------------------------------------------');
        apify_1.log.info('PLEASE LOG IN MANUALLY IN THE BROWSER.');
        apify_1.log.info('The session will be saved to session.json when login is detected.');
        apify_1.log.info('------------------------------------------------------------');
        try {
            await page.waitForSelector('.side-bar-avatar, .user-name, .logout, .user-avatar', { timeout: 300000 });
            apify_1.log.info('Login detected! Saving session...');
            await context.storageState({ path: sessionPath });
            apify_1.log.info(`Session saved successfully to ${sessionPath}`);
            await browser.close();
            await apify_1.Actor.exit();
            return;
        }
        catch (error) {
            apify_1.log.error('Login timed out.');
            await browser.close();
            await apify_1.Actor.exit();
            return;
        }
    }
    // Initialize Crawler
    const crawler = new crawlee_1.PlaywrightCrawler({
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
                if (useSession && fs_1.default.existsSync(sessionPath)) {
                    try {
                        const sessionData = JSON.parse(fs_1.default.readFileSync(sessionPath, 'utf8'));
                        if (sessionData.cookies)
                            await page.context().addCookies(sessionData.cookies);
                        if (sessionData.origins) {
                            for (const originState of sessionData.origins) {
                                if (originState.origin.includes('xiaohongshu.com') && originState.localStorage) {
                                    await page.addInitScript((ls) => {
                                        for (const item of ls)
                                            window.localStorage.setItem(item.name, item.value);
                                    }, originState.localStorage);
                                }
                            }
                        }
                    }
                    catch (e) {
                        apify_1.log.error(`Session error: ${e.message}`);
                    }
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
    }
    else if (mode === 'note') {
        url = input.noteUrl || '';
        type = 'note';
    }
    else if (mode === 'user') {
        url = input.userUrl || `https://www.xiaohongshu.com/user/profile/${input.userId}`;
        type = 'user';
    }
    apify_1.log.info(`Starting scrape: ${mode} - ${url}`);
    await crawler.run([{ url, userData: { type, input } }]);
    await apify_1.Actor.exit();
}
main().catch((error) => {
    console.error('Actor error:', error);
    process.exit(1);
});
