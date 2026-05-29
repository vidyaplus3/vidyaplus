// js/player/index.js
import { auth } from '../firebase-init.js';
import { YtEngine } from './engine-yt.js';
import { HlsEngine } from './engine-hls.js';
import { PlayerUI } from './player-ui.js';

export const VideoPlayer = {
    activeEngineName: null, 
    currentClassroomData: null,

    getEngine: () => VideoPlayer.activeEngineName === 'youtube' ? YtEngine : HlsEngine,

    initAPI: () => {
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const ytScript = document.createElement('script');
            ytScript.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(ytScript);
        }
        
        const vContainer = document.getElementById('video-container');
        if(vContainer) {
            vContainer.addEventListener('mousemove', (e) => PlayerUI.showUI(e, VideoPlayer.getEngine().isPlaying()));
            vContainer.addEventListener('touchstart', (e) => PlayerUI.showUI(e, VideoPlayer.getEngine().isPlaying()));
            vContainer.addEventListener('click', (e) => PlayerUI.showUI(e, VideoPlayer.getEngine().isPlaying()));
        }

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('settings-menu');
            if (menu && menu.classList.contains('show') && !e.target.closest('.custom-controls')) {
                menu.classList.remove('show');
            }
        });

        // Global Event Listeners for UI state sync
        window.addEventListener('vp-yt-play', () => PlayerUI.updatePlayPauseIcon(true));
        window.addEventListener('vp-yt-pause', () => PlayerUI.updatePlayPauseIcon(false));
    },

    openVideo: (vidUrl, title, pdfUrl) => {
        if(!vidUrl) return alert("Playback URL is invalid.");
        
        // UI Reset
        PlayerUI.updatePlayPauseIcon(false);
        document.getElementById('progress-fill').style.width = "0%";
        document.getElementById('time-display').innerText = "0:00";
        
        const overlay = document.getElementById('classroom-mode');
        if (!overlay.classList.contains('active')) {
            window.history.pushState({ videoOpen: true }, '', window.location.href);
            overlay.classList.add('active');
        }

        VideoPlayer.currentClassroomData = { title, pdfUrl };
        document.getElementById('video-watermark').innerText = (auth.currentUser ? auth.currentUser.email : "User") + " | VidyaPlus Secure";

        let ytMatch = vidUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
        
        if (ytMatch) {
            HlsEngine.destroy();
            VideoPlayer.activeEngineName = 'youtube';
            YtEngine.init(ytMatch[1], 
                (e) => { e.target.playVideo(); PlayerUI.startProgressTracking(YtEngine); },
                (e) => {
                    PlayerUI.updatePlayPauseIcon(e.data === 1);
                    PlayerUI.showUI(null, e.data === 1);
                    window.dispatchEvent(new CustomEvent(e.data === 1 ? 'vp-yt-play' : 'vp-yt-pause'));
                }
            );
        } else {
            YtEngine.destroy();
            VideoPlayer.activeEngineName = 'hls';
            HlsEngine.init(vidUrl, () => PlayerUI.startProgressTracking(HlsEngine));
        }
    },

    // js/player/index.js ke andar is function ko update karo 👇
closeVideo: () => {
    const overlay = document.getElementById('classroom-mode');
    if (overlay && overlay.classList.contains('active')) {
        window.dispatchEvent(new CustomEvent('vp-yt-pause')); 
        
        // 1. UI Controller ke interval ko stop karo
        if (PlayerUI && PlayerUI.stopProgressTracking) {
            PlayerUI.stopProgressTracking();
        }
        
        // 2. 🚨 BULLETPROOF FIX: Dono engines ko explicitely pause/stop karo 
        // Taaki background mein chalne ka koi chance hi na bache
        try {
            if (YtEngine && YtEngine.pause) YtEngine.pause();
        } catch(e) { console.log("YT pause bypass"); }

        try {
            if (HlsEngine && HlsEngine.pause) HlsEngine.pause();
        } catch(e) { console.log("HLS pause bypass"); }
        
        // 3. Overlay ko remove karo
        overlay.classList.remove('active'); 
    }
},
    
    togglePlay: () => {
        const engine = VideoPlayer.getEngine();
        if(engine.isMuted()) { engine.unMute(); document.getElementById('mute-icon').className = "fas fa-volume-up"; }
        engine.isPlaying() ? engine.pause() : engine.play();
    },

    toggleMute: () => {
        const engine = VideoPlayer.getEngine();
        const icon = document.getElementById('mute-icon');
        if (engine.isMuted()) { engine.unMute(); icon.className = "fas fa-volume-up"; } 
        else { engine.mute(); icon.className = "fas fa-volume-mute"; }
    },

    skipVideo: (seconds) => {
        const engine = VideoPlayer.getEngine();
        engine.seek(engine.getCurrentTime() + seconds);
    },

    setSpeed: (rate) => {
        VideoPlayer.getEngine().setSpeed(rate);
        document.querySelectorAll('.speed-opt').forEach(el => el.classList.remove('active'));
        document.getElementById('spd-' + rate).classList.add('active');
    },

    toggleFullScreen: () => {
        let container = document.getElementById('video-container');
        if (!document.fullscreenElement) {
            if(container.requestFullscreen) container.requestFullscreen();
            else if(container.webkitRequestFullscreen) container.webkitRequestFullscreen(); 
        } else {
            if(document.exitFullscreen) document.exitFullscreen();
            else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    },

    handleShieldClick: () => {
        const controls = document.getElementById('custom-controls');
        if(controls && controls.classList.contains('hidden')) PlayerUI.showUI(null, VideoPlayer.getEngine().isPlaying());
        else VideoPlayer.togglePlay();
    },

    // Drag Logic (Passes calculations to Engine via Seek)
    startDrag: (e) => { PlayerUI.isDragging = true; VideoPlayer.updateScrub(e); },
    stopDrag: (e) => { if(PlayerUI.isDragging) { VideoPlayer.updateScrub(e); PlayerUI.isDragging = false; } },
    doDrag: (e) => { if(PlayerUI.isDragging) VideoPlayer.updateScrub(e); },
    
    updateScrub: (e) => {
        let bg = document.getElementById('progress-bg');
        if(!bg) return;
        let rect = bg.getBoundingClientRect();
        let clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : (e.clientX || 0);
        if(clientX === 0 && e.changedTouches) clientX = e.changedTouches[0].clientX; 
        
        let percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const engine = VideoPlayer.getEngine();
        let duration = engine.getDuration();
        
        engine.seek(percentage * duration);
        document.getElementById('progress-fill').style.width = (percentage * 100) + "%";
        document.getElementById('time-display').innerText = PlayerUI.formatTime(percentage * duration);
    }
};

// Global Bindings For HTML onclick events
window.togglePlay = VideoPlayer.togglePlay;
window.skipVideo = VideoPlayer.skipVideo;
window.toggleMute = VideoPlayer.toggleMute;
window.toggleFullScreen = VideoPlayer.toggleFullScreen;
window.toggleSettings = PlayerUI.toggleSettings;
window.setSpeed = VideoPlayer.setSpeed;
window.handleShieldClick = VideoPlayer.handleShieldClick;
window.startDrag = VideoPlayer.startDrag;
window.stopDrag = VideoPlayer.stopDrag;
window.doDrag = VideoPlayer.doDrag;
window.closeClassroom = VideoPlayer.closeVideo; 
window.openVideo = VideoPlayer.openVideo;

VideoPlayer.initAPI();

