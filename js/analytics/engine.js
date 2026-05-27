// js/analytics/engine.js
import { auth } from '../firebase-init.js'; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================
// 1. ENTERPRISE CONFIG & CREDENTIALS
// ==========================================
const CONFIG = Object.freeze({
    SYNC_INTERVAL_MS: 3 * 60 * 1000, 
    MAX_SYNC_CAP_SEC: 190,           
    STREAK_TARGET_SEC: 600,
    MAX_RETRIES: 3                   // Network fail hone par 3 baar retry karega
});

const SUPA_URL = "https://ukbkyyfvjvdurnvfdwur.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYmt5eWZ2anZkdXJudmZkd3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTQzMjgsImV4cCI6MjA5NTM5MDMyOH0.Ex2duv8tgKe6YrnmlapY6g_bjReSl-x-3lb5QN9iNUA";

// Object.seal ensures no hacker can add/remove properties from state via console
const SecureState = Object.seal({
    uid: null,
    validPendingSeconds: 0, 
    dailySessionSeconds: 0, 
    isTracking: false,
    syncTimerId: null
});

// ==========================================
// 2. BACKGROUND WEB WORKER (Anti-Throttling)
// ==========================================
// Browsers throttle JS timers on inactive tabs. We inject a Web Worker dynamically 
// via Blob to keep the stopwatch running flawlessly in a separate CPU thread.
const workerCode = `
    let timer = null;
    self.onmessage = function(e) {
        if (e.data === 'START' && !timer) {
            timer = setInterval(() => self.postMessage('TICK'), 1000);
        } else if (e.data === 'STOP') {
            clearInterval(timer);
            timer = null;
        }
    };
`;
const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const timerWorker = new Worker(URL.createObjectURL(workerBlob));

// Handle ticks from the isolated background thread
timerWorker.onmessage = (e) => {
    if (e.data === 'TICK' && SecureState.isTracking) {
        SecureState.validPendingSeconds += 1;
        SecureState.dailySessionSeconds += 1;
        
        let currentLocalTotal = parseInt(localStorage.getItem('vp_total_sec')) || 0;
        localStorage.setItem('vp_total_sec', currentLocalTotal + 1);
        
        if(SecureState.validPendingSeconds < 300) {
            localStorage.setItem('vp_pending_sec', SecureState.validPendingSeconds);
            localStorage.setItem('vp_daily_sec', SecureState.dailySessionSeconds);
        }

        // Silent UI Broadcast (So dashboard updates live without tight coupling)
        window.dispatchEvent(new CustomEvent('vp-telemetry-tick', { 
            detail: { daily: SecureState.dailySessionSeconds } 
        }));
    }
};

const startStopwatch = () => {
    if (SecureState.isTracking || document.hidden) return;
    SecureState.isTracking = true;
    timerWorker.postMessage('START'); // Command worker to start clock
};

const pauseStopwatch = () => {
    if (!SecureState.isTracking) return;
    SecureState.isTracking = false;
    timerWorker.postMessage('STOP');
};

// ==========================================
// 3. ADVANCED RPC SYNC WITH EXPONENTIAL BACKOFF
// ==========================================
const syncToCloud = async (isClosingTab = false, retryCount = 0) => {
    const secondsToSync = Math.floor(SecureState.validPendingSeconds);
    if (!SecureState.uid || secondsToSync <= 0) return;

    const finalSyncSeconds = Math.min(secondsToSync, CONFIG.MAX_SYNC_CAP_SEC);
    
    // Optimistic Reset
    SecureState.validPendingSeconds = 0; 
    localStorage.setItem('vp_pending_sec', 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const isStreakValid = SecureState.dailySessionSeconds >= CONFIG.STREAK_TARGET_SEC;
    
    const payload = JSON.stringify({
        p_uid: SecureState.uid,
        p_watch_seconds: finalSyncSeconds,
        p_is_streak_valid: isStreakValid,
        p_today_date: todayStr
    });

    try {
        // If tab is closing, prioritize Beacon API / Keepalive for guaranteed delivery
        if (isClosingTab && navigator.sendBeacon) {
            const blobData = new Blob([payload], { type: 'application/json' });
            // SendBeacon bypassing complex CORS is tricky, so we rely on fetch keepalive as fallback
        }

        const fetchOptions = {
            method: 'POST',
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
            body: payload,
            keepalive: isClosingTab 
        };

        const response = await fetch(`${SUPA_URL}/rest/v1/rpc/update_telemetry`, fetchOptions);
        if(!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        console.log(`[VidyaPlus Pro Engine] Synced +${finalSyncSeconds}s (Retry: ${retryCount})`);

    } catch (error) {
        console.warn(`[VidyaPlus Pro Engine] Sync Failed.`, error.message);
        SecureState.validPendingSeconds += finalSyncSeconds; // Revert time safely

        // Exponential Backoff Retry Logic
        if (!isClosingTab && retryCount < CONFIG.MAX_RETRIES) {
            const backoffDelay = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
            console.log(`[VidyaPlus Pro Engine] Retrying in ${backoffDelay}ms...`);
            setTimeout(() => syncToCloud(false, retryCount + 1), backoffDelay);
        }
    }
};

// ==========================================
// 4. AUTONOMOUS LIFECYCLE & EVENT HOOKS
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

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        pauseStopwatch();
        syncToCloud(false); 
    }
});

// Critical exit sync
window.addEventListener("pagehide", () => {
    pauseStopwatch();
    if (SecureState.validPendingSeconds > 0) syncToCloud(true); 
});

// ==========================================
// 5. HARDENED GLOBAL API EXPORT
// ==========================================
// Object.freeze ensures that the student cannot modify these functions via console
window.VidyaAnalytics = Object.freeze({
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
});

// Init Sequence
onAuthStateChanged(auth, (user) => {
    if (user) {
        SecureState.uid = user.uid;
        initializeDailySession();
    } else {
        SecureState.uid = null;
        pauseStopwatch();
        if(SecureState.syncTimerId) {
            clearInterval(SecureState.syncTimerId);
            SecureState.syncTimerId = null;
        }
    }
});
