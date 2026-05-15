// js/modern-index.js
import { auth } from './firebase-init.js';

// 🎬 World-Class Entrance Animations (GSAP)
window.addEventListener('DOMContentLoaded', () => {
    const tl = gsap.timeline();
    
    tl.from(".nav-container", { y: -20, opacity: 0, duration: 0.8, ease: "power4.out" })
      .from(".animate-in", { 
          y: 40, 
          opacity: 0, 
          stagger: 0.2, 
          duration: 1, 
          ease: "expo.out" 
      }, "-=0.4");

    // Floating animation for visual cards
    gsap.to(".telemetry-card", { y: 15, repeat: -1, yoyo: true, duration: 2, ease: "sine.inOut" });
    gsap.to(".score-card", { y: -15, repeat: -1, yoyo: true, duration: 2.5, ease: "sine.inOut" });
});

// 🔐 Bottom Sheet Control
window.openBottomSheet = (mode) => {
    const sheet = document.getElementById('authSheet');
    const overlay = document.getElementById('sheetOverlay');
    
    sheet.classList.add('active');
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    if(mode === 'register') toggleAuthMode(true);
    else toggleAuthMode(false);
};

window.closeBottomSheet = () => {
    document.getElementById('authSheet').classList.remove('active');
    document.getElementById('sheetOverlay').style.display = 'none';
    document.body.style.overflow = 'auto';
};

let isLogin = true;
window.toggleAuthMode = (forceRegister = null) => {
    if(forceRegister !== null) isLogin = !forceRegister;
    else isLogin = !isLogin;

    const title = document.getElementById('sheetTitle');
    const nameField = document.getElementById('nameField');
    
    if(isLogin) {
        title.innerText = "Welcome Back";
        nameField.style.display = "none";
    } else {
        title.innerText = "Create Account";
        nameField.style.display = "block";
    }
};

