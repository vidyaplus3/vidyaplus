// js/analytics/engine.js
import { auth } from '../firebase-init.js'; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const CONFIG = {
    SYNC_INTERVAL_MS: 3 * 60 * 1000, // 3 Mins interval
    MAX_SYNC_CAP_SEC: 190,           // Anti-cheat cap
    STREAK_TARGET_SEC: 600           // 10 Mins (600s) for streak
};

// Tumhare credentials
const SUPA_URL = "https://ukbkyyfvjvdurnvfdwur.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYmt5eWZ2anZkdXJudmZkd3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTQzMjgsImV4cCI6MjA5NTM5MDMyOH0.Ex2duv8tgKe6YrnmlapY6g_bjReSl-x-3lb5QN9iNUA";

const SecureState = {
    uid: null,
    validPendingSeconds: 0, 
    dailySessionSeconds: 0, 
    isTracking: false,
    syncTimerId: null,
    lastTickTime: 0,
    animationFrameId: null
};

// 1. ENGINE LOOP (Local Tracking)
const engineLoop = () => {
    if (!SecureState.isTracking) return;

    const now = Date.now();
    const delta = (now - SecureState.lastTickTime) / 1000;

    // Reject abnormal time jumps (Speed hacks)
    if (delta > 0 && delta < 2.0) {
        SecureState.validPendingSeconds += delta;
        SecureState.dailySessionSeconds += delta;
        
        let currentLocalTotal = parseInt(localStorage.getItem('vp_total_sec')) || 0;
        localStorage.setItem('vp_total_sec', Math.floor(currentLocalTotal + delta));
        
        if(SecureState.validPendingSeconds < 300) {
            localStorage.setItem('vp_pending_sec', Math.floor(SecureState.validPendingSeconds));
            localStorage.setItem('vp_daily_sec', Math.floor(SecureState.dailySessionSeconds));
        }
    }
    
    SecureState.lastTickTime = now;
    SecureState.animationFrameId = requestAnimationFrame(engineLoop);
};

const startStopwatch = () => {
    if (SecureState.isTracking || document.hidden) return;
    SecureState.isTracking = true;
    SecureState.lastTickTime = Date.now();
    engineLoop();
};

const pauseStopwatch = () => {
    if (!SecureState.isTracking) return;
    SecureState.isTracking = false;
    cancelAnimationFrame(SecureState.animationFrameId);
};

// 2. RPC CLOUD SYNC (Direct Database Communication)
const syncToCloud = async (isClosingTab = false) => {
    const secondsToSync = Math.floor(SecureState.validPendingSeconds);
    if (!SecureState.uid || secondsToSync <= 0) return;

    const finalSyncSeconds = Math.min(secondsToSync, CONFIG.MAX_SYNC_CAP_SEC);
    
    // Clear pending instantly for optimistic UI
    SecureState.validPendingSeconds = 0; 
    localStorage.setItem('vp_pending_sec', 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const isStreakValid = SecureState.dailySessionSeconds >= CONFIG.STREAK_TARGET_SEC;

    try {
        // ✨ THE MAGIC: Calling your Supabase RPC Function directly!
        const fetchOptions = {
            method: 'POST',
            headers: {
                'apikey': SUPA_KEY,
                'Authorization': `Bearer ${SUPA_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_uid: SecureState.uid,
                p_watch_seconds: finalSyncSeconds,
                p_is_streak_valid: isStreakValid,
                p_today_date: todayStr
            }),
            keepalive: isClosingTab 
        };

        const response = await fetch(`${SUPA_URL}/rest/v1/rpc/update_telemetry`, fetchOptions);
        
        if(!response.ok) throw new Error("RPC Execution Blocked");

        console.log(`[VidyaPlus Pro Engine] Sent +${finalSyncSeconds}s via RPC.`);

    } catch (error) {
        console.error("[VidyaPlus Pro Engine] RPC Sync Failed. Retrying later.", error);
        // Put time back if network completely fails
        SecureState.validPendingSeconds += finalSyncSeconds;
    }
};

// 3. LIFECYCLE MANAGEMENT
const initializeDailySession = () => {
    const savedDate = localStorage.getItem('vp_active_date');
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (savedDate !== todayStr) {
        SecureState.dailySessionSeconds = 0;
        localStorage.setItem('vp_daily_sec', 0);
        localStorage.setItem('vp_active_date', todayStr);
    } else {
        SecureState.dailySessionSeconds = parseInt(localStorage.getItem('vp_daily_sec')) || 0;
    }
};

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        pauseStopwatch();
        syncToCloud(false); 
    }
});

window.addEventListener("beforeunload", () => {
    pauseStopwatch();
    if (SecureState.validPendingSeconds > 0) syncToCloud(true); 
});

window.VidyaAnalytics = {
    startSession: () => {
        if(!SecureState.uid) return;
        startStopwatch();
        if(!SecureState.syncTimerId) {
            SecureState.syncTimerId = setInterval(() => syncToCloud(false), CONFIG.SYNC_INTERVAL_MS);
        }
    },
    pauseSession: () => {
        pauseStopwatch();
        syncToCloud(false);
    },
    forceSync: () => syncToCloud(false)
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        SecureState.uid = user.uid;
        initializeDailySession();
    } else {
        SecureState.uid = null;
        pauseStopwatch();
        if(SecureState.syncTimerId) clearInterval(SecureState.syncTimerId);
    }
});
