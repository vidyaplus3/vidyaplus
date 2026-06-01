// js/comments.js
import { auth } from './firebase-init.js';

let lastCommentTime = 0;

export const CommentEngine = {
    // 1. UI Render Karne ka function
    renderUI: (containerElement, lectureId) => {
        containerElement.innerHTML = `
            <div style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
                Academic Discussion <span id="comment-count" style="font-size:0.8rem; color:var(--primary); font-weight:700; background:#E0E7FF; padding:2px 8px; border-radius:12px;">Syncing...</span>
            </div>
            
            <div id="comments-container" style="padding-bottom: 20px; min-height: 200px;">
                <div class="comment-card" style="opacity:0.5;"><div class="user-avatar" style="background:#e2e8f0; color:transparent;">-</div><div class="comment-body" style="background:#f1f5f9; min-height:60px; border-radius:12px;"></div></div>
                <div class="comment-card" style="opacity:0.3;"><div class="user-avatar" style="background:#e2e8f0; color:transparent;">-</div><div class="comment-body" style="background:#f1f5f9; min-height:40px; border-radius:12px; width:70%;"></div></div>
            </div>
            
            <div class="comment-input-area">
                <div id="comment-error" style="color: #ef4444; font-size: 0.75rem; font-weight: 600; padding: 0 10px 8px; display: none; transition: 0.3s;"></div>
                <div style="display: flex; gap: 10px; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 25px; padding: 5px 5px 5px 15px;">
                    <input type="text" id="comment-input" placeholder="Post a query... (max 500 chars)" autocomplete="off" maxlength="500">
                    <button id="send-comment-btn" class="send-btn" disabled><i class="fas fa-paper-plane"></i></button>
                </div>
                <div style="text-align: right; font-size: 0.65rem; color: #94a3b8; margin-top: 4px; padding-right: 15px;" id="char-counter">0/500</div>
            </div>
        `;

        // Render hone ke turant baad buttons par rules (security) laga do
        setTimeout(() => {
            CommentEngine.initSecurity(lectureId);
            CommentEngine.renderDummyComments(); // Dummy data testing ke liye
        }, 50);
    },

    // 2. Security, Logic aur API Call
    initSecurity: (lectureId) => {
        const input = document.getElementById('comment-input');
        const btn = document.getElementById('send-comment-btn');
        const counter = document.getElementById('char-counter');
        const errorBox = document.getElementById('comment-error');

        // Typing check (Blank & Limit)
        input.addEventListener('input', (e) => {
            const text = e.target.value;
            counter.innerText = `${text.length}/500`;
            counter.style.color = text.length >= 490 ? '#ef4444' : '#94a3b8';
            btn.disabled = text.trim().length === 0;
        });

        // Send Button Click
        btn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (text.length === 0) return; 

            // Cooldown System (10 Seconds)
            const now = Date.now();
            if (now - lastCommentTime < 10000) { 
                errorBox.innerText = "Please take a breath! Wait 10 seconds before posting again.";
                errorBox.style.display = 'block';
                setTimeout(() => { errorBox.style.display = 'none'; }, 4000);
                return;
            }

            // Profanity Filter
            const badWords = ['stupid', 'idiot']; 
            let cleanText = text;
            badWords.forEach(word => {
                const regex = new RegExp(word, 'gi');
                cleanText = cleanText.replace(regex, '***');
            });

            // 1. Optimistic UI dikhao (Yahan se hume tempId milega)
            const tempId = CommentEngine.postOptimistic(cleanText);
            lastCommentTime = now;
            
            // 2. Input Box Reset
            const savedText = input.value;
            input.value = '';
            btn.disabled = true;
            counter.innerText = `0/500`;
            
            // 3. 🚀 THE REAL BACKEND CALL TO VERCEL
            try {
                // Firebase se secure master key nikalna
                const token = await auth.currentUser.getIdToken();
                
                // Vercel ko request bhejna
                const response = await fetch('https://vidyaplus-backend.vercel.app/api/comments', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        lectureId: lectureId,
                        text: cleanText
                    })
                });

                if (!response.ok) {
                    throw new Error("Backend verification failed");
                }

                // 🎉 SUCCESS: "Sending..." ko "Just now" mein badal do aur opacity (grey color) normal kar do
                const timeElement = document.querySelector(`#${tempId} .comment-time`);
                if(timeElement) timeElement.innerText = "Just now";
                const cardElement = document.getElementById(tempId);
                if(cardElement) cardElement.classList.remove('optimistic');

            } catch (error) {
                console.error("Comment Post Failed:", error);
                
                // 🛑 FAIL SECURELY: Fake comment delete karo, aur data wapas input box mein daalo
                const failedComment = document.getElementById(tempId);
                if(failedComment) failedComment.remove();
                
                input.value = savedText; // Data loss bach gaya!
                btn.disabled = false;
                counter.innerText = `${savedText.length}/500`;
                
                errorBox.innerText = "Network issue. Failed to post comment.";
                errorBox.style.display = 'block';
                setTimeout(() => { errorBox.style.display = 'none'; }, 4000);
            }
        });
    },

    // 3. Zero-Lag Fast UI Update
    postOptimistic: (text) => {
        const container = document.getElementById('comments-container');
        const userName = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Student";
        const userInit = userName.charAt(0).toUpperCase();

        const tempId = "temp_" + Date.now();
        const commentHTML = `
            <div class="comment-card optimistic" id="${tempId}">
                <div class="user-avatar">${userInit}</div>
                <div class="comment-body">
                    <div class="comment-user">${userName} <span class="comment-time">Sending...</span></div>
                    <div class="comment-text" id="text_${tempId}"></div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('afterbegin', commentHTML);
        document.getElementById(`text_${tempId}`).textContent = text; // Secure insert (Anti-XSS)
        
        return tempId; // 🚨 YAHAN HAI WOH RETURN WALI LINE!
    },

    // 4. Dummy Comment Renderer (Temporary)
    renderDummyComments: () => {
        document.getElementById('comment-count').innerText = "1 Comment";
        document.getElementById('comments-container').innerHTML = `
            <div class="comment-card">
                <div class="user-avatar" style="background: #10b981;">A</div>
                <div class="comment-body">
                    <div class="comment-user">Aman <span class="comment-time">2 hours ago</span></div>
                    <div class="comment-text">The conceptual breakdown in this lecture was highly effective!</div>
                </div>
            </div>
        `;
    }
};
