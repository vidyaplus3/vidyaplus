// js/ui.js

// Centralized UI Controller (Saare Modals aur Screens yahan se control honge)
export const UI = {
    openMenu: () => {
        document.getElementById('global-overlay').style.display = 'block';
        document.getElementById('menu-modal').style.display = 'flex';
    },
    
    openNotif: () => {
        document.getElementById('global-overlay').style.display = 'block';
        document.getElementById('notif-modal').style.display = 'flex';
    },
    
    closeModals: () => {
        document.getElementById('global-overlay').style.display = 'none';
        document.getElementById('menu-modal').style.display = 'none';
        document.getElementById('notif-modal').style.display = 'none';
        const dropdown = document.getElementById('batch-dropdown');
        if (dropdown) dropdown.classList.remove('show');
    },
    
    toggleDropdown: (e) => {
        if (e) e.stopPropagation();
        const dropdown = document.getElementById('batch-dropdown');
        if (dropdown) dropdown.classList.toggle('show');
    },

    showScreen: (screenId) => {
        UI.closeModals();
        // Saari screens hide karo, sirf target wali show karo
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');
    },

    // Tabs switch karne ka generic function
    switchTabUI: (btnElement) => {
        if (!btnElement || !btnElement.parentElement) return;
        const tabs = btnElement.parentElement.children;
        for(let t of tabs) { t.classList.remove('active'); }
        btnElement.classList.add('active');
    }
};

// Global Click Listener: Agar dropdown ke bahar click ho toh usko band kar do
document.addEventListener('click', (e) => { 
    const dropdown = document.getElementById('batch-dropdown'); 
    if (dropdown && dropdown.classList.contains('show') && !e.target.closest('.batch-selector')) {
        dropdown.classList.remove('show'); 
    }
});

