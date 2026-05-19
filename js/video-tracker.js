// js/video-tracker.js
import { auth } from './firebase-init.js';

export const VideoTracker = {
    batchId: null,
    videoId: null,
    isPlaying: false,
    unsyncedSeconds: 0,
    getCurrentTimeFn: null, // Callback to get video current time (e.g. 14:20)
    syncInterval: null,
    BACKEND_URL: "https://vidyaplus-backend.vercel.app",

    // 1. Setup the tracker when user opens a video
    init(batchId, videoId, getCurrentTimeCallback) {
        this.batchId = batchId;
        this.videoId = videoId;
        this.getCurrentTimeFn = getCurrentTimeCallback;
        this.unsyncedSeconds = 0;
        this.isPlaying = false;
        
        console.log(`📡 Telemetry Engine attached to Video: ${videoId}`);

        // Safety Catch: Agar bachha achanak tab close kar de
        window.addEventListener('beforeunload', () => this.forceSync());
    },

    // 2. Call this when video PLAY button is clicked
    notifyPlay() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        console.log("▶️ Tracking Started");
        
        this.syncInterval = setInterval(() => {
            this.unsyncedSeconds++;
            
            // Har 30 seconds me server par silent update bhejo
            if (this.unsyncedSeconds >= 30) {
                this.syncWithBackend();
            }
        }, 1000);
    },

    // 3. Call this when video PAUSE button is clicked or buffers
    notifyPause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        
        clearInterval(this.syncInterval);
        console.log("⏸️ Tracking Paused - Syncing remaining data...");
        this.syncWithBackend(); 
    },

    // 4. The Brain: Sends data securely to Vercel
    async syncWithBackend() {
        if (this.unsyncedSeconds <= 0) return; // No new data to send
        
        const timeToSync = this.unsyncedSeconds;
        this.unsyncedSeconds = 0; // Reset immediately to prevent double counting

        try {
            const user = auth.currentUser;
            if (!user) return;
            
            const idToken = await user.getIdToken();
            
            // Kahan chhodi video? (e.g., 860 seconds)
            const currentTime = this.getCurrentTimeFn ? this.getCurrentTimeFn() : 0; 

            // Fire-and-forget background request
            fetch(`${this.BACKEND_URL}/syncWatchTime`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${idToken}` 
                },
                body: JSON.stringify({
                    batchId: this.batchId,
                    videoId: this.videoId,
                    timeWatchedSeconds: timeToSync,
                    videoCurrentTime: currentTime
                }),
                keepalive: true // Ensures request sends even if tab is closing
            }).catch(e => console.error("Telemetry Sync Silent Error:", e));

        } catch (error) {
            console.error("Token Generation Failed:", error);
            // Agar sync fail ho gaya, toh time wapas add kar lo taki data loss na ho
            this.unsyncedSeconds += timeToSync; 
        }
    },

    forceSync() {
        if (this.unsyncedSeconds > 0) {
            this.syncWithBackend();
        }
    }
};

