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
        
        if(typeof YT === 'undefined' || !YT.Player) return alert("Player initialization in progress. Please wait a moment.");

        document.getElementById('play-icon').className = "fas fa-pause";
        document.getElementById('progress-fill').style.width = "0%";
        document.getElementById('time-display').innerText = "0:00";
        
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
                    if(event.data === 1) { 
                        icon.className = "fas fa-pause"; 
                        VideoPlayer.showUI(); 
                    } else { 
                        icon.className = "fas fa-play"; 
                        VideoPlayer.showUI(); 
                    }
                }
            }
        });

        // 🛡️ THE MASTER FIX: DYNAMIC CLICK SHIELD 🛡️
        let container = document.getElementById('video-container');
        if (container) {
            container.style.position = 'relative'; // Make sure shield stays inside container
            let shield = document.getElementById('yt-click-shield');
            if (!shield) {
                shield = document.createElement('div');
                shield.id = 'yt-click-shield';
                // Invisible Sheesha Design
                shield.style.position = 'absolute';
                shield.style.top = '0';
                shield.style.left = '0';
                shield.style.width = '100%';
                shield.style.height = '100%';
                shield.style.zIndex = '5'; // Iframe ke upar, controls ke niche
                shield.style.cursor = 'pointer'; // Clickable feel aayegi
                container.appendChild(shield);

                // Jab mouse hile ya touch ho, toh UI ko jagao
                shield.addEventListener('mousemove', VideoPlayer.showUI);
                shield.addEventListener('touchstart', VideoPlayer.showUI);
                
                // Screen pe click karne se Play/Pause hoga! (Bonus Feature)
                shield.addEventListener('click', (e) => {
                    VideoPlayer.showUI(e);
                    VideoPlayer.togglePlay(); 
                });
            }
        }
    },

    closeVideo: () => {
        const overlay = document.getElementById('classroom-mode');
        if (overlay.classList.contains('active')) {
            if(VideoPlayer.progressInterval) clearInterval(VideoPlayer.progressInterval); 
            if(VideoPlayer.ytPlayer && VideoPlayer.ytPlayer.pauseVideo) VideoPlayer.ytPlayer.pauseVideo();
            window.history.back(); 
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
        
        let state = VideoPlayer.ytPlayer && VideoPlayer.ytPlayer.getPlayerState ? VideoPlayer.ytPlayer.getPlayerState() : -1;
        if (state === 1) { 
            VideoPlayer.uiTimeout = setTimeout(() => {
                const menu = document.getElementById('settings-menu');
                if (menu && menu.classList.contains('show')) return; 
                if(controls) controls.classList.add('hidden');
                if(backBtn) backBtn.classList.add('hidden');
            }, 4000); // 4 seconds baad hide ho jayega
        }
    }
};
