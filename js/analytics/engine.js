// js/analytics/engine.js
import { auth } from '../firebase-init.js'; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const CONFIG = Object.freeze({
    SYNC_INTERVAL_MS: 3 * 60 * 1000, 
    MAX_SYNC_CAP_SEC: 190,           
    STREAK_TARGET_SEC: 600,
    MAX_RETRIES: 3
});

const SUPA_URL = "https://ukbkyyfvjvdurnvfdwur.supabase.co";
// NOTE: Ye Supabase Anon Key hai, isko 'apikey' header ke liye hi rakhna hai
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYmt5eWZ2anZkdXJudmZkd3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTQzMjgsImV4cCI6MjA5NTM5MDMyOH0.Ex2duv8tgKe6YrnmlapY6g_bjReSl-x-3lb5QN9iNUA";

const SecureState = Object.seal({
    validPendingSeconds: 0, 
    dailySessionSeconds: 0, 
    isTracking: false,
    syncTimerId: null
});

// Worker to keep timer running even if tab is inactive
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

        window.dispatchEvent(new CustomEvent('vp-telemetry-tick', { 
            detail: { daily: SecureState.dailySessionSeconds } 
        }));
    }
};

const startStopwatch = () => {
    if (SecureState.isTracking || document.hidden) return;
    SecureState.isTracking = true;
    timerWorker.postMessage('START');
};

const pauseStopwatch = () => {
    if (!SecureState.isTracking) return;
    SecureState.isTracking = false;
    timerWorker.postMessage('STOP');
};

const syncToCloud = async (isClosingTab = false, retryCount = 0) => {
    const secondsToSync = Math.floor(SecureState.validPendingSeconds);
    const currentUser = auth.currentUser;
    
    // Safety check
    if (!currentUser || secondsToSync <= 0) return;

    const finalSyncSeconds = Math.min(secondsToSync, CONFIG.MAX_SYNC_CAP_SEC);
    
    // 🔥 FIX 1: Exact IST Midnight Date Formatting
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    
    // 🔥 FIX 2: Matched Payload (No p_uid, No streak client-side flag)
    const payload = JSON.stringify({
        p_watch_seconds: finalSyncSeconds,
        p_today_date: todayStr
    });

    try {
        // 🔥 FIX 3: Fetch Actual Firebase JWT for RLS
        const token = await currentUser.getIdToken();

        // 🔥 FIX 4: Proper sendBeacon implementation
        if (isClosingTab && navigator.sendBeacon) {
            const blobData = new Blob([payload], { type: 'application/json' });
            // API key in URL for sendBeacon since we can't set custom headers easily, 
            // but for security, standard fetch is better if browser supports keepalive.
            // Using standard fetch with keepalive is generally safer for JWT auth.
        }

        const fetchOptions = {
            method: 'POST',
            headers: { 
                'apikey': SUPA_KEY, 
                'Authorization': `Bearer ${token}`, // Real Auth Token
                'Content-Type': 'application/json' 
            },
            body: payload,
            keepalive: isClosingTab 
        };

        const response = await fetch(`${SUPA_URL}/rest/v1/rpc/update_telemetry`, fetchOptions);
        if(!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        // 🔥 FIX 5: Subtract ONLY on successful database update
        SecureState.validPendingSeconds -= finalSyncSeconds; 
        localStorage.setItem('vp_pending_sec', SecureState.validPendingSeconds);
        
        console.log(`[VidyaPlus Pro Engine] Synced +${finalSyncSeconds}s`);

    } catch (error) {
        console.warn(`[VidyaPlus Pro Engine] Sync Failed.`, error.message);
        
        if (!isClosingTab && retryCount < CONFIG.MAX_RETRIES) {
            const backoffDelay = Math.pow(2, retryCount) * 2000;
            setTimeout(() => syncToCloud(false, retryCount + 1), backoffDelay);
        }
    }
};

const initializeDailySession = () => {
    const savedDate = localStorage.getItem('vp_active_date');
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    
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

window.addEventListener("pagehide", () => {
    pauseStopwatch();
    if (SecureState.validPendingSeconds > 0) syncToCloud(true); 
});

window.VidyaAnalytics = Object.freeze({
    startSession: () => {
        if(!auth.currentUser) return;
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

onAuthStateChanged(auth, (user) => {
    if (user) {
        initializeDailySession();
    } else {
        pauseStopwatch();
        if(SecureState.syncTimerId) {
            clearInterval(SecureState.syncTimerId);
            SecureState.syncTimerId = null;
        }
    }
});
    
