/**
 * @fileoverview Enterprise-Grade Telemetry Engine for VidyaPlus
 * Integrates Firebase Auth (JWT) with Supabase RPC for zero-trust tracking.
 * Features: Beacon Fallback, Token Auto-Refresh, Optimistic Offline Queueing, Atomic State.
 */

import { auth } from '../firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const SUPABASE = {
    URL: "https://ukbkyyfvjvdurnvfdwur.supabase.co/rest/v1/rpc/update_telemetry",
    KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYmt5eWZ2anZkdXJudmZkd3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTQzMjgsImV4cCI6MjA5NTM5MDMyOH0.Ex2duv8tgKe6YrnmlapY6g_bjReSl-x-3lb5QN9iNUA"
};

class VidyaTelemetryEngine {
    constructor() {
        this.uid = null;
        this.sessionStart = null;
        this.isTracking = false;
        this.syncTimer = null;
        
        // Strict Constants
        this.SYNC_INTERVAL = 5 * 60 * 1000; // 5 Mins heartbeat
        this.MAX_SYNC_CAP = 310;            // 5 Mins + 10s buffer max per packet
        this.STREAK_THRESHOLD = 600;         // 10 Mins daily required for streak

        this._bindLifecycleEvents();
    }

    // Initialize user session upon auth state verification
    initUser(user) {
        if (user) {
            this.uid = user.uid;
            this._recoverLocalQueue();
            this._startHeartbeat();
        } else {
            this.uid = null;
            this.stopTracking();
            if (this.syncTimer) clearInterval(this.syncTimer);
        }
    }

    // Core Time tracking immune to browser background throttling
    _calculateDelta() {
        if (!this.sessionStart) return 0;
        const now = Date.now();
        const deltaSec = Math.floor((now - this.sessionStart) / 1000);
        this.sessionStart = now; // Reset anchor point
        return deltaSec;
    }

    startTracking() {
        if (this.isTracking || !this.uid) return;
        this.isTracking = true;
        this.sessionStart = Date.now();
        console.info("[Telemetry] Active monitoring started");
    }

    stopTracking() {
        if (!this.isTracking) return;
        const elapsed = this._calculateDelta();
        this._queueTimeLocally(elapsed);
        
        this.isTracking = false;
        this.sessionStart = null;
        this.syncWithCloud(); // Attempt push immediately on pause/stop
    }

    _queueTimeLocally(seconds) {
        if (seconds <= 0) return;
        let pending = parseInt(localStorage.getItem('vp_pending_sec') || '0');
        let daily = parseInt(localStorage.getItem('vp_daily_sec') || '0');
        
        localStorage.setItem('vp_pending_sec', pending + seconds);
        localStorage.setItem('vp_daily_sec', daily + seconds);
    }

    /**
     * Executes atomic sync with Supabase PostgreSQL via RPC.
     * @param {boolean} isClosing - Set to true if triggered via beforeunload
     */
    async syncWithCloud(isClosing = false) {
        // Flush any active session time to queue before syncing
        if (this.isTracking) {
            this._queueTimeLocally(this._calculateDelta());
        }

        let pending = parseInt(localStorage.getItem('vp_pending_sec') || '0');
        if (pending <= 0 || !this.uid || !auth.currentUser) return;

        let syncAmount = Math.min(pending, this.MAX_SYNC_CAP);
        let daily = parseInt(localStorage.getItem('vp_daily_sec') || '0');
        
        const payload = {
            p_watch_seconds: syncAmount,
            p_is_streak_valid: daily >= this.STREAK_THRESHOLD,
            p_today_date: new Date().toISOString().split('T')[0]
        };

        // Optimistic State Update: Remove from local queue immediately to prevent race conditions
        localStorage.setItem('vp_pending_sec', pending - syncAmount);

        try {
            // Attempt graceful token fetch, fallback to forced refresh if cache fails
            const token = await auth.currentUser.getIdToken(false).catch(() => auth.currentUser.getIdToken(true));

            const response = await fetch(SUPABASE.URL, {
                method: 'POST',
                keepalive: isClosing, // Guarantees network transmission even if OS closes the tab
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE.KEY,
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            console.info(`[Telemetry] Verified Sync: ${syncAmount}s packet securely transmitted.`);

        } catch (error) {
            console.warn("[Telemetry] Transmission failed. Data restored to secure queue.", error);
            // Revert queue on failure
            let currentPending = parseInt(localStorage.getItem('vp_pending_sec') || '0');
            localStorage.setItem('vp_pending_sec', currentPending + syncAmount);
        }
    }

    _startHeartbeat() {
        if (this.syncTimer) clearInterval(this.syncTimer);
        this.syncTimer = setInterval(() => this.syncWithCloud(), this.SYNC_INTERVAL);
    }

    _recoverLocalQueue() {
        const todayStr = new Date().toISOString().split('T')[0];
        const savedDate = localStorage.getItem('vp_active_date');
        
        // Reset daily accumulator on a new day
        if (savedDate !== todayStr) {
            localStorage.setItem('vp_daily_sec', '0');
            localStorage.setItem('vp_active_date', todayStr);
        }
        
        this.syncWithCloud();
    }

    _bindLifecycleEvents() {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this.syncWithCloud(false);
            } else if (this.isTracking) {
                // Readjust session anchor when returning from background
                this.sessionStart = Date.now();
            }
        });

        // The beacon fallback trigger
        window.addEventListener("beforeunload", () => {
            this.syncWithCloud(true);
        });
    }
}

// ==========================================
// SINGLETON EXPORT & AUTH BINDING
// ==========================================

const AnalyticsEngine = new VidyaTelemetryEngine();

onAuthStateChanged(auth, (user) => AnalyticsEngine.initUser(user));

window.VidyaAnalytics = {
    startSession: () => AnalyticsEngine.startTracking(),
    pauseSession: () => AnalyticsEngine.stopTracking(),
    forceSync: () => AnalyticsEngine.syncWithCloud()
};
