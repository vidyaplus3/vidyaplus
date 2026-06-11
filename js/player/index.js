// js/player/index.js
import { auth } from '../firebase-init.js';
import { YtEngine } from './engine-yt.js';
import { HlsEngine } from './engine-hls.js';
import { PlayerUI } from './player-ui.js';

let shieldClickTimer = null; 

export const VideoPlayer = {
    activeEngineName: null, 
    currentClassroomData: null,
    justExitedFullscreen: false, // 🚨 NAYA FLAG: Race condition fix karne ke liye

    get progressInterval() { return PlayerUI.progressInterval; },
    showUI: (e) => {
        const engine = VideoPlayer.getEngine();
        PlayerUI.showUI(e, engine ? engine.isPlaying() : false);
    },
    toggleSettings: (e) => PlayerUI.toggleSettings(e),

    getEngine: () => VideoPlayer.activeEngineName === 'youtube' ? YtEngine : HlsEngine,

    initAPI: () => {
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const ytScript = document.createElement('script');
            ytScript.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(ytScript);
        }
        
        const vContainer = document.getElementById('video-container');
        if(vContainer) {
            vContainer.addEventListener('mousemove', VideoPlayer.showUI);
            vContainer.addEventListener('touchstart', VideoPlayer.showUI);
            PlayerUI.initGestures(vContainer, VideoPlayer.skipVideo);
        }

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('settings-menu');
            if (menu && menu.classList.contains('show') && !e.target.closest('.custom-controls')) {
                menu.classList.remove('show');
                const spdDrop = document.getElementById('speed-dropdown');
                const qDrop = document.getElementById('quality-dropdown');
                if(spdDrop) spdDrop.classList.remove('show');
                if(qDrop) qDrop.classList.remove('show');
            }
        });

        window.addEventListener('vp-yt-play', () => PlayerUI.updatePlayPauseIcon(true));
        window.addEventListener('vp-yt-pause', () => PlayerUI.updatePlayPauseIcon(false));

        PlayerUI.initKeyboardShortcuts(
            VideoPlayer.togglePlay, 
            VideoPlayer.skipVideo, 
            VideoPlayer.toggleMute, 
            VideoPlayer.toggleFullScreen
        );

        // 🚨 NAYA FIX: Fullscreen exit hone par ek 0.5 sec ka safety buffer lagana
        const fsChangeHandler = () => {
            const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            if (!isFullscreen) {
                VideoPlayer.justExitedFullscreen = true;
                setTimeout(() => { VideoPlayer.justExitedFullscreen = false; }, 500); 
            }
        };
        document.addEventListener('fullscreenchange', fsChangeHandler);
        document.addEventListener('webkitfullscreenchange', fsChangeHandler);
        document.addEventListener('mozfullscreenchange', fsChangeHandler);

        // 🚨 UPDATED POPSTATE (BACK BUTTON) HANDLER 🚨
        window.addEventListener('popstate', (e) => {
            const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            
            // Agar fullscreen on hai, YA browser ne just abhi natively fullscreen band kiya hai
            if (isFullscreen || VideoPlayer.justExitedFullscreen) {
                if (isFullscreen) {
                    if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                }
                
                // Classroom overlay ko band hone se rokne ke liye wapas ek history step add kar do
                window.history.pushState({ videoOpen: true }, '', window.location.href);
                return; // Code yahin ruk jayega, video close nahi hogi!
            }

            // Normal mode mein back dabane par poora video close karo
            const overlay = document.getElementById('classroom-mode');
            if (overlay && overlay.classList.contains('active')) {
                VideoPlayer.closeVideo(true); 
            }
        });
    },

    openVideo: (vidUrl, title, pdfUrl) => {
        if(!vidUrl) return alert("Playback URL is invalid.");
        
        PlayerUI.updatePlayPauseIcon(false);
        document.getElementById('progress-fill').style.width = "0%";
        
        const currentEl = document.getElementById('time-current');
        const durationEl = document.getElementById('time-duration');
        if(currentEl) currentEl.innerText = "0:00";
        if(durationEl) durationEl.innerText = "0:00";
        
        const spdDrop = document.getElementById('speed-dropdown');
        const qDrop = document.getElementById('quality-dropdown');
        const menu = document.getElementById('settings-menu');
        if(spdDrop) spdDrop.classList.remove('show');
        if(qDrop) qDrop.classList.remove('show');
        if(menu) menu.classList.remove('show');
        
        const slider = document.getElementById('volume-slider');
        if(slider) {
            slider.value = 0;
            slider.style.background = `linear-gradient(to right, white 0%, rgba(255, 255, 255, 0.25) 0%)`;
        }

        VideoPlayer.currentClassroomData = { title, pdfUrl };
        document.getElementById('video-watermark').innerText = (auth.currentUser ? auth.currentUser.email : "User") + " | VidyaPlus Secure";

        let ytMatch = vidUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
        
        if (ytMatch) {
            HlsEngine.destroy();
            VideoPlayer.activeEngineName = 'youtube';
            document.getElementById('quality-badge').style.display = 'none'; 
            document.getElementById('quality-dropdown').style.opacity = '0.5';
            document.getElementById('quality-dropdown').style.pointerEvents = 'none';

            YtEngine.init(ytMatch[1], 
                (e) => { 
                    e.target.playVideo(); 
                    PlayerUI.startProgressTracking(YtEngine); 
                    PlayerUI.initTooltip(YtEngine); 
                    PlayerUI.initVolumeSlider(YtEngine); 
                },
                (e) => {
                    PlayerUI.updatePlayPauseIcon(e.data === 1);
                    VideoPlayer.showUI(null);
                    window.dispatchEvent(new CustomEvent(e.data === 1 ? 'vp-yt-play' : 'vp-yt-pause'));
                }
            );
        } else {
            YtEngine.destroy();
            VideoPlayer.activeEngineName = 'hls';
            document.getElementById('quality-badge').style.display = 'inline-block'; 
            document.getElementById('quality-dropdown').style.opacity = '1';
            document.getElementById('quality-dropdown').style.pointerEvents = 'auto';

            HlsEngine.init(vidUrl, () => {
                PlayerUI.startProgressTracking(HlsEngine);
                PlayerUI.initTooltip(HlsEngine); 
                PlayerUI.initVolumeSlider(HlsEngine); 
            });
        }
    },

        closeVideo: () => {
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        if (isFullscreen) {
            if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
        window.dispatchEvent(new CustomEvent('vp-yt-pause')); 
        PlayerUI.stopProgressTracking();
        const engine = VideoPlayer.getEngine();
        if(engine) engine.pause();
        
        // Seedha back bhej dein
        window.history.back(); 
    },
    

    togglePlay: () => {
        const engine = VideoPlayer.getEngine();
        if(!engine) return;
        if(engine.isMuted()) { engine.unMute(); document.getElementById('mute-icon').className = "fas fa-volume-up"; }
        engine.isPlaying() ? engine.pause() : engine.play();
    },

    toggleMute: () => {
        const engine = VideoPlayer.getEngine();
        if(!engine) return;
        const icon = document.getElementById('mute-icon');
        const slider = document.getElementById('volume-slider');

        if (engine.isMuted()) { 
            engine.unMute(); 
            icon.className = "fas fa-volume-up"; 
            if(slider) {
                slider.value = 1;
                slider.style.background = `linear-gradient(to right, white 100%, rgba(255, 255, 255, 0.25) 100%)`;
            }
        } else { 
            engine.mute(); 
            icon.className = "fas fa-volume-mute"; 
            if(slider) {
                slider.value = 0;
                slider.style.background = `linear-gradient(to right, white 0%, rgba(255, 255, 255, 0.25) 0%)`;
            }
        }
    },

    skipVideo: (seconds) => {
        const engine = VideoPlayer.getEngine();
        if(engine) engine.seek(engine.getCurrentTime() + seconds);
    },

    setSpeed: (rate) => {
        const engine = VideoPlayer.getEngine();
        if(engine) engine.setSpeed(rate);
        document.querySelectorAll('.speed-opt').forEach(el => el.classList.remove('active'));
        const activeBtn = document.getElementById('spd-' + rate);
        if(activeBtn) activeBtn.classList.add('active');
        
        document.getElementById('speed-dropdown').classList.remove('show');
        document.getElementById('settings-menu').classList.remove('show');
    },

    setQuality: (qualityStr) => {
        document.querySelectorAll('.quality-opt').forEach(el => el.classList.remove('active'));
        event.target.classList.add('active');
        
        const badge = document.getElementById('quality-badge');
        if(badge) {
            badge.innerText = qualityStr.toUpperCase();
            badge.style.display = 'inline-block';
        }

        const engine = VideoPlayer.getEngine();
        if(engine && engine.setQuality) {
            engine.setQuality(qualityStr);
        } else {
            console.warn("Quality selection not supported for the active engine.");
        }
        
        document.getElementById('quality-dropdown').classList.remove('show');
        document.getElementById('settings-menu').classList.remove('show');
    },

    toggleFullScreen: () => {
        let container = document.getElementById('video-container');
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
        if (!isFullscreen) {
            if(container.requestFullscreen) container.requestFullscreen();
            else if(container.webkitRequestFullscreen) container.webkitRequestFullscreen(); 
        } else {
            if(document.exitFullscreen) document.exitFullscreen();
            else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    },

    handleShieldClick: () => {
        const controls = document.getElementById('custom-controls');
        if(controls && controls.classList.contains('hidden')) {
            VideoPlayer.showUI(null);
            return;
        }
        
        if (shieldClickTimer) {
            clearTimeout(shieldClickTimer);
            shieldClickTimer = null; 
        } else {
            shieldClickTimer = setTimeout(() => {
                VideoPlayer.togglePlay();
                shieldClickTimer = null;
            }, 250); 
        }
    },

    startDrag: (e) => { PlayerUI.isDragging = true; VideoPlayer.updateScrub(e); },
    
    stopDrag: (e) => { 
        if(PlayerUI.isDragging) { 
            VideoPlayer.updateScrub(e); 
            PlayerUI.isDragging = false; 
            
            PlayerUI.isSeekLocked = true;
            clearTimeout(PlayerUI.seekLockTimeout);
            PlayerUI.seekLockTimeout = setTimeout(() => {
                PlayerUI.isSeekLocked = false;
            }, 1500); 
        } 
    },
    
    doDrag: (e) => { if(PlayerUI.isDragging) VideoPlayer.updateScrub(e); },
    
    updateScrub: (e) => {
        let bg = document.getElementById('progress-bg');
        if(!bg) return;
        let rect = bg.getBoundingClientRect();
        let clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : (e.clientX || 0);
        if(clientX === 0 && e.changedTouches) clientX = e.changedTouches[0].clientX; 
        
        let percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const engine = VideoPlayer.getEngine();
        if(!engine) return;
        
        let duration = engine.getDuration();
        engine.seek(percentage * duration);
        
        document.getElementById('progress-fill').style.width = (percentage * 100) + "%";
        
        const timeCurrent = document.getElementById('time-current');
        if(timeCurrent) timeCurrent.innerText = PlayerUI.formatTime(percentage * duration);
    }
};

window.togglePlay = VideoPlayer.togglePlay;
window.skipVideo = VideoPlayer.skipVideo;
window.toggleMute = VideoPlayer.toggleMute;
window.toggleFullScreen = VideoPlayer.toggleFullScreen;
window.toggleSettings = VideoPlayer.toggleSettings;
window.setSpeed = VideoPlayer.setSpeed;
window.setQuality = VideoPlayer.setQuality; 
window.handleShieldClick = VideoPlayer.handleShieldClick;
window.startDrag = VideoPlayer.startDrag;
window.stopDrag = VideoPlayer.stopDrag;
window.doDrag = VideoPlayer.doDrag;
window.closeClassroom = VideoPlayer.closeVideo; 
window.openVideo = VideoPlayer.openVideo;

VideoPlayer.initAPI();
