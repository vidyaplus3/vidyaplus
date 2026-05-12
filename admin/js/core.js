import { auth, db } from '../../js/firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// 1. ROUTE PROTECTION & PIN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists() && docSnap.data().role === 'admin') {
                document.getElementById('auth-verifier').style.opacity = '0';
                setTimeout(() => {
                    document.getElementById('auth-verifier').style.display = 'none';
                    document.getElementById('security-lock').style.display = 'flex';
                }, 300);
                
                // Content engine load hone ka wait karke batches fetch karega
                if(window.fetchBatches) window.fetchBatches(); 
                else setTimeout(() => { if(window.fetchBatches) window.fetchBatches(); }, 500);

            } else {
                await signOut(auth);
                window.location.href = 'login.html';
            }
        } catch (error) { window.location.href = 'login.html'; }
    } else { window.location.href = 'login.html'; }
});

window.adminLogout = async () => { await signOut(auth); window.location.href = 'login.html'; };

let masterPin = localStorage.getItem('vp_studio_pin') || "1234";
window.moveToNext = (curr, nextId) => { if (curr.value.length === 1 && nextId) document.getElementById(nextId).focus(); };
window.checkPin = () => {
    const inputs = document.querySelectorAll('.pin-inputs input');
    let entered = Array.from(inputs).map(inp => inp.value).join('');
    if (entered.length === 4) {
        if (entered === masterPin) {
            document.getElementById('security-lock').style.opacity = '0';
            setTimeout(() => document.getElementById('security-lock').style.display = 'none', 500);
        } else {
            document.getElementById('pin-error').style.opacity = '1';
            inputs.forEach(inp => { inp.value = ''; inp.style.borderColor = '#ef4444'; });
            inputs[0].focus();
            setTimeout(() => {
                document.getElementById('pin-error').style.opacity = '0';
                inputs.forEach(inp => inp.style.borderColor = '#e2e8f0');
            }, 2000);
        }
    }
};

window.updateMasterPin = () => {
    const newPin = document.getElementById('new-pin').value;
    if(newPin.length !== 4) return window.showMsg("PIN must be 4 digits!");
    localStorage.setItem('vp_studio_pin', newPin); masterPin = newPin;
    document.getElementById('new-pin').value = ''; window.showMsg("Master PIN Updated 🔒");
};

// ==========================================
// 2. UI UTILS & VALIDATIONS
// ==========================================
window.showMsg = (msg) => {
    const t = document.getElementById('toast');
    t.innerText = msg; t.classList.add('active');
    setTimeout(() => t.classList.remove('active'), 3000);
};

window.switchView = (viewId) => {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('nav-' + viewId).classList.add('active');
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
};

window.toggleAccordion = (id) => {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if(el.classList.contains('active')) {
        el.classList.remove('active');
        icon.style.transform = 'rotate(0deg)';
    } else {
        el.classList.add('active');
        icon.style.transform = 'rotate(180deg)';
    }
};
