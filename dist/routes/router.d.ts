declare class XiaohongshuScraper {
    private client;
    constructor();
    /**
     * Search notes by keyword
     */
    handleSearch(keyword: string, limit: number): Promise<void>;
    /**
     * Get single note details
     */
    handleNote(noteUrl: string): Promise<void>;
    /**
     * Get user profile and their notes
     */
    handleUser(userIdentifier: string, limit: number): Promise<void>;
    /**
     * Extract comments from a note
     */
    handleComments(noteUrl: string, limit: number): Promise<void>;
    private parseSearchResults;
    private parseNoteDetail;
    private parseUserInfo;
    private parseUserNotes;
    private parseComments;
    private extractImages;
    private extractNoteId;
    private extractUserId;
}
export { XiaohongshuScraper };
