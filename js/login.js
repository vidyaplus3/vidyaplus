// js/login.js
// 🚨 SAHI PATH: '../' ka matlab hai ek folder baahar (root mein) jao
import { auth } from '../firebase-init.js'; 
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let isLoginMode = false; 
const formSubtitle = document.getElementById('form-subtitle');
const submitBtn = document.getElementById('submit-btn');
const toggleFormText = document.getElementById('toggle-form');
const authForm = document.getElementById('auth-form');
const errorMsg = document.getElementById('error-message');

function getFriendlyError(errorCode) {
    switch(errorCode) {
        case 'auth/invalid-credential': return "Invalid email or password. Please try again.";
        case 'auth/email-already-in-use': return "This email is already registered. Please log in.";
        case 'auth/weak-password': return "Password must be at least 6 characters long.";
        case 'auth/invalid-email': return "Please enter a valid email address.";
        case 'auth/network-request-failed': return "Network error. Please check your internet connection.";
        default: return "An unexpected error occurred. Please try again later.";
    }
}

// UI Toggle Logic
function setupToggle() {
    // Har baar naya element dhoondhna zaroori hai kyunki innerHTML change hota hai
    const toggleButton = document.getElementById('toggle-btn');
    if (!toggleButton) return;
    
    toggleButton.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        errorMsg.style.display = "none";
        
        if(isLoginMode) {
            document.title = "Log In | VidyaPlus";
            formSubtitle.innerText = "Welcome back! Please log in.";
            submitBtn.innerText = "Log In";
            toggleFormText.innerHTML = `Don't have an account? <span id="toggle-btn" style="color:#2563eb;font-weight:600;cursor:pointer;text-decoration:underline;">Sign Up</span>`;
        } else {
            document.title = "Sign Up | VidyaPlus";
            formSubtitle.innerText = "Create a new account to get started.";
            submitBtn.innerText = "Sign Up";
            toggleFormText.innerHTML = `Already have an account? <span id="toggle-btn" style="color:#2563eb;font-weight:600;cursor:pointer;text-decoration:underline;">Log In</span>`;
        }
        setupToggle(); // Re-attach listener
    });
}
setupToggle();

// Form Submit Logic
if (authForm) {
    authForm.addEventListener('submit', (e) => {
        e.preventDefault(); 
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        const originalBtnText = submitBtn.innerText;
        submitBtn.innerText = "Processing...";
        errorMsg.style.display = "none";

        if(isLoginMode) {
            signInWithEmailAndPassword(auth, email, password)
            .then(() => { window.location.replace("explore.html"); })
            .catch((error) => {
                submitBtn.innerText = originalBtnText;
                errorMsg.innerText = getFriendlyError(error.code);
                errorMsg.style.display = "block";
            });
        } else {
            createUserWithEmailAndPassword(auth, email, password)
            .then(() => { window.location.replace("explore.html"); })
            .catch((error) => {
                submitBtn.innerText = originalBtnText;
                errorMsg.innerText = getFriendlyError(error.code);
                errorMsg.style.display = "block";
            });
        }
    });
}
