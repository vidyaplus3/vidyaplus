// js/player/player-ui.js
export const PlayerUI = {
    progressInterval: null,
    isDragging: false,
    uiTimeout: null,
    lastMouseX: -1,
    lastMouseY: -1,

    formatTime: (time) => {
        if(isNaN(time) || !isFinite(time)) return "0:00";
        let min = Math.floor(time / 60);
        let sec = Math.floor(time % 60);
        return min + ":" + (sec < 10 ? "0" + sec : sec);
    },

    startProgressTracking: (engine) => {
        if(PlayerUI.progressInterval) clearInterval(PlayerUI.progressInterval);
        PlayerUI.progressInterval = setInterval(() => PlayerUI.updateProgressBar(engine), 500);
    },

    stopProgressTracking: () => {
        if(PlayerUI.progressInterval) clearInterval(PlayerUI.progressInterval);
    },

    updateProgressBar: (engine) => {
        if (PlayerUI.isDragging || !engine) return;
        let current = engine.getCurrentTime();
        let duration = engine.getDuration();

        if(duration > 0) {
            let percentage = (current / duration) * 100;
            document.getElementById('progress-fill').style.width = percentage + "%";
            document.getElementById('time-display').innerText = PlayerUI.formatTime(current);
        }
    },

    showUI: (e, isPlaying) => {
        if (e && e.type === 'mousemove') {
            if (e.clientX === PlayerUI.lastMouseX && e.clientY === PlayerUI.lastMouseY) return; 
            PlayerUI.lastMouseX = e.clientX; PlayerUI.lastMouseY = e.clientY;
        }
        
        const controls = document.getElementById('custom-controls');
        const backBtn = document.querySelector('.close-classroom');
        if(controls) controls.classList.remove('hidden');
        if(backBtn) backBtn.classList.remove('hidden');
        
        clearTimeout(PlayerUI.uiTimeout);
        if (isPlaying) { 
            PlayerUI.uiTimeout = setTimeout(() => {
                const menu = document.getElementById('settings-menu');
                if (menu && menu.classList.contains('show')) return; 
                if(controls) controls.classList.add('hidden');
                if(backBtn) backBtn.classList.add('hidden');
            }, 4000);
        }
    },

    updatePlayPauseIcon: (isPlaying) => {
        const icon = document.getElementById('play-icon');
        if(icon) icon.className = isPlaying ? "fas fa-pause" : "fas fa-play";
    },

    toggleSettings: (e) => { 
        if(e) e.stopPropagation(); 
        const menu = document.getElementById('settings-menu');
        if(menu) menu.classList.toggle('show'); 
    }
};

