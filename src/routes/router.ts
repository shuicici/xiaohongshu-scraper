import { Dataset } from 'apify';
import axios, { AxiosInstance } from 'axios';

// Simple logging
const log = {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warning: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`)
};

// Mobile user agent to bypass anti-bot
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

interface Note {
    id: string;
    title: string;
    content: string;
    author: {
        id: string;
        nickname: string;
        avatar: string;
        desc: string;
    };
    images: string[];
    tags: string[];
    likes: number;
    collects: number;
    comments: number;
    shares: number;
    timestamp: string;
    url: string;
}

interface User {
    id: string;
    nickname: string;
    avatar: string;
    desc: string;
    follows: number;
    fans: number;
    posts: number;
    isRedStar: boolean;
    url: string;
}

interface Comment {
    id: string;
    user: {
        id: string;
        nickname: string;
        avatar: string;
    };
    content: string;
    likes: number;
    timestamp: string;
    replies?: Comment[];
}

class XiaohongshuScraper {
    private client: AxiosInstance;
    
    constructor() {
        this.client = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': MOBILE_UA,
                'Referer': 'https://www.xiaohongshu.com/',
                'Origin': 'https://www.xiaohongshu.com',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            }
        });
    }

    /**
     * Search notes by keyword
     */
    async handleSearch(keyword: string, limit: number): Promise<void> {
        log.info(`Searching for: ${keyword}, limit: ${limit}`);
        
        const searchUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/search/notes?keyword=${encodeURIComponent(keyword)}&page=1&page_size=${limit}`;
        
        try {
            const response = await this.client.get(searchUrl);
            const notes: Note[] = this.parseSearchResults(response.data);
            
            await Dataset.pushData({
                mode: 'search',
                keyword,
                results: notes,
                total: notes.length
            });
            
            log.info(`Found ${notes.length} notes for keyword: ${keyword}`);
            
        } catch (error: any) {
            log.error(`Search failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get single note details
     */
    async handleNote(noteUrl: string): Promise<void> {
        log.info(`Fetching note: ${noteUrl}`);
        
        const noteId = this.extractNoteId(noteUrl);
        
        if (!noteId) {
            throw new Error(`Invalid note URL: ${noteUrl}`);
        }
        
        const apiUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/feed/${noteId}?image_formats=jpg,webp`;
        
        try {
            const response = await this.client.get(apiUrl);
            const note = this.parseNoteDetail(response.data);
            
            await Dataset.pushData({
                mode: 'note',
                url: noteUrl,
                data: note
            });
            
            log.info(`Fetched note: ${note.title}`);
            
        } catch (error: any) {
            log.error(`Failed to fetch note: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get user profile and their notes
     */
    async handleUser(userIdentifier: string, limit: number): Promise<void> {
        log.info(`Fetching user: ${userIdentifier}`);
        
        let userId: string;
        
        if (userIdentifier.startsWith('http')) {
            const extracted = this.extractUserId(userIdentifier);
            if (!extracted) {
                throw new Error(`Invalid user URL: ${userIdentifier}`);
            }
            userId = extracted;
        } else {
            userId = userIdentifier;
        }
        
        if (!userId) {
            throw new Error(`Invalid user identifier: ${userIdentifier}`);
        }
        
        const apiUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo/${userId}`;
        
        try {
            const userResponse = await this.client.get(apiUrl);
            const user = this.parseUserInfo(userResponse.data);
            
            let notes: Note[] = [];
            try {
                const notesResponse = await this.client.get(
                    `https://edith.xiaohongshu.com/api/sns/web/v1/user/notes/${userId}?page=1&page_size=${limit}`
                );
                notes = this.parseUserNotes(notesResponse.data);
            } catch (e) {
                log.warning('Could not fetch user notes');
            }
            
            await Dataset.pushData({
                mode: 'user',
                userId,
                user,
                notes,
                notesCount: notes.length
            });
            
            log.info(`Fetched user: ${user.nickname}, ${notes.length} notes`);
            
        } catch (error: any) {
            log.error(`Failed to fetch user: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract comments from a note
     */
    async handleComments(noteUrl: string, limit: number): Promise<void> {
        log.info(`Fetching comments for: ${noteUrl}`);
        
        const noteId = this.extractNoteId(noteUrl);
        
        if (!noteId) {
            throw new Error(`Invalid note URL: ${noteUrl}`);
        }
        
        const apiUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/notes/${noteId}/comments?page=1&page_size=${limit}`;
        
        try {
            const response = await this.client.get(apiUrl);
            const comments = this.parseComments(response.data);
            
            await Dataset.pushData({
                mode: 'comments',
                noteId,
                noteUrl,
                comments,
                totalComments: comments.length
            });
            
            log.info(`Fetched ${comments.length} comments`);
            
        } catch (error: any) {
            log.error(`Failed to fetch comments: ${error.message}`);
            throw error;
        }
    }

    // Helper: Parse search results
    private parseSearchResults(data: any): Note[] {
        const notes: Note[] = [];
        
        try {
            const items = data?.data?.items || data?.items || [];
            
            for (const item of items) {
                const noteCard = item.note_card || item;
                
                notes.push({
                    id: noteCard.note_id || noteCard.id || '',
                    title: noteCard.title || '',
                    content: noteCard.desc || noteCard.content || '',
                    author: {
                        id: noteCard.user?.user_id || noteCard.userId || '',
                        nickname: noteCard.user?.nickname || noteCard.nickname || '',
                        avatar: noteCard.user?.avatar || noteCard.userImage || '',
                        desc: noteCard.user?.desc || ''
                    },
                    images: this.extractImages(noteCard),
                    tags: noteCard.tag_list || [],
                    likes: noteCard.liked_count || noteCard.likes || 0,
                    collects: noteCard.collected_count || noteCard.collects || 0,
                    comments: noteCard.comment_count || noteCard.comments || 0,
                    shares: noteCard.share_count || 0,
                    timestamp: noteCard.time || noteCard.publishTime || '',
                    url: `https://www.xiaohongshu.com/explore/${noteCard.note_id || noteCard.id}`
                });
            }
        } catch (error) {
            log.error('Error parsing search results');
        }
        
        return notes;
    }

    // Helper: Parse note detail
    private parseNoteDetail(data: any): Note {
        const note = data?.data?.note || data?.note || data;
        
        return {
            id: note.note_id || note.id || '',
            title: note.title || '',
            content: note.desc || note.content || '',
            author: {
                id: note.user?.user_id || '',
                nickname: note.user?.nickname || '',
                avatar: note.user?.avatar || '',
                desc: note.user?.desc || ''
            },
            images: this.extractImages(note),
            tags: note.tag_list || [],
            likes: note.liked_count || 0,
            collects: note.collected_count || 0,
            comments: note.comment_count || 0,
            shares: note.share_count || 0,
            timestamp: note.time || '',
            url: `https://www.xiaohongshu.com/explore/${note.note_id || note.id}`
        };
    }

    // Helper: Parse user info
    private parseUserInfo(data: any): User {
        const user = data?.data?.userInfo || data?.user || data;
        
        return {
            id: user.user_id || user.id || '',
            nickname: user.nickname || '',
            avatar: user.image || user.avatar || '',
            desc: user.desc || user.description || '',
            follows: user.follows || user.followingCount || 0,
            fans: user.fans || user.followerCount || 0,
            posts: user.posts || user.noteCount || 0,
            isRedStar: user.redStar || false,
            url: `https://www.xiaohongshu.com/user/profile/${user.user_id || user.id}`
        };
    }

    // Helper: Parse user notes
    private parseUserNotes(data: any): Note[] {
        const items = data?.data?.notes || data?.notes || [];
        
        return items.map((note: any) => ({
            id: note.note_id || note.id || '',
            title: note.title || '',
            content: note.desc || '',
            author: {
                id: '',
                nickname: '',
                avatar: '',
                desc: ''
            },
            images: this.extractImages(note),
            tags: note.tag_list || [],
            likes: note.liked_count || 0,
            collects: note.collected_count || 0,
            comments: note.comment_count || 0,
            shares: note.share_count || 0,
            timestamp: note.time || '',
            url: `https://www.xiaohongshu.com/explore/${note.note_id || note.id}`
        }));
    }

    // Helper: Parse comments
    private parseComments(data: any): Comment[] {
        const comments: Comment[] = [];
        
        try {
            const items = data?.data?.comments || data?.comments || [];
            
            for (const item of items) {
                const comment: Comment = {
                    id: item.comment_id || item.id || '',
                    user: {
                        id: item.user?.user_id || '',
                        nickname: item.user?.nickname || '',
                        avatar: item.user?.avatar || ''
                    },
                    content: item.content || '',
                    likes: item.liked_count || 0,
                    timestamp: item.createTime || ''
                };
                
                if (item.replies && item.replies.length > 0) {
                    comment.replies = item.replies.map((reply: any) => ({
                        id: reply.comment_id || reply.id || '',
                        user: {
                            id: reply.user?.user_id || '',
                            nickname: reply.user?.nickname || '',
                            avatar: reply.user?.avatar || ''
                        },
                        content: reply.content || '',
                        likes: reply.liked_count || 0,
                        timestamp: reply.createTime || ''
                    }));
                }
                
                comments.push(comment);
            }
        } catch (error) {
            log.error('Error parsing comments');
        }
        
        return comments;
    }

    // Helper: Extract images from note
    private extractImages(note: any): string[] {
        const images: string[] = [];
        
        if (note.images) {
            for (const img of note.images) {
                if (img.url) {
                    images.push(img.url);
                } else if (img.file_webrate_url) {
                    images.push(img.file_webrate_url);
                }
            }
        }
        
        if (note.image_list) {
            for (const img of note.image_list) {
                if (img.url) images.push(img.url);
            }
        }
        
        return images;
    }

    // Helper: Extract note ID from URL
    private extractNoteId(url: string): string | null {
        const match = url.match(/explore\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    // Helper: Extract user ID from URL
    private extractUserId(url: string): string | null {
        const match = url.match(/profile\/([a-zA-Z0-9-]+)/);
        return match ? match[1] : null;
    }
}

export { XiaohongshuScraper };
