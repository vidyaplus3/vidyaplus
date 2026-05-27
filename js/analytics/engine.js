/**
 * @fileoverview Ultra-Enterprise Telemetry Engine v3.0 | VidyaPlus
 * Features: BroadcastChannel (Multi-tab protection), Exponential Backoff, 
 * Network Navigator, sendBeacon API Fallback.
 */

import { auth } from '../firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const SUPABASE = {
    URL: "https://ukbkyyfvjvdurnvfdwur.supabase.co/rest/v1/rpc/update_telemetry",
    KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYmt5eWZ2anZkdXJudmZkd3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTQzMjgsImV4cCI6MjA5NTM5MDMyOH0.Ex2duv8tgKe6YrnmlapY6g_bjReSl-x-3lb5QN9iNUA"
};

class UltraTelemetryEngine {
    constructor() {
        this.uid = null;
        this.sessionAnchor = null;
        this.isTracking = false;
        this.syncTimer = null;
        this.retryCount = 0;
        
        // Strict Constraints
        this.SYNC_INTERVAL = 4 * 60 * 1000;  // 4 Mins optimal heartbeat
        this.MAX_SYNC_CAP = 300;             // Max 5 mins packet
        this.STREAK_THRESHOLD = 600;         // 10 Mins daily requirement

        // Cross-Tab Communication (Anti-Cheat)
        this.tabChannel = new BroadcastChannel('vidyaplus_telemetry_bus');
        this.isMasterTab = true; 

        this._initNetworkListeners();
        this._bindLifecycleEvents();
        this._initTabElection();
    }

    // =========================================
    // 1. CROSS-TAB ELECTION (Multi-Tab Protection)
    // =========================================
    _initTabElection() {
        // Jab naya tab khule, baakiyo ko batao
        this.tabChannel.postMessage({ type: 'NEW_TAB_OPENED', time: Date.now() });

        this.tabChannel.onmessage = (event) => {
            const data = event.data;
            if (data.type === 'NEW_TAB_OPENED') {
                // Agar main purana tab hu, toh naye tab ko bolunga main Master hu
                this.tabChannel.postMessage({ type: 'I_AM_MASTER' });
            } 
            else if (data.type === 'I_AM_MASTER') {
                // Agar kisi aur tab ne kaha wo master hai, toh main tracking band kar dunga
                console.warn("[Telemetry] Multiple tabs detected. Yielding tracking to Master Tab.");
                this.isMasterTab = false;
                this.stopTracking(true); // Force stop locally
            }
        };
    }

    // =========================================
    // 2. CORE ENGINE INITIALIZATION
    // =========================================
    initUser(user) {
        if (user) {
            this.uid = user.uid;
            this._recoverState();
            this._startHeartbeat();
        } else {
            this.uid = null;
            this.stopTracking();
            if (this.syncTimer) clearInterval(this.syncTimer);
        }
    }

    _calculateDelta() {
        if (!this.sessionAnchor || !this.isMasterTab) return 0;
        const now = Date.now();
        const deltaSec = Math.floor((now - this.sessionAnchor) / 1000);
        this.sessionAnchor = now; 
        return deltaSec;
    }

    startTracking() {
        if (this.isTracking || !this.uid || !this.isMasterTab) return;
        this.isTracking = true;
        this.sessionAnchor = Date.now();
        console.info("[Telemetry] High-precision monitoring engaged.");
    }

    stopTracking(force = false) {
        if (!this.isTracking && !force) return;
        const elapsed = this._calculateDelta();
        this._queueTime(elapsed);
        
        this.isTracking = false;
        this.sessionAnchor = null;
        if(navigator.onLine) this.syncWithCloud(); 
    }

    _queueTime(seconds) {
        if (seconds <= 0) return;
        let pending = parseInt(localStorage.getItem('vp_pending_sec') || '0');
        let daily = parseInt(localStorage.getItem('vp_daily_sec') || '0');
        
        localStorage.setItem('vp_pending_sec', pending + seconds);
        localStorage.setItem('vp_daily_sec', daily + seconds);
    }

