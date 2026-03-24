import { Actor } from 'apify';
import { Router } from './routes/router.js';

interface Input {
    mode: 'search' | 'note' | 'user' | 'comments';
    keyword?: string;
    noteUrl?: string;
    userId?: string;
    userUrl?: string;
    limit?: number;
    proxy?: {
        useApifyProxy?: boolean;
        apifyProxyGroups?: string[];
    };
}

async function main() {
    const input = await Actor.getInput<Input>();
    
    if (!input || !input.mode) {
        throw new Error('Input is required. Please provide a valid input with mode.');
    }

    const router = new Router();

    switch (input.mode) {
        case 'search':
            if (!input.keyword) {
                throw new Error('Keyword is required for search mode');
            }
            await router.handleSearch(input.keyword, input.limit || 20);
            break;
            
        case 'note':
            if (!input.noteUrl) {
                throw new Error('Note URL is required for note mode');
            }
            await router.handleNote(input.noteUrl);
            break;
            
        case 'user':
            const userIdentifier = input.userId || input.userUrl;
            if (!userIdentifier) {
                throw new Error('User ID or User URL is required for user mode');
            }
            await router.handleUser(userIdentifier, input.limit || 20);
            break;
            
        case 'comments':
            if (!input.noteUrl) {
                throw new Error('Note URL is required for comments mode');
            }
            await router.handleComments(input.noteUrl, input.limit || 50);
            break;
            
        default:
            throw new Error(`Unknown mode: ${input.mode}`);
    }
}

main().catch((error) => {
    console.error('Actor error:', error);
    process.exit(1);
});
