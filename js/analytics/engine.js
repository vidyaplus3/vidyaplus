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

// 🔥 SAFE PARSER: LocalStorage se NaN / null values ko safely handle karega
const getSafeLocalInt = (key) => {
    const val = parseInt(localStorage.getItem(key), 10);
    return isNaN(val) ? 0 : val;
};

// 🔥 Cross-Tab Communication Channel (Anti-Multi-Tab Tracking)
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
        
        // 🔥 FIX: Using Safe Parser here
        let currentLocalTotal = getSafeLocalInt('vp_total_sec');
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
            console.warn("[VidyaPlus Engine] Multiple tabs detected. Yielding tracking to active tab.");
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

let isSyncInProgress = false; // 🔥 Global Lock flag to prevent duplicate calls

const syncToCloud = async (isClosingTab = false, retryCount = 0) => {
    // Race Condition Prevention
    if (isSyncInProgress) return;
    
    const secondsToSync = Math.floor(SecureState.validPendingSeconds);
    const currentUser = auth.currentUser;
    
    if (!currentUser || secondsToSync <= 0) return;

    const finalSyncSeconds = Math.min(secondsToSync, CONFIG.MAX_SYNC_CAP_SEC);
    
    // OPTIMISTIC LOCKING: Payload bhejne se PEHLE hi subtract kar lo
    SecureState.validPendingSeconds -= finalSyncSeconds; 
    localStorage.setItem('vp_pending_sec', SecureState.validPendingSeconds);
    
    isSyncInProgress = true; 

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
            keepalive: isClosingTab 
        };

        const response = await fetch(`${SUPA_URL}/rest/v1/rpc/update_telemetry`, fetchOptions);
        if(!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        console.log(`[VidyaPlus Pro Engine] Synced +${finalSyncSeconds}s`);
        isSyncInProgress = false; // Sync successful

    } catch (error) {
        console.warn(`[VidyaPlus Pro Engine] Sync Failed.`, error.message);
        
        // Rollback: network fail hua toh seconds wapas de do
        SecureState.validPendingSeconds += finalSyncSeconds; 
        localStorage.setItem('vp_pending_sec', SecureState.validPendingSeconds);
        
        isSyncInProgress = false; 
        
        // SAFE RETRY LOGIC
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
        // 🔥 FIX: Using Safe Parser here too
        SecureState.dailySessionSeconds = getSafeLocalInt('vp_daily_sec');
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
    bindToVideoPlayer: (videoElement) => {
        if(!videoElement || !auth.currentUser) return;
        
        console.log("[VidyaPlus Engine] Securely bound to video player.");

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

// YouTube Events Binding (from player.js)
window.addEventListener('vp-yt-play', () => {
    if(auth.currentUser) {
        if(!SecureState.syncTimerId) {
            SecureState.syncTimerId = setInterval(() => syncToCloud(false), CONFIG.SYNC_INTERVAL_MS);
        }
        startStopwatch();
    }
});

window.addEventListener('vp-yt-pause', () => {
    pauseStopwatch();
});
