// js/video-tracker.js
import { auth } from './firebase-init.js';
import { VideoPlayer } from './player.js'; // Tumhara player import kar rahe hain reference ke liye

export const VideoTracker = {
    batchId: null,
    videoId: null,
    isPlaying: false,
    unsyncedSeconds: 0,
    getCurrentTimeFn: null, 
    syncInterval: null,
    BACKEND_URL: "https://vidyaplus-backend.vercel.app",

    init(batchId, videoId, getCurrentTimeCallback) {
        this.batchId = batchId;
        this.videoId = videoId;
        this.getCurrentTimeFn = getCurrentTimeCallback;
        this.unsyncedSeconds = 0;
        this.isPlaying = false;
        console.log(`📡 Telemetry Engine attached to Video: ${videoId}`);
        window.addEventListener('beforeunload', () => this.forceSync());
    },

    notifyPlay() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        console.log("▶️ Tracking Started");
        this.syncInterval = setInterval(() => {
            this.unsyncedSeconds++;
            if (this.unsyncedSeconds >= 30) this.syncWithBackend();
        }, 1000);
    },

    notifyPause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        clearInterval(this.syncInterval);
        console.log("⏸️ Tracking Paused - Syncing remaining data...");
        this.syncWithBackend(); 
    },

    async syncWithBackend() {
        if (this.unsyncedSeconds <= 0) return; 
        
        const timeToSync = this.unsyncedSeconds;
        this.unsyncedSeconds = 0; 

        try {
            const user = auth.currentUser;
            if (!user) return;
            const idToken = await user.getIdToken();
            const currentTime = this.getCurrentTimeFn ? this.getCurrentTimeFn() : 0; 

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
                keepalive: true 
            }).catch(e => console.error("Telemetry Sync Error:", e));

        } catch (error) {
            console.error("Token Failed:", error);
            this.unsyncedSeconds += timeToSync; 
        }
    },

    forceSync() {
        if (this.unsyncedSeconds > 0) this.syncWithBackend();
    }
};

// ==========================================
// 🔗 THE MAGIC CONNECTOR (Bina player.js chhue link karna)
// ==========================================
setTimeout(() => {
    // 1. Jab bhi koi video open hogi, ye automatically usko catch kar lega
    if(window.openVideo) {
        const originalOpenVideo = window.openVideo;
        window.openVideo = function(vidUrl, title, pdfUrl) {
            originalOpenVideo(vidUrl, title, pdfUrl); // Purana kaam waisa hi hoga

            // Video ID nikalna
            let match = vidUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
            let vidId = match ? match[1] : vidUrl;
            const currentBatchId = localStorage.getItem('vp_batch') || "unknown_batch";

            // Tracker Initialize karna
            VideoTracker.init(currentBatchId, vidId, () => {
                return (VideoPlayer.ytPlayer && typeof VideoPlayer.ytPlayer.getCurrentTime === 'function') ? VideoPlayer.ytPlayer.getCurrentTime() : 0;
            });

            // Youtube Player ki state chupke se check karna har 1 second me
            let lastState = -1;
            setInterval(() => {
                if (VideoPlayer.ytPlayer && typeof VideoPlayer.ytPlayer.getPlayerState === 'function') {
                    let currentState = VideoPlayer.ytPlayer.getPlayerState();
                    if (currentState === 1 && lastState !== 1) { // 1 = Playing
                        VideoTracker.notifyPlay();
                    } else if (currentState !== 1 && lastState === 1) { // Pause/Buffer
                        VideoTracker.notifyPause();
                    }
                    lastState = currentState;
                }
            }, 1000);
        };
    }

    // 2. Jab classroom band hoga, time save karke hi band karne dega
    if(window.closeClassroom) {
        const originalCloseClassroom = window.closeClassroom;
        window.closeClassroom = function() {
            VideoTracker.notifyPause();
            VideoTracker.forceSync(); 
            originalCloseClassroom();
        };
    }
}, 1000);

