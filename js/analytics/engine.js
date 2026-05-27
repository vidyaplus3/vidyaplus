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
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYmt5eWZ2anZkdXJudmZkd3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTQzMjgsImV4cCI6MjA5NTM5MDMyOH0.Ex2duv8tgKe6YrnmlapY6g_bjReSl-x-3lb5QN9iNUA";

const SecureState = Object.seal({
    validPendingSeconds: 0, 
    dailySessionSeconds: 0, 
    isTracking: false,
    syncTimerId: null
});

// 🔥 NEW: Cross-Tab Communication Channel
const tabChannel = new BroadcastChannel('vp-analytics-channel');

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

// Listen for other tabs claiming tracking authority
tabChannel.onmessage = (event) => {
    if (event.data.type === 'OTHER_TAB_PLAYING') {
        // Agar doosri tab me video play hui, toh is tab ka tracking turant band karo
        if (SecureState.isTracking) {
            console.log("[VidyaPlus Engine] Yielding tracking to another tab.");
            pauseStopwatch();
        }
    }
};

const startStopwatch = () => {
    if (SecureState.isTracking || document.hidden) return;
    SecureState.isTracking = true;
    timerWorker.postMessage('START');
    
    // Broadcast to all other tabs to stop their tracking
    tabChannel.postMessage({ type: 'OTHER_TAB_PLAYING' });
};

const pauseStopwatch = () => {
    if (!SecureState.isTracking) return;
    SecureState.isTracking = false;
    timerWorker.postMessage('STOP');
};

const syncToCloud = async (isClosingTab = false, retryCount = 0) => {
    const secondsToSync = Math.floor(SecureState.validPendingSeconds);
    const currentUser = auth.currentUser;
    
    if (!currentUser || secondsToSync <= 0) return;

    const finalSyncSeconds = Math.min(secondsToSync, CONFIG.MAX_SYNC_CAP_SEC);
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    
    const payload = JSON.stringify({
        p_watch_seconds: finalSyncSeconds,
        p_today_date: todayStr
    });

    try {
        const token = await currentUser.getIdToken();

        const fetchOptions = {
            method: 'POST',
            headers: { 
                'apikey': SUPA_KEY, 
                'Authorization': `Bearer ${token}`, 
                'Content-Type': 'application/json' 
            },
            body: payload,
            keepalive: isClosingTab // SendBeacon replacement that allows headers
        };

        const response = await fetch(`${SUPA_URL}/rest/v1/rpc/update_telemetry`, fetchOptions);
        if(!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        // Subtract ONLY on absolute success
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

// 🔥 NEW: Removed the manual start/pause API so hackers can't call it. 
// Instead, we export a binding function that attaches directly to the video element.
window.VidyaAnalytics = Object.freeze({
    bindToVideoPlayer: (videoElement) => {
        if(!videoElement || !auth.currentUser) return;
        
        console.log("[VidyaPlus Engine] Securely bound to video player.");

        // Attach events to actual video playback status
        videoElement.addEventListener('play', () => {
            if(!SecureState.syncTimerId) {
                SecureState.syncTimerId = setInterval(() => syncToCloud(false), CONFIG.SYNC_INTERVAL_MS);
            }
            startStopwatch();
        });
        
        videoElement.addEventListener('pause', pauseStopwatch);
        videoElement.addEventListener('waiting', pauseStopwatch);
        videoElement.addEventListener('ended', () => {
            pauseStopwatch();
            syncToCloud(false);
        });
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
