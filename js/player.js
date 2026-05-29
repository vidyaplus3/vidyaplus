// js/player.js
import { auth } from './firebase-init.js';

export const VideoPlayer = {
    ytPlayer: null,
    vjsPlayer: null, 
    activeEngine: null, // 'youtube' ya 'hls'
    progressInterval: null,
    isDragging: false,
    uiTimeout: null,
    lastMouseX: -1,
    lastMouseY: -1,
    currentClassroomData: null,

    initAPI: () => {
        // 1. Load YouTube Iframe API
        if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            const ytScript = document.createElement('script');
            ytScript.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(ytScript);
        }
        
        // 2. Setup UI Listeners
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
        if(isNaN(time) || !isFinite(time)) return "0:00";
        let min = Math.floor(time / 60);
        let sec = Math.floor(time % 60);
        return min + ":" + (sec < 10 ? "0" + sec : sec);
    },

    openVideo: (vidUrl, title, pdfUrl) => {
        if(!vidUrl) return alert("Playback URL is invalid.");
        
        // Reset UI
        document.getElementById('play-icon').className = "fas fa-pause";
        document.getElementById('progress-fill').style.width = "0%";
        document.getElementById('time-display').innerText = "0:00";
        const muteIconEl = document.getElementById('mute-icon');
        if(muteIconEl) muteIconEl.className = "fas fa-volume-mute"; 
        
        // Show Overlay
        const overlay = document.getElementById('classroom-mode');
        if (!overlay.classList.contains('active')) {
            window.history.pushState({ videoOpen: true }, '', window.location.href);
            overlay.classList.add('active');
        }

        // Set Watermark
        VideoPlayer.currentClassroomData = { title, pdfUrl };
        let userEmail = auth.currentUser ? auth.currentUser.email : "Authenticated User";
        document.getElementById('video-watermark').innerText = userEmail + " | VidyaPlus Secure";

        // Hybrid Engine Router: Check if YouTube or HLS/MP4
        let ytMatch = vidUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
        
        if (ytMatch) {
            VideoPlayer.activeEngine = 'youtube';
            VideoPlayer.initYouTube(ytMatch[1]);
        } else {
            VideoPlayer.activeEngine = 'hls';
            VideoPlayer.initVideoJS(vidUrl);
        }
    },

    initYouTube: (vidId) => {
        document.getElementById('hls-player').style.display = 'none';
        document.getElementById('yt-player').style.display = 'block';

        // Destroy VJS if exists
        if (VideoPlayer.vjsPlayer) { VideoPlayer.vjsPlayer.dispose(); VideoPlayer.vjsPlayer = null; }

        if(typeof YT === 'undefined' || !YT.Player) return alert("YouTube Engine initializing. Try again in 2 seconds.");

        if (VideoPlayer.ytPlayer && typeof VideoPlayer.ytPlayer.destroy === 'function') {
            VideoPlayer.ytPlayer.destroy();
            VideoPlayer.ytPlayer = null;
        }
        
        // Custom CSS Hack for YouTube Wide screen
        document.getElementById('yt-player').style.cssText = "width: 300% !important; height: 100% !important; margin-left: -100% !important; border: none !important;";

        VideoPlayer.ytPlayer = new YT.Player('yt-player', {
            videoId: vidId,
            playerVars: { 'autoplay': 1, 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0, 'showinfo': 0, 'playsinline': 1, 'origin': window.location.origin, 'mute': 1 },
            events: {
                'onReady': (event) => { 
                    event.target.playVideo(); 
                    VideoPlayer.startProgressTracking();
                },
                'onStateChange': (event) => {
                    let icon = document.getElementById('play-icon');
                    if(event.data === 1) { 
                        icon.className = "fas fa-pause"; VideoPlayer.showUI(); 
                        window.dispatchEvent(new CustomEvent('vp-yt-play'));
                    } else if (event.data === 2 || event.data === 0 || event.data === 3) { 
                        icon.className = "fas fa-play"; VideoPlayer.showUI(); 
                        window.dispatchEvent(new CustomEvent('vp-yt-pause'));
                    }
                }
            }
        });
    },
        initVideoJS: async (vidUrl) => { // 🚨 NAYA: Isko async banaya hai
        // Destroy old elements
        if (VideoPlayer.ytPlayer && typeof VideoPlayer.ytPlayer.destroy === 'function') { VideoPlayer.ytPlayer.destroy(); VideoPlayer.ytPlayer = null; }
        if (VideoPlayer.vjsPlayer) { VideoPlayer.vjsPlayer.dispose(); VideoPlayer.vjsPlayer = null; }

        // Recreate VJS Video Tag
        document.getElementById('yt-player').style.display = 'none';
        let wrapper = document.getElementById('player-wrapper');
        let newVjsEl = document.createElement('video');
        newVjsEl.id = 'hls-player';
        newVjsEl.className = 'video-js vjs-default-skin';
        newVjsEl.style.cssText = "width: 100%; height: 100%;";
        newVjsEl.setAttribute('playsinline', '');
        wrapper.appendChild(newVjsEl);

                // ==========================================================
        // 🚨 GOD-LEVEL SECURITY: Intercepting Key Request (UPDATED)
        // ==========================================================
        let token = "";
        if (auth.currentUser) {
            token = await auth.currentUser.getIdToken(true); 
        }

        videojs.Vhs.xhr.beforeRequest = function(options) {
            // FIX: Ab ye "getVideoKey" ya kisi bhi vercel link ko pakad lega
            if (options.uri.includes('getVideoKey') || options.uri.includes('vercel.app')) {
                
                // Apna asli Vercel URL yahan set karo
                options.uri = "https://vidyaplus-backend.vercel.app/api/getVideoKey"; 
                
                options.headers = options.headers || {};
                // Token ko securely bhej rahe hain taaki Vercel lock khol de
                options.headers['Authorization'] = `Bearer ${token}`;
            }
            return options;
        };
        // ==========================================================
            
        // ==========================================================

        let sourceType = vidUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4';

        VideoPlayer.vjsPlayer = videojs('hls-player', {
            controls: false, // Strict UI Control
            autoplay: true,
            muted: true,
            fluid: false,
            sources: [{ src: vidUrl, type: sourceType }]
        });

        // Initialize Quality Selector Plugin internally
        if (typeof VideoPlayer.vjsPlayer.httpSourceSelector === 'function') {
            VideoPlayer.vjsPlayer.httpSourceSelector();
        }

        VideoPlayer.vjsPlayer.ready(() => {
            VideoPlayer.startProgressTracking();
            VideoPlayer.vjsPlayer.play();
        });

        VideoPlayer.vjsPlayer.on('play', () => {
            document.getElementById('play-icon').className = "fas fa-pause";
            window.dispatchEvent(new CustomEvent('vp-yt-play'));
        });

        VideoPlayer.vjsPlayer.on('pause', () => {
            document.getElementById('play-icon').className = "fas fa-play";
            window.dispatchEvent(new CustomEvent('vp-yt-pause'));
        });
        
        VideoPlayer.vjsPlayer.on('ended', () => window.dispatchEvent(new CustomEvent('vp-yt-pause')));
        VideoPlayer.vjsPlayer.on('waiting', () => window.dispatchEvent(new CustomEvent('vp-yt-pause')));
    },
    

    startProgressTracking: () => {
        if(VideoPlayer.progressInterval) clearInterval(VideoPlayer.progressInterval);
        VideoPlayer.progressInterval = setInterval(VideoPlayer.updateProgressBar, 500);
    },

    closeVideo: () => {
        const overlay = document.getElementById('classroom-mode');
        if (overlay.classList.contains('active')) {
            window.dispatchEvent(new CustomEvent('vp-yt-pause')); 
            if(VideoPlayer.progressInterval) clearInterval(VideoPlayer.progressInterval); 
            
            if(VideoPlayer.activeEngine === 'youtube' && VideoPlayer.ytPlayer) VideoPlayer.ytPlayer.pauseVideo();
            if(VideoPlayer.activeEngine === 'hls' && VideoPlayer.vjsPlayer) VideoPlayer.vjsPlayer.pause();
            
            overlay.classList.remove('active'); 
        }
    },

    togglePlay: () => {
        let icon = document.getElementById('play-icon');
        
        if (VideoPlayer.activeEngine === 'youtube' && VideoPlayer.ytPlayer) {
            if(VideoPlayer.ytPlayer.isMuted()) { VideoPlayer.ytPlayer.unMute(); document.getElementById('mute-icon').className = "fas fa-volume-up"; }
            if (VideoPlayer.ytPlayer.getPlayerState() === 1) VideoPlayer.ytPlayer.pauseVideo();
            else VideoPlayer.ytPlayer.playVideo();
        } 
        else if (VideoPlayer.activeEngine === 'hls' && VideoPlayer.vjsPlayer) {
            if(VideoPlayer.vjsPlayer.muted()) { VideoPlayer.vjsPlayer.muted(false); document.getElementById('mute-icon').className = "fas fa-volume-up"; }
            if (!VideoPlayer.vjsPlayer.paused()) VideoPlayer.vjsPlayer.pause();
            else VideoPlayer.vjsPlayer.play();
        }
    },

    toggleMute: () => {
        let icon = document.getElementById('mute-icon');
        if (VideoPlayer.activeEngine === 'youtube' && VideoPlayer.ytPlayer) {
            if (VideoPlayer.ytPlayer.isMuted()) { VideoPlayer.ytPlayer.unMute(); icon.className = "fas fa-volume-up"; } 
            else { VideoPlayer.ytPlayer.mute(); icon.className = "fas fa-volume-mute"; }
        } 
        else if (VideoPlayer.activeEngine === 'hls' && VideoPlayer.vjsPlayer) {
            if (VideoPlayer.vjsPlayer.muted()) { VideoPlayer.vjsPlayer.muted(false); icon.className = "fas fa-volume-up"; } 
            else { VideoPlayer.vjsPlayer.muted(true); icon.className = "fas fa-volume-mute"; }
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
        if (VideoPlayer.activeEngine === 'youtube' && VideoPlayer.ytPlayer) {
            VideoPlayer.ytPlayer.seekTo(VideoPlayer.ytPlayer.getCurrentTime() + seconds, true);
        } else if (VideoPlayer.activeEngine === 'hls' && VideoPlayer.vjsPlayer) {
            VideoPlayer.vjsPlayer.currentTime(VideoPlayer.vjsPlayer.currentTime() + seconds);
        }
    },

    setSpeed: (rate) => {
        if (VideoPlayer.activeEngine === 'youtube' && VideoPlayer.ytPlayer) VideoPlayer.ytPlayer.setPlaybackRate(rate);
        else if (VideoPlayer.activeEngine === 'hls' && VideoPlayer.vjsPlayer) VideoPlayer.vjsPlayer.playbackRate(rate);
        
        document.querySelectorAll('.speed-opt').forEach(el => el.classList.remove('active'));
        document.getElementById('spd-' + rate).classList.add('active');
    },

    updateProgressBar: () => {
        if (VideoPlayer.isDragging) return;
        
        let current = 0, duration = 0;
        if (VideoPlayer.activeEngine === 'youtube' && VideoPlayer.ytPlayer && VideoPlayer.ytPlayer.getCurrentTime) {
            current = VideoPlayer.ytPlayer.getCurrentTime();
            duration = VideoPlayer.ytPlayer.getDuration();
        } else if (VideoPlayer.activeEngine === 'hls' && VideoPlayer.vjsPlayer) {
            current = VideoPlayer.vjsPlayer.currentTime();
            duration = VideoPlayer.vjsPlayer.duration();
        }

        if(duration > 0) {
            let percentage = (current / duration) * 100;
            document.getElementById('progress-fill').style.width = percentage + "%";
            document.getElementById('time-display').innerText = VideoPlayer.formatTime(current);
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
        
        let isPlaying = false;
        if (VideoPlayer.activeEngine === 'youtube' && VideoPlayer.ytPlayer) isPlaying = (VideoPlayer.ytPlayer.getPlayerState() === 1);
        else if (VideoPlayer.activeEngine === 'hls' && VideoPlayer.vjsPlayer) isPlaying = !VideoPlayer.vjsPlayer.paused();

        if (isPlaying) { 
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
        if(controls && controls.classList.contains('hidden')) VideoPlayer.showUI();
        else VideoPlayer.togglePlay();
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
        let bg = document.getElementById('progress-bg');
        if(!bg) return;
        let rect = bg.getBoundingClientRect();
        let clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : (e.clientX || 0);
        if(clientX === 0 && e.changedTouches) clientX = e.changedTouches[0].clientX; 
        let clickX = clientX - rect.left;
        let percentage = Math.max(0, Math.min(1, clickX / rect.width));
        
        let duration = 0;
        if (VideoPlayer.activeEngine === 'youtube' && VideoPlayer.ytPlayer) {
            duration = VideoPlayer.ytPlayer.getDuration();
            VideoPlayer.ytPlayer.seekTo(percentage * duration, true);
        } else if (VideoPlayer.activeEngine === 'hls' && VideoPlayer.vjsPlayer) {
            duration = VideoPlayer.vjsPlayer.duration();
            VideoPlayer.vjsPlayer.currentTime(percentage * duration);
        }

        document.getElementById('progress-fill').style.width = (percentage * 100) + "%";
        document.getElementById('time-display').innerText = VideoPlayer.formatTime(percentage * duration);
    }
};

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
window.closeClassroom = VideoPlayer.closeVideo; 
window.openVideo = VideoPlayer.openVideo;

VideoPlayer.initAPI();
