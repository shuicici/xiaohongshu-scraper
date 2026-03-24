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
        // Try to extract search results
        const results = await page.evaluate(() => {
            const items = [];
            // Refined selectors for 2024-2025 Xiaohongshu web
            const selectors = [
                '.note-item',
                'section.note-item',
                '.feeds-container > .note-item',
                '[class*="note-card"]',
                '.item-holder',
                '.note-container'
            ];
            let cards = document.querySelectorAll('.non-existent-element');
            for (const selector of selectors) {
                cards = document.querySelectorAll(selector);
                if (cards.length > 0)
                    break;
            }
            cards.forEach((card, idx) => {
                const title = card.querySelector('.title, [class*="title"], .desc-wrapper')?.textContent?.trim();
                const author = card.querySelector('.author, [class*="user"], .nickname')?.textContent?.trim();
                const footer = card.querySelector('.footer, [class*="footer"]')?.textContent?.trim();
                const link = card.querySelector('a')?.href;
                if (title || footer) {
                    items.push({
                        title,
                        author,
                        footer,
                        url: link,
                        index: idx
                    });
                }
            });
            return items;
        });
        apify_1.log.info(`Found ${results.length} search results`);
        if (results.length === 0) {
            apify_1.log.warning('No results found. Capturing screenshot and HTML for debugging...');
            const screenshot = await page.screenshot();
            await apify_1.Actor.setValue('debug_screenshot.png', screenshot, { contentType: 'image/png' });
            const html = await page.content();
            await apify_1.Actor.setValue('debug_page.html', html, { contentType: 'text/html' });
        }
        await apify_1.Dataset.pushData({
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
                title: document.querySelector('.title, [class*="title"], h1')?.textContent?.trim(),
                content: document.querySelector('.desc, .content, [class*="desc"]')?.textContent?.trim(),
                author: document.querySelector('.nickname, .author-name, [class*="user"]')?.textContent?.trim(),
                likes: document.querySelector('.like-wrapper, .likes, [class*="like"]')?.textContent?.trim(),
                tags: Array.from(document.querySelectorAll('.tag')).map(el => el.textContent?.trim()),
                url: window.location.href
            };
        });
        apify_1.log.info('Extracted note data');
        await apify_1.Dataset.pushData({
            mode: 'note',
            data: noteData
        });
    }
    else if (userData.type === 'user') {
        // Extract user profile
        const userProfile = await page.evaluate(() => {
            return {
                nickname: document.querySelector('.user-name, .nickname, [class*="name"]')?.textContent?.trim(),
                desc: document.querySelector('.user-desc, .desc, [class*="bio"]')?.textContent?.trim(),
                fans: document.querySelector('.user-interactions, [class*="follower"]')?.textContent?.trim(),
                url: window.location.href
            };
        });
        apify_1.log.info('Extracted user data');
        await apify_1.Dataset.pushData({
            mode: 'user',
            data: userProfile
        });
    }
    else if (userData.type === 'comments') {
        // Extract comments
        const comments = await page.evaluate(() => {
            const items = [];
            const commentEls = document.querySelectorAll('.comment-item, [class*="comment"]');
            commentEls.forEach((el) => {
                const user = el.querySelector('.nickname, .user-name, [class*="user"]')?.textContent?.trim();
                const content = el.querySelector('.note-text, .text, [class*="content"]')?.textContent?.trim();
                if (user && content) {
                    items.push({ user, content });
                }
            });
            return items;
        });
        apify_1.log.info(`Found ${comments.length} comments`);
        await apify_1.Dataset.pushData({
            mode: 'comments',
            comments: comments,
            total: comments.length
        });
    }
}
async function main() {
    await apify_1.Actor.init();
    const input = await apify_1.Actor.getInput();
    if (!input || !input.mode) {
        throw new Error('Input is required (search/note/user/comments/login)');
    }
    const { mode, keyword, limit = 20, maxPages = 3, useSession = true } = input;
    const sessionPath = path_1.default.join(process.cwd(), 'session.json');
    if (mode === 'login') {
        apify_1.log.info('Entering Login Mode...');
        apify_1.log.info('Launching headful browser for manual login...');
        const browser = await playwright.chromium.launch({ headless: false });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        await page.goto('https://www.xiaohongshu.com');
        apify_1.log.info('------------------------------------------------------------');
        apify_1.log.info('PLEASE LOG IN MANUALLY IN THE OPENED BROWSER WINDOW.');
        apify_1.log.info('The script will wait until you are logged in (up to 5 minutes).');
        apify_1.log.info('Once logged in, the session will be saved to session.json.');
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
            apify_1.log.error('Login timed out or failed. Please try again.');
            await browser.close();
            await apify_1.Actor.exit();
            return;
        }
    }
    let storageState = undefined;
    if (useSession && fs_1.default.existsSync(sessionPath)) {
        apify_1.log.info(`Loading existing session from ${sessionPath}`);
        storageState = sessionPath;
    }
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
        browserPoolOptions: {
            useFingerprints: true,
        },
        preNavigationHooks: [
            async ({ page, request }) => {
                // Set viewport
                await page.setViewportSize({ width: 1920, height: 1080 });
                // Add basic anti-detection
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                });
                // --- Restore Session from session.json ---
                if (useSession && fs_1.default.existsSync(sessionPath)) {
                    try {
                        const sessionData = JSON.parse(fs_1.default.readFileSync(sessionPath, 'utf8'));
                        // Restore Cookies
                        if (sessionData.cookies) {
                            apify_1.log.info(`Restoring ${sessionData.cookies.length} cookies from session.json`);
                            await page.context().addCookies(sessionData.cookies);
                        }
                        // Restore Local Storage
                        if (sessionData.origins) {
                            for (const originState of sessionData.origins) {
                                if (originState.origin === 'https://www.xiaohongshu.com' && originState.localStorage) {
                                    apify_1.log.info(`Restoring localStorage for ${originState.origin}`);
                                    await page.addInitScript((ls) => {
                                        for (const item of ls) {
                                            window.localStorage.setItem(item.name, item.value);
                                        }
                                    }, originState.localStorage);
                                }
                            }
                        }
                    }
                    catch (e) {
                        apify_1.log.error(`Failed to restore session: ${e.message}`);
                    }
                }
                // --- Handle Legacy Manual Cookies ---
                const inputData = request.userData.input;
                if (inputData.cookie) {
                    apify_1.log.info('Injecting manual session cookies...');
                    const cookies = inputData.cookie.split(';').map(pair => {
                        const trimmed = pair.trim();
                        if (!trimmed)
                            return null;
                        const [name, ...valueParts] = trimmed.split('=');
                        return {
                            name,
                            value: valueParts.join('='),
                            domain: '.xiaohongshu.com',
                            path: '/',
                            secure: true,
                            sameSite: 'Lax'
                        };
                    }).filter((c) => c !== null && c.name !== '' && c.value !== '');
                    if (cookies.length > 0) {
                        await page.context().addCookies(cookies);
                        const flatCookies = cookies.map(c => ({ ...c, domain: 'www.xiaohongshu.com' }));
                        await page.context().addCookies(flatCookies);
                    }
                }
            }
        ],
        requestHandler
    });
    let url = '';
    let type = '';
    switch (input.mode) {
        case 'search':
            if (!input.keyword)
                throw new Error('Keyword required for search');
            url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(input.keyword)}&type=51`;
            type = 'search';
            break;
        case 'note':
            if (!input.noteUrl)
                throw new Error('noteUrl required for note');
            url = input.noteUrl;
            type = 'note';
            break;
        case 'user':
            const userId = input.userId || input.userUrl;
            if (!userId)
                throw new Error('userId or userUrl required');
            url = userId.startsWith('http') ? userId : `https://www.xiaohongshu.com/user/profile/${userId}`;
            type = 'user';
            break;
        case 'comments':
            if (!input.noteUrl)
                throw new Error('noteUrl required for comments');
            url = input.noteUrl;
            type = 'comments';
            break;
        default:
            throw new Error(`Unknown mode: ${input.mode}`);
    }
    apify_1.log.info(`Starting scrape: ${input.mode} - ${url}`);
    await crawler.run([{
            url,
            userData: { type, input }
        }]);
    apify_1.log.info('Scraping completed');
    await apify_1.Actor.exit();
}
main().catch((error) => {
    console.error('Actor error:', error);
    process.exit(1);
});
