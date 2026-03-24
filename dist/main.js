"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apify_1 = require("apify");
const router_js_1 = require("./routes/router.js");
async function main() {
    const input = await apify_1.Actor.getInput();
    if (!input || !input.mode) {
        throw new Error('Input is required. Please provide a valid input with mode.');
    }
    const scraper = new router_js_1.XiaohongshuScraper();
    switch (input.mode) {
        case 'search':
            if (!input.keyword) {
                throw new Error('Keyword is required for search mode');
            }
            await scraper.handleSearch(input.keyword, input.limit || 20);
            break;
        case 'note':
            if (!input.noteUrl) {
                throw new Error('Note URL is required for note mode');
            }
            await scraper.handleNote(input.noteUrl);
            break;
        case 'user':
            const userIdentifier = input.userId || input.userUrl;
            if (!userIdentifier) {
                throw new Error('User ID or User URL is required for user mode');
            }
            await scraper.handleUser(userIdentifier, input.limit || 20);
            break;
        case 'comments':
            if (!input.noteUrl) {
                throw new Error('Note URL is required for comments mode');
            }
            await scraper.handleComments(input.noteUrl, input.limit || 50);
            break;
        default:
            throw new Error(`Unknown mode: ${input.mode}`);
    }
}
main().catch((error) => {
    console.error('Actor error:', error);
    process.exit(1);
});
