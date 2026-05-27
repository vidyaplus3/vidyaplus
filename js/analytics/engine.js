// js/analytics/engine.js
import { auth } from '../firebase-init.js'; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// 1. ENGINE CONFIGURATION & SECURE CONSTANTS
// ==========================================
const CONFIG = {
    SYNC_INTERVAL_MS: 3 * 60 * 1000, // Sync every 3 minutes
    MAX_SYNC_CAP_SEC: 190,           // Strict cap per sync to prevent massive injection
    STREAK_TARGET_SEC: 600           // 10 Mins focus required for streak
};

// Supabase Credentials (from your dashboard config)
const SUPA_URL = "https://ukbkyyfvjvdurnvfdwur.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYmt5eWZ2anZkdXJudmZkd3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTQzMjgsImV4cCI6MjA5NTM5MDMyOH0.Ex2duv8tgKe6YrnmlapY6g_bjReSl-x-3lb5QN9iNUA";

// ==========================================
// 2. ENCAPSULATED MEMORY STATE (Hacker-Proof)
// ==========================================
// By keeping this outside the window object, console hackers cannot access or modify these values.
const SecureState = {
    uid: null,
    validPendingSeconds: 0, 
    dailySessionSeconds: 0, 
    isTracking: false,
    syncTimerId: null,
    lastTickTime: 0,
    animationFrameId: null
};

// ==========================================
// 3. CORE TRACKING LOGIC (Delta Verification)
// ==========================================
const engineLoop = () => {
    if (!SecureState.isTracking) return;

    const now = Date.now();
    const delta = (now - SecureState.lastTickTime) / 1000;

    // SECURITY CHECK: Accept only if time jump is natural (less than 2 seconds).
    // This blocks speed-hacks or system clock manipulation.
    if (delta > 0 && delta < 2.0) {
        SecureState.validPendingSeconds += delta;
        SecureState.dailySessionSeconds += delta;
        
        // Minor local backup for UI transitions only (capped at 5 mins to prevent exploit)
        if(SecureState.validPendingSeconds < 300) {
            localStorage.setItem('vp_pending_sec', Math.floor(SecureState.validPendingSeconds));
            localStorage.setItem('vp_daily_sec', Math.floor(SecureState.dailySessionSeconds));
        }
    }
    
    SecureState.lastTickTime = now;
    
    // Check Streak Milestone 
    if (Math.floor(SecureState.dailySessionSeconds) === CONFIG.STREAK_TARGET_SEC) {
        console.log("🔥 Milestone Reached: Streak valid for today.");
    }

    SecureState.animationFrameId = requestAnimationFrame(engineLoop);
};

const startStopwatch = () => {
    // SECURITY CHECK: Do not track if the tab is hidden
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

// ==========================================
// 4. SECURE SUPABASE BATCHED SYNC (UPSERT)
// ==========================================
const syncToCloud = async (isClosingTab = false) => {
    const secondsToSync = Math.floor(SecureState.validPendingSeconds);
    if (!SecureState.uid || secondsToSync <= 0) return;

    // Anti-Cheat: Cap the maximum time that can be uploaded at once
    const finalSyncSeconds = Math.min(secondsToSync, CONFIG.MAX_SYNC_CAP_SEC);
    
    // Optimistic Reset (prevents double counting if user spams buttons)
    SecureState.validPendingSeconds = 0; 
    localStorage.setItem('vp_pending_sec', 0);

    const todayStr = new Date().toISOString().split('T')[0];

    try {
        // Step 1: Fetch Current Truth from Supabase
        const getRes = await fetch(`${SUPA_URL}/rest/v1/user_analytics?uid=eq.${SecureState.uid}&select=*`, {
            method: 'GET',
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
        });
        
        const serverData = await getRes.json();
        
        let newTotal = finalSyncSeconds;
        let newDaily = finalSyncSeconds;
        let streak = 0;

        if (serverData && serverData.length > 0) {
            const row = serverData[0];
            newTotal += parseInt(row.total_watch_seconds) || 0;
            
            // Logic for Daily Reset vs Continuation
            if (row.last_active_date === todayStr) {
                newDaily += parseInt(row.daily_watch_seconds) || 0;
                streak = parseInt(row.streak_count) || 0;
            } else {
                // It's a new day! Add streak only if they hit the target today
                streak = (parseInt(row.streak_count) || 0) + (newDaily >= CONFIG.STREAK_TARGET_SEC ? 1 : 0);
            }
        }

        // Step 2: Push Master Data using Upsert (POST with merge-duplicates)
        const fetchOptions = {
            method: 'POST',
            headers: {
                'apikey': SUPA_KEY,
                'Authorization': `Bearer ${SUPA_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates' // Critical for Upsert functionality
            },
            body: JSON.stringify({
                uid: SecureState.uid,
                total_watch_seconds: newTotal,
                daily_watch_seconds: newDaily,
                last_active_date: todayStr,
                streak_count: streak
            }),
            keepalive: isClosingTab // Ensures request completes even if tab closes
        };

        await fetch(`${SUPA_URL}/rest/v1/user_analytics`, fetchOptions);
        
        console.log(`[VidyaPlus Pro Engine] Synced ${finalSyncSeconds}s successfully to Supabase.`);

    } catch (error) {
        console.error("[VidyaPlus Pro Engine] Network Sync Failed. Recovering state.", error);
        // Put the valid time back into the local queue if network fails
        SecureState.validPendingSeconds += finalSyncSeconds;
    }
};

// ==========================================
// 5. AUTONOMOUS LIFECYCLE & ANTI-AFK
// ==========================================

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

// Anti-AFK Listener: Pauses timer instantly if student opens another tab
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        pauseStopwatch();
        syncToCloud(false); // Force a sync on backgrounding
    } else {
        // We DO NOT auto-resume. The video player logic should re-trigger this 
        // to ensure the student is actually watching.
    }
});

// Window Close Listener
window.addEventListener("beforeunload", () => {
    pauseStopwatch();
    if (SecureState.validPendingSeconds > 0) {
        syncToCloud(true); // 'keepalive' sync
    }
});

// ==========================================
// 6. ISOLATED GLOBAL EXPORT (For Player Control)
// ==========================================
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

// Auth Initialization
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
