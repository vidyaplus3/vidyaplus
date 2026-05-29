// js/player/engine-yt.js
export const YtEngine = {
    player: null,

    init: (vidId, onReady, onStateChange) => {
        document.getElementById('hls-player').style.display = 'none';
        document.getElementById('yt-player').style.display = 'block';

        if(typeof YT === 'undefined' || !YT.Player) return alert("YouTube Engine initializing. Try again in 2 seconds.");

        if (YtEngine.player && typeof YtEngine.player.destroy === 'function') {
            YtEngine.player.destroy();
            YtEngine.player = null;
        }
        
        document.getElementById('yt-player').style.cssText = "width: 300% !important; height: 100% !important; margin-left: -100% !important; border: none !important;";

        YtEngine.player = new YT.Player('yt-player', {
            videoId: vidId,
            playerVars: { 'autoplay': 1, 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0, 'showinfo': 0, 'playsinline': 1, 'origin': window.location.origin, 'mute': 1 },
            events: {
                'onReady': onReady,
                'onStateChange': onStateChange
            }
        });
    },

    destroy: () => {
        if (YtEngine.player && typeof YtEngine.player.destroy === 'function') { 
            YtEngine.player.destroy(); 
            YtEngine.player = null; 
        }
    },
    
    play: () => YtEngine.player && YtEngine.player.playVideo(),
    pause: () => YtEngine.player && YtEngine.player.pauseVideo(),
    seek: (time) => YtEngine.player && YtEngine.player.seekTo(time, true),
    setSpeed: (rate) => YtEngine.player && YtEngine.player.setPlaybackRate(rate),
    getDuration: () => YtEngine.player ? YtEngine.player.getDuration() : 0,
    getCurrentTime: () => YtEngine.player ? YtEngine.player.getCurrentTime() : 0,
    isPlaying: () => YtEngine.player && YtEngine.player.getPlayerState() === 1,
    isMuted: () => YtEngine.player && YtEngine.player.isMuted(),
    mute: () => YtEngine.player && YtEngine.player.mute(),
    unMute: () => YtEngine.player && YtEngine.player.unMute()
};

