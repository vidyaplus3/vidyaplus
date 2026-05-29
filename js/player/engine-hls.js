// js/player/engine-hls.js
import { auth } from '../firebase-init.js';

export const HlsEngine = {
    player: null,

    init: async (vidUrl, onReadyCallback) => {
        document.getElementById('yt-player').style.display = 'none';
        let wrapper = document.getElementById('player-wrapper');
        
        let newVjsEl = document.createElement('video');
        newVjsEl.id = 'hls-player';
        newVjsEl.className = 'video-js vjs-default-skin';
        newVjsEl.style.cssText = "width: 100%; height: 100%;";
        newVjsEl.setAttribute('playsinline', '');
        wrapper.appendChild(newVjsEl);

        // Security Token Logic
        let token = auth.currentUser ? await auth.currentUser.getIdToken(true) : "";
        videojs.Vhs.xhr.beforeRequest = function(options) {
            if (options.uri.includes('getVideoKey') || options.uri.includes('vercel.app')) {
                options.uri = "https://vidyaplus-backend.vercel.app/api/getVideoKey"; 
                options.headers = options.headers || {};
                options.headers['Authorization'] = `Bearer ${token}`;
            }
            return options;
        };

        let sourceType = vidUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4';

        HlsEngine.player = videojs('hls-player', {
            controls: false, autoplay: true, muted: true, fill: true, fluid: false,
            sources: [{ src: vidUrl, type: sourceType }]
        });
            
        if (typeof HlsEngine.player.httpSourceSelector === 'function') {
            HlsEngine.player.httpSourceSelector();
        }

        HlsEngine.player.ready(() => {
            HlsEngine.player.play();
            if(onReadyCallback) onReadyCallback();
        });

        HlsEngine.player.on('play', () => window.dispatchEvent(new CustomEvent('vp-yt-play')));
        HlsEngine.player.on('pause', () => window.dispatchEvent(new CustomEvent('vp-yt-pause')));
        HlsEngine.player.on('ended', () => window.dispatchEvent(new CustomEvent('vp-yt-pause')));
        HlsEngine.player.on('waiting', () => window.dispatchEvent(new CustomEvent('vp-yt-pause')));
    },

    destroy: () => {
        if (HlsEngine.player) { HlsEngine.player.dispose(); HlsEngine.player = null; }
    },

    play: () => HlsEngine.player && HlsEngine.player.play(),
    pause: () => HlsEngine.player && HlsEngine.player.pause(),
    seek: (time) => HlsEngine.player && HlsEngine.player.currentTime(time),
    setSpeed: (rate) => HlsEngine.player && HlsEngine.player.playbackRate(rate),
    getDuration: () => HlsEngine.player ? HlsEngine.player.duration() : 0,
    getCurrentTime: () => HlsEngine.player ? HlsEngine.player.currentTime() : 0,
    isPlaying: () => HlsEngine.player && !HlsEngine.player.paused(),
    isMuted: () => HlsEngine.player && HlsEngine.player.muted(),
    mute: () => HlsEngine.player && HlsEngine.player.muted(true),
    unMute: () => HlsEngine.player && HlsEngine.player.muted(false)
};
