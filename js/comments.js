// js/comments.js
import { auth } from './firebase-init.js';

let lastCommentTime = 0;

export const CommentEngine = {
    currentPage: 1,
    hasMore: true,
    isLoading: false,
    currentLecture: null,

    // 1. UI Render (With YouTube style Minimal Skeletons)
    renderUI: (containerElement, lectureId) => {
        CommentEngine.currentPage = 1;
        CommentEngine.hasMore = true;
        CommentEngine.isLoading = false;
        CommentEngine.currentLecture = lectureId;

        containerElement.innerHTML = `
            <div style="margin-bottom: 20px; font-weight: 700; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
                Academic Discussion <span id="comment-count" style="font-size:0.8rem; color:var(--primary); font-weight:700; background:#E0E7FF; padding:2px 8px; border-radius:12px;">Syncing...</span>
            </div>
            
            <div id="comments-container" style="padding-bottom: 20px; min-height: 200px;">
                <div class="comment-card" style="opacity:0.6;">
                    <div class="skeleton" style="width:36px; height:36px; border-radius:50%;"></div>
                    <div class="comment-body">
                        <div class="skeleton" style="height:12px; width:120px; border-radius:4px; margin-bottom:8px;"></div>
                        <div class="skeleton" style="height:14px; width:90%; border-radius:4px; margin-bottom:4px;"></div>
                        <div class="skeleton" style="height:14px; width:60%; border-radius:4px;"></div>
                    </div>
                </div>
            </div>
            
            <div class="comment-input-area">
                <div id="comment-error" style="color: #ef4444; font-size: 0.75rem; font-weight: 600; padding: 0 10px 8px; display: none; transition: 0.3s;"></div>
                <div style="display: flex; gap: 10px; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 25px; padding: 5px 5px 5px 15px;">
                    <input type="text" id="comment-input" placeholder="Add a query..." autocomplete="off" maxlength="500">
                    <button id="send-comment-btn" class="send-btn" disabled><i class="fas fa-paper-plane"></i></button>
                </div>
                <div style="text-align: right; font-size: 0.65rem; color: #94a3b8; margin-top: 4px; padding-right: 15px;" id="char-counter">0/500</div>
            </div>
        `;

        setTimeout(() => {
            CommentEngine.initSecurity(lectureId);
            CommentEngine.fetchComments(); 
            CommentEngine.setupInfiniteScroll(); 
        }, 50);
    },

    // 2. HTML Generator (YouTube Style - Clean & Transparent)
    generateCommentHTML: (comment, isReply = false) => {
        const userInit = comment.user_name.charAt(0).toUpperCase();
        const timeString = CommentEngine.timeAgo(comment.created_at);
        
        // 🚨 YOUTUBE INDENTATION: Reply hoga toh sirf left se khiskega, koi dabba/border nahi aayega
        const marginStyle = isReply ? "margin-left: 3.5rem; margin-top: 12px; margin-bottom: 12px;" : "";
        const avatarStyle = isReply ? "width: 26px; height: 26px; font-size: 0.75rem;" : "";
        
        const likeColor = comment.is_liked_by_user ? 'var(--primary)' : '#64748b';

        return `
            <div class="comment-card" id="comment_${comment.id}" style="${marginStyle}">
                <div class="user-avatar" style="${avatarStyle}">${userInit}</div>
                <div class="comment-body">
                    <div class="comment-user">${comment.user_name} <span class="comment-time">${timeString}</span></div>
                    <div class="comment-text">${comment.text}</div>
                    
                    <div class="comment-actions" style="display: flex; gap: 18px; align-items: center;">
                        <button class="like-action-btn" data-id="${comment.id}" style="font-size: 0.8rem; color: ${likeColor}; background: none; border: none; cursor: pointer; padding: 0; display:flex; align-items:center; gap: 5px; transition: 0.2s;">
                            <i class="fas fa-thumbs-up pointer-events-none"></i> <span class="like-count pointer-events-none" style="font-weight:600;">${comment.like_count || 0}</span>
                        </button>
                        
                        ${!isReply ? `
                            <button class="reply-action-btn" data-id="${comment.id}" style="font-size: 0.8rem; color: #64748b; background: none; border: none; cursor: pointer; padding: 0; display:flex; align-items:center; gap: 5px; font-weight: 600; transition: 0.2s;">
                                <i class="fas fa-reply pointer-events-none"></i> Reply
                            </button>
                        ` : ''}

                        <button class="report-action-btn" data-id="${comment.id}" title="Report to Admin" style="font-size: 0.8rem; color: #cbd5e1; background: none; border: none; cursor: pointer; padding: 0; margin-left: auto; transition: 0.2s;">
                            <i class="fas fa-flag pointer-events-none"></i>
                        </button>
                    </div>
                    
                    ${!isReply ? `
                        <div id="reply-box-${comment.id}" style="display:none; margin-top: 12px; padding-bottom: 8px;">
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="reply-input-${comment.id}" style="flex:1; background: transparent; border-bottom: 1px solid var(--text-main); padding:6px 2px; font-size:0.85rem; outline:none;" placeholder="Write a reply...">
                                <button class="send-reply-btn" data-id="${comment.id}" style="background: none; color: var(--primary); border: none; font-weight: 700; cursor: pointer; padding: 0 10px;">Reply</button>
                            </div>
                        </div>
                        <div class="replies-container" id="replies-${comment.id}"></div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // 3. Fetch Data
    fetchComments: async (isLoadMore = false) => {
        if (CommentEngine.isLoading || (!CommentEngine.hasMore && isLoadMore)) return;
        CommentEngine.isLoading = true;
        
        const container = document.getElementById('comments-container');
        const countSpan = document.getElementById('comment-count');
        if (isLoadMore) container.insertAdjacentHTML('beforeend', `<div id="scroll-spinner" style="text-align:center; padding:10px;"><i class="fas fa-circle-notch fa-spin text-blue-500"></i></div>`);

        try {
            const token = await auth.currentUser.getIdToken();
            const response = await fetch(`https://vidyaplus-backend.vercel.app/api/comments/${CommentEngine.currentLecture}?page=${CommentEngine.currentPage}&limit=20`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Fetch failed");
            
            const result = await response.json();
            if (!isLoadMore) container.innerHTML = ''; 
            const spinner = document.getElementById('scroll-spinner');
            if (spinner) spinner.remove();

            if (result.comments.length === 0 && !isLoadMore) {
                container.innerHTML = `<div class="empty-box" style="text-align:center; padding:30px; color:#94a3b8;"><i class="fas fa-comments" style="font-size:2rem; margin-bottom:10px;"></i><p>No queries yet. Be the first to start the discussion!</p></div>`;
                countSpan.innerText = "0 Comments";
            } else {
                countSpan.innerText = `${result.totalCount || 0} Comment${result.totalCount > 1 ? 's' : ''}`;
                result.comments.forEach(comment => {
                    container.insertAdjacentHTML('beforeend', CommentEngine.generateCommentHTML(comment, false));
                    if (comment.replies && comment.replies.length > 0) {
                        const repliesBox = document.getElementById(`replies-${comment.id}`);
                        comment.replies.forEach(reply => {
                            repliesBox.insertAdjacentHTML('beforeend', CommentEngine.generateCommentHTML(reply, true));
                        });
                    }
                });
                CommentEngine.hasMore = result.hasMore;
                if (CommentEngine.hasMore) CommentEngine.currentPage++;
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            if (!isLoadMore) container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-weight:600;">Failed to load discussions. Please refresh.</div>`;
        } finally {
            CommentEngine.isLoading = false;
        }
    },

    // 4. Security, Logic & Interactive Clicks
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
            if (now - lastCommentTime < 10000) return;

            const tempId = CommentEngine.postOptimistic(text);
            lastCommentTime = now;
            const savedText = input.value;
            input.value = ''; btn.disabled = true; counter.innerText = `0/500`;
            
            try {
                const token = await auth.currentUser.getIdToken();
                const response = await fetch('https://vidyaplus-backend.vercel.app/api/comments', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lectureId: lectureId, text: text })
                });
                if (!response.ok) throw new Error("Backend failed");
                const resultData = await response.json();

                const card = document.getElementById(`comment_${tempId}`);
                if (card) {
                    const realId = resultData.id;
                    card.id = `comment_${realId}`;
                    card.classList.remove('optimistic');
                    card.querySelector('.comment-time').innerText = "Just now";
                    card.querySelector('.like-action-btn').setAttribute('data-id', realId);
                    card.querySelector('.reply-action-btn').setAttribute('data-id', realId);
                    card.querySelector('.report-action-btn').setAttribute('data-id', realId);
                    card.querySelector('.send-reply-btn').setAttribute('data-id', realId);
                    card.querySelector(`#reply-box-${tempId}`).id = `reply-box-${realId}`;
                    card.querySelector(`#reply-input-${tempId}`).id = `reply-input-${realId}`;
                    card.querySelector(`#replies-${tempId}`).id = `replies-${realId}`;
                }
            } catch (error) {
                const failedComment = document.getElementById(`comment_${tempId}`);
                if(failedComment) failedComment.remove();
                input.value = savedText; btn.disabled = false; counter.innerText = `${savedText.length}/500`;
            }
        });

        document.getElementById('comments-container').addEventListener('click', async (e) => {
            
            // LIKE BUTTON
            const likeBtn = e.target.closest('.like-action-btn');
            if (likeBtn) {
                const id = likeBtn.getAttribute('data-id');
                const countSpan = likeBtn.querySelector('.like-count');
                let count = parseInt(countSpan.innerText) || 0;
                
                const isLiked = likeBtn.style.color === 'var(--primary)' || likeBtn.style.color === 'rgb(79, 70, 229)';
                if (isLiked) {
                    likeBtn.style.color = '#64748b';
                    countSpan.innerText = count > 0 ? count - 1 : 0;
                } else {
                    likeBtn.style.color = 'var(--primary)';
                    countSpan.innerText = count + 1;
                }

                try {
                    const token = await auth.currentUser.getIdToken();
                    await fetch('https://vidyaplus-backend.vercel.app/api/comments/like', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ commentId: id })
                    });
                } catch (err) {
                    likeBtn.style.color = isLiked ? 'var(--primary)' : '#64748b';
                    countSpan.innerText = count;
                }
            }

            // REPORT BUTTON
            const reportBtn = e.target.closest('.report-action-btn');
            if (reportBtn) {
                const id = reportBtn.getAttribute('data-id');
                if (reportBtn.style.color === 'rgb(239, 68, 68)' || reportBtn.style.color === '#ef4444') return; 

                if(confirm("Flag this comment for admin review?")) {
                    reportBtn.style.color = '#ef4444'; 
                    try {
                        const token = await auth.currentUser.getIdToken();
                        await fetch('https://vidyaplus-backend.vercel.app/api/comments/report', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ commentId: id })
                        });
                        alert("Report registered successfully.");
                    } catch (err) {
                        reportBtn.style.color = '#cbd5e1'; 
                    }
                }
            }

            // REPLY TOGGLE
            const replyActionBtn = e.target.closest('.reply-action-btn');
            if (replyActionBtn) {
                const id = replyActionBtn.getAttribute('data-id');
                const box = document.getElementById(`reply-box-${id}`);
                box.style.display = box.style.display === 'none' ? 'block' : 'none';
            }

            // SEND REPLY
            const sendReplyBtn = e.target.closest('.send-reply-btn');
            if (sendReplyBtn) {
                const parentId = sendReplyBtn.getAttribute('data-id');
                const replyInput = document.getElementById(`reply-input-${parentId}`);
                const text = replyInput.value.trim();
                
                if (text.length === 0) return;
                replyInput.value = '';
                document.getElementById(`reply-box-${parentId}`).style.display = 'none';

                const tempId = CommentEngine.postOptimistic(text, parentId);

                try {
                    const token = await auth.currentUser.getIdToken();
                    const response = await fetch('https://vidyaplus-backend.vercel.app/api/comments', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lectureId: lectureId, text: text, parentId: parentId })
                    });
                    if (!response.ok) throw new Error("Reply failed");
                    const resultData = await response.json();

                    const replyCard = document.getElementById(`comment_${tempId}`);
                    if (replyCard) {
                        replyCard.id = `comment_${resultData.id}`;
                        replyCard.classList.remove('optimistic');
                        replyCard.querySelector('.comment-time').innerText = "Just now";
                        replyCard.querySelector('.like-action-btn').setAttribute('data-id', resultData.id);
                        replyCard.querySelector('.report-action-btn').setAttribute('data-id', resultData.id);
                    }
                } catch (error) {
                    const failedReply = document.getElementById(`comment_${tempId}`);
                    if(failedReply) failedReply.remove();
                    replyInput.value = text;
                    document.getElementById(`reply-box-${parentId}`).style.display = 'block';
                }
            }
        });
    },

    // 5. Zero-Lag Optimistic Render
    postOptimistic: (text, parentId = null) => {
        const userName = auth.currentUser ? (auth.currentUser.displayName || auth.currentUser.email.split('@')[0]) : "Student";
        const tempId = "temp_" + Date.now();
        
        const fakeComment = {
            id: tempId,
            user_name: userName,
            created_at: new Date().toISOString(),
            text: text,
            like_count: 0,
            is_liked_by_user: false 
        };

        const html = CommentEngine.generateCommentHTML(fakeComment, !!parentId);
        
        if (parentId) {
            const repliesBox = document.getElementById(`replies-${parentId}`);
            repliesBox.insertAdjacentHTML('beforeend', html);
        } else {
            const container = document.getElementById('comments-container');
            const emptyBox = container.querySelector('.empty-box');
            if (emptyBox) container.innerHTML = ''; 
            container.insertAdjacentHTML('afterbegin', html);
        }
        
        document.getElementById(`comment_${tempId}`).classList.add('optimistic');
        document.querySelector(`#comment_${tempId} .comment-time`).innerText = "Sending...";
        
        return tempId; 
    },

    setupInfiniteScroll: () => {
        const scrollArea = document.getElementById('classroom-dynamic-content'); 
        if (!scrollArea) return;
        scrollArea.addEventListener('scroll', () => {
            if (scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 50) {
                if (CommentEngine.hasMore && !CommentEngine.isLoading) {
                    CommentEngine.fetchComments(true);
                }
            }
        });
    },

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
    }
};


