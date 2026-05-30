// js/player/player-ui.js
export const PlayerUI = {
    progressInterval: null,
    isDragging: false,
    isSeekLocked: false, // 🚨 NAYA: Slow net e bar firot asa rokhar jonnno
    seekLockTimeout: null,
    uiTimeout: null,
    lastMouseX: -1,
    lastMouseY: -1,
    lastTapTime: 0, 

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
        // 🚨 Seek Lock thakle background e bar update hobe na
        if (PlayerUI.isDragging || PlayerUI.isSeekLocked || !engine) return;
        let current = engine.getCurrentTime();
        let duration = engine.getDuration();

        if(duration > 0) {
            let percentage = (current / duration) * 100;
            const progressFill = document.getElementById('progress-fill');
            const timeCurrent = document.getElementById('time-current');
            const timeDuration = document.getElementById('time-duration');
            
            if(progressFill) progressFill.style.width = percentage + "%";
            if(timeCurrent) timeCurrent.innerText = PlayerUI.formatTime(current);
            if(timeDuration) timeDuration.innerText = PlayerUI.formatTime(duration);
        }
    },

    showUI: (e, isPlaying) => {
        if (e && e.type === 'mousemove') {
            if (e.clientX === PlayerUI.lastMouseX && e.clientY === PlayerUI.lastMouseY) return; 
            PlayerUI.lastMouseX = e.clientX; 
            PlayerUI.lastMouseY = e.clientY;
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
    },

    // 🚨 FIX: Tooltip hover aur touch dono te perfectly kaaj korbe
    initTooltip: (engine) => {
        const bg = document.getElementById('progress-bg');
        const tooltip = document.getElementById('progress-tooltip');
        if (!bg || !tooltip) return;

        const updateTooltip = (e) => {
            if (!engine) return;
            const duration = engine.getDuration();
            if (duration <= 0) return;

            const rect = bg.getBoundingClientRect();
            let clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : (e.clientX || 0);
            if(clientX === 0 && e.changedTouches) clientX = e.changedTouches[0].clientX; 

            const clickX = clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, clickX / rect.width));
            const hoverTime = percentage * duration;

            tooltip.innerText = PlayerUI.formatTime(hoverTime);
            tooltip.style.left = (percentage * 100) + "%"; 
        };

        bg.addEventListener('mousemove', updateTooltip);
        bg.addEventListener('touchmove', updateTooltip);
    },

    // 🚨 FIX: Volume Slider dynamic white fill (Netflix Style)
    initVolumeSlider: (engine) => {
        const slider = document.getElementById('volume-slider');
        if (!slider) return;

        slider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            if (!engine) return;

            if (engine.player && typeof engine.player.volume === 'function') {
                engine.player.volume(vol); 
            } else if (engine.player && typeof engine.player.setVolume === 'function') {
                engine.player.setVolume(vol * 100); 
            }

            // Visual Fill Update
            const percentage = vol * 100;
            e.target.style.background = `linear-gradient(to right, white ${percentage}%, rgba(255, 255, 255, 0.25) ${percentage}%)`;

            const muteIcon = document.getElementById('mute-icon');
            if (muteIcon) {
                if (vol === 0) muteIcon.className = "fas fa-volume-mute";
                else if (vol < 0.5) muteIcon.className = "fas fa-volume-down";
                else muteIcon.className = "fas fa-volume-up";
            }
        });
    },

    initGestures: (videoContainer, skipFn) => {
        if (!videoContainer || !skipFn) return;

        videoContainer.addEventListener('touchend', (e) => {
            if (e.target.closest('.custom-controls') || e.target.closest('.close-classroom')) return;

            const currentTime = new Date().getTime();
            const tapLength = currentTime - PlayerUI.lastTapTime;
            
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
                const rect = videoContainer.getBoundingClientRect();
                const touchX = e.changedTouches[0].clientX - rect.left;
                
                if (touchX > rect.width / 2) {
                    skipFn(10);
                    PlayerUI.triggerRipple('tap-indicator-right');
                } else {
                    skipFn(-10);
                    PlayerUI.triggerRipple('tap-indicator-left');
                }
            }
            PlayerUI.lastTapTime = currentTime;
        });
    },

    triggerRipple: (elementId) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.style.display = 'none';
        void el.offsetWidth; 
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 400); 
    },

    initKeyboardShortcuts: (togglePlayFn, skipFn, toggleMuteFn, toggleFsFn) => {
        document.addEventListener('keydown', (e) => {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
            const overlay = document.getElementById('classroom-mode');
            if (!overlay || !overlay.classList.contains('active')) return;

            switch(e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault(); 
                    togglePlayFn();
                    break;
                case 'arrowright':
                    e.preventDefault();
                    skipFn(10);
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    skipFn(-10);
                    break;
                case 'm':
                    e.preventDefault();
                    toggleMuteFn();
                    break;
                case 'f':
                    e.preventDefault();
                    toggleFsFn();
                    break;
            }
        });
    }
};
