// js/player/player-ui.js
export const PlayerUI = {
    progressInterval: null,
    isDragging: false,
    uiTimeout: null,
    lastMouseX: -1,
    lastMouseY: -1,
    lastTapTime: 0, // Mobile gesture tracking ke liye

    // 1. Core Time Formatting
    formatTime: (time) => {
        if(isNaN(time) || !isFinite(time)) return "0:00";
        let min = Math.floor(time / 60);
        let sec = Math.floor(time % 60);
        return min + ":" + (sec < 10 ? "0" + sec : sec);
    },

    // 2. Progress Bar Tracking
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
            const progressFill = document.getElementById('progress-fill');
            const timeCurrent = document.getElementById('time-current');
            const timeDuration = document.getElementById('time-duration');
            
            if(progressFill) progressFill.style.width = percentage + "%";
            if(timeCurrent) timeCurrent.innerText = PlayerUI.formatTime(current);
            if(timeDuration) timeDuration.innerText = PlayerUI.formatTime(duration);
        }
    },
    

    // 3. UI Visibility (Auto-Hide Logic)
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
                if (menu && menu.classList.contains('show')) return; // Settings open hai toh hide mat karo
                if(controls) controls.classList.add('hidden');
                if(backBtn) backBtn.classList.add('hidden');
            }, 4000); // 4 seconds ke baad controls gayab
        }
    },

    // 4. Basic Controls Update
    updatePlayPauseIcon: (isPlaying) => {
        const icon = document.getElementById('play-icon');
        if(icon) icon.className = isPlaying ? "fas fa-pause" : "fas fa-play";
    },

    toggleSettings: (e) => { 
        if(e) e.stopPropagation(); 
        const menu = document.getElementById('settings-menu');
        if(menu) menu.classList.toggle('show'); 
    },

    // 5. 🚨 NAYA: Hover Tooltip (Time Preview Netflix Style)
    initTooltip: (engine) => {
        const bg = document.getElementById('progress-bg');
        const tooltip = document.getElementById('progress-tooltip');
        if (!bg || !tooltip) return;

        bg.addEventListener('mousemove', (e) => {
            if (!engine) return;
            const duration = engine.getDuration();
            if (duration <= 0) return;

            const rect = bg.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(1, clickX / rect.width));
            const hoverTime = percentage * duration;

            tooltip.innerText = PlayerUI.formatTime(hoverTime);
            tooltip.style.left = (percentage * 100) + "%"; // Tooltip mouse ke sath move karega
        });
    },

    // 6. 🚨 NAYA: Volume Slider & Dynamic Icons Sync
    initVolumeSlider: (engine) => {
        const slider = document.getElementById('volume-slider');
        if (!slider) return;

        slider.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            if (!engine) return;

            // Engine-agnostic volume setting
            if (engine.player && typeof engine.player.volume === 'function') {
                engine.player.volume(vol); // VideoJS (0.0 to 1.0)
            } else if (engine.player && typeof engine.player.setVolume === 'function') {
                engine.player.setVolume(vol * 100); // YouTube (0 to 100)
            }

            // Sync Mute Icons based on threshold
            const muteIcon = document.getElementById('mute-icon');
            if (muteIcon) {
                if (vol === 0) muteIcon.className = "fas fa-volume-mute";
                else if (vol < 0.5) muteIcon.className = "fas fa-volume-down";
                else muteIcon.className = "fas fa-volume-up";
            }
        });
    },

    // 7. 🚨 NAYA: Advanced Double-Tap Gestures (Mobile/Tablet Only)
    initGestures: (videoContainer, skipFn) => {
        if (!videoContainer || !skipFn) return;

        videoContainer.addEventListener('touchend', (e) => {
            // Agar control buttons ya back button par click hua hai, toh gesture bypass karo
            if (e.target.closest('.custom-controls') || e.target.closest('.close-classroom')) return;

            const currentTime = new Date().getTime();
            const tapLength = currentTime - PlayerUI.lastTapTime;
            
            // Double tap detect kiya (300ms ke andar)
            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
                const rect = videoContainer.getBoundingClientRect();
                const touchX = e.changedTouches[0].clientX - rect.left;
                
                if (touchX > rect.width / 2) {
                    // Right Side Tap -> Forward 10s
                    skipFn(10);
                    PlayerUI.triggerRipple('tap-indicator-right');
                } else {
                    // Left Side Tap -> Rewind 10s
                    skipFn(-10);
                    PlayerUI.triggerRipple('tap-indicator-left');
                }
            }
            PlayerUI.lastTapTime = currentTime;
        });
    },

    // Ripple Reflow Hack (Prevents animation freezing on rapid clicks)
    triggerRipple: (elementId) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        
        el.style.display = 'none';
        void el.offsetWidth; // DOM Reflow force karta hai taaki animation reset ho
        el.style.display = 'block';
        
        setTimeout(() => { el.style.display = 'none'; }, 400); 
    },

    // 8. 🚨 NAYA: Native Keyboard Shortcuts (Accessibility Standards)
    initKeyboardShortcuts: (togglePlayFn, skipFn, toggleMuteFn, toggleFsFn) => {
        document.addEventListener('keydown', (e) => {
            // Security check: Agar doubt/chat box me type kar rahe ho, toh video pause na ho jaye
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

            // Sirf tab trigger hoga jab video full screen / active mode me ho
            const overlay = document.getElementById('classroom-mode');
            if (!overlay || !overlay.classList.contains('active')) return;

            switch(e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault(); // Screen scroll hone se rokta hai
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