    // =========================================
    // 3. ADVANCED NETWORK & SYNC LOGIC
    // =========================================
    async syncWithCloud(isClosing = false) {
        if (this.isTracking) this._queueTime(this._calculateDelta());

        let pending = parseInt(localStorage.getItem('vp_pending_sec') || '0');
        if (pending <= 0 || !this.uid || !auth.currentUser || !navigator.onLine) return;

        let syncAmount = Math.min(pending, this.MAX_SYNC_CAP);
        let daily = parseInt(localStorage.getItem('vp_daily_sec') || '0');
        
        const payload = {
            p_watch_seconds: syncAmount,
            p_is_streak_valid: daily >= this.STREAK_THRESHOLD,
            p_today_date: new Date().toISOString().split('T')[0]
        };

        // Optimistic Deduction
        localStorage.setItem('vp_pending_sec', pending - syncAmount);

        try {
            const token = await auth.currentUser.getIdToken();
            
            // OS-Level Guarantee during Tab Close
            if (isClosing && navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                navigator.sendBeacon(SUPABASE.URL, blob);
                return;
            }

            const response = await fetch(SUPABASE.URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE.KEY,
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`Server Rejected: ${response.status}`);
            
            console.info(`[Telemetry] Packet secured: ${syncAmount}s`);
            this.retryCount = 0; // Reset retry logic on success

        } catch (error) {
            console.error("[Telemetry] Transmission Error:", error);
            
            // Revert Deduction
            let currentPending = parseInt(localStorage.getItem('vp_pending_sec') || '0');
            localStorage.setItem('vp_pending_sec', currentPending + syncAmount);
            
            // Exponential Backoff Trigger (Max 3 retries)
            if (!isClosing && this.retryCount < 3) {
                this.retryCount++;
                const backoffTime = Math.pow(2, this.retryCount) * 2000; // 4s, 8s, 16s
                console.warn(`[Telemetry] Retrying in ${backoffTime/1000}s...`);
                setTimeout(() => this.syncWithCloud(), backoffTime);
            }
        }
    }

    _startHeartbeat() {
        if (this.syncTimer) clearInterval(this.syncTimer);
        this.syncTimer = setInterval(() => {
            // Adjust sync dynamically based on network connection (Slow 3G gets fewer syncs)
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (connection && connection.effectiveType === 'slow-2g') return; // Skip heartbeat if net is extremely poor
            
            this.syncWithCloud();
        }, this.SYNC_INTERVAL);
    }

    // =========================================
    // 4. LIFECYCLE & RECOVERY
    // =========================================
    _recoverState() {
        const todayStr = new Date().toISOString().split('T')[0];
        const savedDate = localStorage.getItem('vp_active_date');
        
        if (savedDate !== todayStr) {
            localStorage.setItem('vp_daily_sec', '0');
            localStorage.setItem('vp_active_date', todayStr);
        }
        if(navigator.onLine) this.syncWithCloud();
    }

    _initNetworkListeners() {
        window.addEventListener('online', () => {
            console.info("[Telemetry] Network restored. Flushing offline queue.");
            this.retryCount = 0;
            this.syncWithCloud();
        });
        window.addEventListener('offline', () => {
            console.warn("[Telemetry] Connection lost. Storing data in secure offline queue.");
        });
    }

    _bindLifecycleEvents() {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this.syncWithCloud(false);
            } else if (this.isTracking && this.isMasterTab) {
                this.sessionAnchor = Date.now();
            }
        });

        window.addEventListener("pagehide", () => this.syncWithCloud(true)); // More reliable than beforeunload on mobile
        window.addEventListener("beforeunload", () => this.syncWithCloud(true));
    }
}

// =========================================
// SINGLETON EXPORT & BINDINGS
// =========================================

const Engine = new UltraTelemetryEngine();

onAuthStateChanged(auth, (user) => Engine.initUser(user));

window.VidyaAnalytics = {
    startSession: () => Engine.startTracking(),
    pauseSession: () => Engine.stopTracking(),
    forceSync: () => Engine.syncWithCloud()
};
                                
