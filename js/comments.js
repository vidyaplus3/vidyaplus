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
                <div class="comment-card" style="opacity:0.5;"><div class="user-avatar" style="background:#e2e8f0; color:transparent;">-</div><div class="comment-body" style="background:#f1f5f9; min-height:60px; border-radius:12px; width:100%;"></div></div>
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

        setTimeout(() => {
            CommentEngine.initSecurity(lectureId);
            CommentEngine.fetchComments(lectureId); // 🚨 THE MAGIC: Asli data layega
        }, 50);
    },

    // 2. 🚀 VERCEL SE ASLI COMMENTS LANA
    fetchComments: async (lectureId) => {
        const container = document.getElementById('comments-container');
        const countSpan = document.getElementById('comment-count');
        
        try {
            const token = await auth.currentUser.getIdToken();
            const response = await fetch(`https://vidyaplus-backend.vercel.app/api/comments/${lectureId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) throw new Error("Fetch failed");
            const result = await response.json();
            
            // Agar ek bhi comment nahi hai
            if (result.comments.length === 0) {
                container.innerHTML = `<div class="empty-box" style="text-align:center; padding:30px; color:#94a3b8;"><i class="fas fa-comments" style="font-size:2rem; margin-bottom:10px;"></i><p>No queries yet. Be the first to start the discussion!</p></div>`;
                countSpan.innerText = "0 Comments";
                return;
            }

            countSpan.innerText = `${result.comments.length} Comment${result.comments.length > 1 ? 's' : ''}`;
            container.innerHTML = ''; // Purana kachra/skeletons clean karo

            // Naye comments ko screen par lagana
            result.comments.forEach(comment => {
                const userInit = comment.user_name.charAt(0).toUpperCase();
                const timeString = CommentEngine.timeAgo(comment.created_at); // Time convert kiya
                
                const commentHTML = `
                    <div class="comment-card">
                        <div class="user-avatar">${userInit}</div>
                        <div class="comment-body">
                            <div class="comment-user">${comment.user_name} <span class="comment-time">${timeString}</span></div>
                            <div class="comment-text">${comment.text}</div>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', commentHTML);
            });

        } catch (error) {
            console.error("Failed to load comments:", error);
            container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-weight:600;">Failed to load discussions. Please refresh.</div>`;
            countSpan.innerText = "Error";
        }
    },

    // 3. 🕒 TIME CONVERTER (UTC to "2 mins ago")
    timeAgo: (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.round((now - date) / 1000);
        const minutes = Math.round(seconds / 60);
        const hours = Math.round(minutes / 60);
        const days = Math.round(hours / 24);

        if (seconds < 60) return "Just now";
        if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
        return `${days} day${days > 1 ? 's' : ''} ago`;
    },

    // 4. Security, Logic aur API Call
    initSecurity: (lectureId) => {
        const input = document.getElementById('comment-input');
        const btn = document.getElementById('send-comment-btn');
        const counter = document.getElementById('char-counter');
        const errorBox = document.getElementById('comment-error');

        input.addEventListener('input', (e) => {
            const text = e.target.value;
            counter.innerText = `${text.length}/500`;
            counter.style.color = text.length >= 490 ? '#ef4444' : '#94a3b8';
            btn.disabled = text.trim().length === 0;
        });

        btn.addEventListener('click', async () => {
            const text = input.value.trim();
            if (text.length === 0) return; 

            const now = Date.now();
            if (now - lastCommentTime < 10000) { 
                errorBox.innerText = "Please take a breath! Wait 10 seconds before posting again.";
                errorBox.style.display = 'block';
                setTimeout(() => { errorBox.style.display = 'none'; }, 4000);
                return;
            }

            const badWords = ['stupid', 'idiot']; 
            let cleanText = text;
            badWords.forEach(word => {
                const regex = new RegExp(word, 'gi');
                cleanText = cleanText.replace(regex, '***');
            });

            // Optimistic UI dikhao
            const tempId = CommentEngine.postOptimistic(cleanText);
            lastCommentTime = now;
            
            const savedText = input.value;
            input.value = '';
            btn.disabled = true;
            counter.innerText = `0/500`;
            
            try {
                const token = await auth.currentUser.getIdToken();
                const response = await fetch('https://vidyaplus-backend.vercel.app/api/comments', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lectureId: lectureId, text: cleanText })
                });

                if (!response.ok) throw new Error("Backend verification failed");

                const timeElement = document.querySelector(`#${tempId} .comment-time`);
                if(timeElement) timeElement.innerText = "Just now";
                const cardElement = document.getElementById(tempId);
                if(cardElement) cardElement.classList.remove('optimistic');

                // 🚨 UPDATE: Comment add hone par count badha do
                const countSpan = document.getElementById('comment-count');
                const currentCount = parseInt(countSpan.innerText) || 0;
                countSpan.innerText = `${currentCount + 1} Comment${currentCount + 1 > 1 ? 's' : ''}`;

            } catch (error) {
                console.error("Comment Post Failed:", error);
                const failedComment = document.getElementById(tempId);
                if(failedComment) failedComment.remove();
                
                input.value = savedText; 
                btn.disabled = false;
                counter.innerText = `${savedText.length}/500`;
                
                errorBox.innerText = "Network issue. Failed to post comment.";
                errorBox.style.display = 'block';
                setTimeout(() => { errorBox.style.display = 'none'; }, 4000);
            }
        });
    },

    // 5. Zero-Lag Fast UI Update
    postOptimistic: (text) => {
        const container = document.getElementById('comments-container');
        const userName = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Student";
        const userInit = userName.charAt(0).toUpperCase();

        // Agar empty box dikh raha hai toh usko hata do
        const emptyBox = container.querySelector('.empty-box');
        if (emptyBox) container.innerHTML = ''; 

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
        document.getElementById(`text_${tempId}`).textContent = text; 
        
        return tempId; 
    }
};
