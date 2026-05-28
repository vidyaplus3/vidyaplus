// js/player.js
import { auth } from './firebase-init.js';

export const VideoPlayer = {
    ytPlayer: null,
    progressInterval: null,
    isDragging: false,
    uiTimeout: null,
    lastMouseX: -1,
    lastMouseY: -1,
    currentClassroomData: null,

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
            vContainer.addEventListener('click', VideoPlayer.showUI);
        }

        document.addEventListener('click', (e) => {
            const menu = document.getElementById('settings-menu');
            if (menu && menu.classList.contains('show') && !e.target.closest('.custom-controls')) {
                menu.classList.remove('show');
            }
        });
    },

    formatTime: (time) => {
        if(isNaN(time)) return "0:00";
        let min = Math.floor(time / 60);
        let sec = Math.floor(time % 60);
        return min + ":" + (sec < 10 ? "0" + sec : sec);
    },

    openVideo: (vidUrl, title, pdfUrl) => {
        if(!vidUrl) return alert("Playback URL is invalid.");
        let match = vidUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
        let vidId = match ? match[1] : vidUrl;
        
        if(typeof YT === 'undefined' || !YT.Player) return alert("Player initializing. Please try again in 2 seconds.");

        document.getElementById('play-icon').className = "fas fa-pause";
        document.getElementById('progress-fill').style.width = "0%";
        document.getElementById('time-display').innerText = "0:00";
        
        const muteIconEl = document.getElementById('mute-icon');
        if(muteIconEl) muteIconEl.className = "fas fa-volume-mute"; 
        
        const overlay = document.getElementById('classroom-mode');
        if (!overlay.classList.contains('active')) {
            window.history.pushState({ videoOpen: true }, '', window.location.href);
            overlay.classList.add('active');
        }

        VideoPlayer.currentClassroomData = { title, pdfUrl };
        let userEmail = auth.currentUser ? auth.currentUser.email : "Authenticated User";
        document.getElementById('video-watermark').innerText = userEmail + " | VidyaPlus";

        if (VideoPlayer.ytPlayer && typeof VideoPlayer.ytPlayer.destroy === 'function') {
            VideoPlayer.ytPlayer.destroy();
            VideoPlayer.ytPlayer = null;
        }
        
        VideoPlayer.ytPlayer = new YT.Player('vp-player', {
            videoId: vidId,
            playerVars: { 'autoplay': 1, 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0, 'showinfo': 0, 'playsinline': 1, 'origin': window.location.origin, 'mute': 1 },
            events: {
                'onReady': (event) => { 
                    event.target.playVideo(); 
                    if(VideoPlayer.progressInterval) clearInterval(VideoPlayer.progressInterval);
                    VideoPlayer.progressInterval = setInterval(VideoPlayer.updateProgressBar, 500);
                },
                'onStateChange': (event) => {
                    let icon = document.getElementById('play-icon');
                    // 1 = Playing
                    if(event.data === 1) { 
                        icon.className = "fas fa-pause"; 
                        VideoPlayer.showUI(); 
                        // Dispatch secure event for engine.js to catch
                        window.dispatchEvent(new CustomEvent('vp-yt-play'));
                    } 
                    // 2 = Paused, 0 = Ended, 3 = Buffering
                    else if (event.data === 2 || event.data === 0 || event.data === 3) { 
                        icon.className = "fas fa-play"; 
                        VideoPlayer.showUI(); 
                        // Dispatch secure event for engine.js to catch
                        window.dispatchEvent(new CustomEvent('vp-yt-pause'));
                    }
                }
            }
        });
    },

    closeVideo: () => {
        const overlay = document.getElementById('classroom-mode');
        if (overlay.classList.contains('active')) {
            window.dispatchEvent(new CustomEvent('vp-yt-pause')); // Force pause analytics
            if(VideoPlayer.progressInterval) clearInterval(VideoPlayer.progressInterval); 
            if(VideoPlayer.ytPlayer && VideoPlayer.ytPlayer.pauseVideo) VideoPlayer.ytPlayer.pauseVideo();
            overlay.classList.remove('active'); // Close UI manually
            // window.history.back(); // Optional: depend on your routing
        }
    },

    togglePlay: () => {
        if(!VideoPlayer.ytPlayer || !VideoPlayer.ytPlayer.getPlayerState) return;
        if(VideoPlayer.ytPlayer.isMuted()) {
            VideoPlayer.ytPlayer.unMute();
            document.getElementById('mute-icon').className = "fas fa-volume-up";
        }
        let state = VideoPlayer.ytPlayer.getPlayerState();
        let icon = document.getElementById('play-icon');
        if (state === 1) { 
            VideoPlayer.ytPlayer.pauseVideo();
            icon.className = "fas fa-play";
        } else { 
            VideoPlayer.ytPlayer.playVideo();
            icon.className = "fas fa-pause";
        }
    },

    toggleMute: () => {
        if(!VideoPlayer.ytPlayer) return;
        let icon = document.getElementById('mute-icon');
        if (VideoPlayer.ytPlayer.isMuted()) {
            VideoPlayer.ytPlayer.unMute();
            icon.className = "fas fa-volume-up";
        } else {
            VideoPlayer.ytPlayer.mute();
            icon.className = "fas fa-volume-mute";
        }
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

    skipVideo: (seconds) => {
        if(!VideoPlayer.ytPlayer || !VideoPlayer.ytPlayer.getCurrentTime) return;
        let newTime = VideoPlayer.ytPlayer.getCurrentTime() + seconds;
        VideoPlayer.ytPlayer.seekTo(newTime, true);
    },

    setSpeed: (rate) => {
        if(!VideoPlayer.ytPlayer || !VideoPlayer.ytPlayer.setPlaybackRate) return;
        VideoPlayer.ytPlayer.setPlaybackRate(rate);
        document.querySelectorAll('.speed-opt').forEach(el => el.classList.remove('active'));
        document.getElementById('spd-' + rate).classList.add('active');
    },

    updateProgressBar: () => {
        if(VideoPlayer.ytPlayer && VideoPlayer.ytPlayer.getCurrentTime && !VideoPlayer.isDragging) {
            let current = VideoPlayer.ytPlayer.getCurrentTime();
            let duration = VideoPlayer.ytPlayer.getDuration();
            if(duration > 0) {
                let percentage = (current / duration) * 100;
                document.getElementById('progress-fill').style.width = percentage + "%";
                document.getElementById('time-display').innerText = VideoPlayer.formatTime(current);
            }
        }
    },

    showUI: (e) => {
        if (e && e.type === 'mousemove') {
            if (e.clientX === VideoPlayer.lastMouseX && e.clientY === VideoPlayer.lastMouseY) return; 
            VideoPlayer.lastMouseX = e.clientX;
            VideoPlayer.lastMouseY = e.clientY;
        }
        const controls = document.getElementById('custom-controls');
        const backBtn = document.querySelector('.close-classroom');
        if(controls) controls.classList.remove('hidden');
        if(backBtn) backBtn.classList.remove('hidden');
        clearTimeout(VideoPlayer.uiTimeout);
        
        let state = VideoPlayer.ytPlayer && VideoPlayer.ytPlayer.getPlayerState ? VideoPlayer.ytPlayer.getPlayerState() : -1;
        if (state === 1) { 
            VideoPlayer.uiTimeout = setTimeout(() => {
                const menu = document.getElementById('settings-menu');
                if (menu && menu.classList.contains('show')) return; 
                if(controls) controls.classList.add('hidden');
                if(backBtn) backBtn.classList.add('hidden');
            }, 4000);
        }
    },

    handleShieldClick: () => {
        const controls = document.getElementById('custom-controls');
        if(controls && controls.classList.contains('hidden')) {
            VideoPlayer.showUI();
        } else {
            VideoPlayer.togglePlay();
        }
    },

    toggleSettings: (e) => { 
        if(e) e.stopPropagation(); 
        const menu = document.getElementById('settings-menu');
        if(menu) menu.classList.toggle('show'); 
    },

    startDrag: (e) => { VideoPlayer.isDragging = true; VideoPlayer.updateScrub(e); },
    stopDrag: (e) => { if(VideoPlayer.isDragging) { VideoPlayer.updateScrub(e); VideoPlayer.isDragging = false; } },
    doDrag: (e) => { if(VideoPlayer.isDragging) VideoPlayer.updateScrub(e); },

    updateScrub: (e) => {
        if(!VideoPlayer.ytPlayer || !VideoPlayer.ytPlayer.getDuration) return;
        let bg = document.getElementById('progress-bg');
        if(!bg) return;
        let rect = bg.getBoundingClientRect();
        let clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : (e.clientX || 0);
        if(clientX === 0 && e.changedTouches) clientX = e.changedTouches[0].clientX; 
        let clickX = clientX - rect.left;
        let percentage = Math.max(0, Math.min(1, clickX / rect.width));
        let duration = VideoPlayer.ytPlayer.getDuration();
        VideoPlayer.ytPlayer.seekTo(percentage * duration, true);
        document.getElementById('progress-fill').style.width = (percentage * 100) + "%";
        document.getElementById('time-display').innerText = VideoPlayer.formatTime(percentage * duration);
    }
};

// 🔥 FIX 1: GLOBAL BINDINGS SO HTML INLINE ONCLICKS WORK
window.togglePlay = VideoPlayer.togglePlay;
window.skipVideo = VideoPlayer.skipVideo;
window.toggleMute = VideoPlayer.toggleMute;
window.toggleFullScreen = VideoPlayer.toggleFullScreen;
window.toggleSettings = VideoPlayer.toggleSettings;
window.setSpeed = VideoPlayer.setSpeed;
window.handleShieldClick = VideoPlayer.handleShieldClick;
window.startDrag = VideoPlayer.startDrag;
window.stopDrag = VideoPlayer.stopDrag;
window.doDrag = VideoPlayer.doDrag;
window.closeClassroom = VideoPlayer.closeVideo; // Mapping closeClassroom directly
window.openVideo = VideoPlayer.openVideo;

// Init the API as soon as file loads
VideoPlayer.initAPI();
