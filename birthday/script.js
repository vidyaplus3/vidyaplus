document.addEventListener("DOMContentLoaded", function() {
    
    const images = [
        "image/pooja1.png",  
        "image/pooja2.png",  
        "image/pooja3.png",   
        "image/pooja4.png",
        "image/pooja5.png",
        "image/pooja6.png"
    ];

    let currentImageIndex = 0;
    const sliderImg = document.getElementById('slider-img');
    const audio = document.getElementById('bday-audio');

    // Button Click Event
    document.getElementById('start-btn').addEventListener('click', function() {
        this.style.display = 'none';
        document.getElementById('surprise-section').classList.remove('hidden');
        audio.play();

        setInterval(() => {
            currentImageIndex = (currentImageIndex + 1) % images.length;
            sliderImg.src = images[currentImageIndex];
        }, 3000);

        startConfetti();
    });

    // --- NAYA CODE YAHAN ADD KIYA HAI ---
    document.addEventListener("visibilitychange", function() {
        if (document.hidden) {
            audio.pause(); 
        } else {
            if (!document.getElementById('surprise-section').classList.contains('hidden')) {
                audio.play();
            }
        }
    });
    // ------------------------------------

    function startConfetti() {
        const container = document.getElementById('confetti-container');
        const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#ff69b4', '#ffd700'];
        const emojis = ['🎉', '🎈', '🎂', '🥳', '🎁']; 

        for (let i = 0; i < 100; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                
                confetti.style.left = Math.random() * 100 + 'vw';
                confetti.style.top = '-5vh';
                
                if (Math.random() > 0.4) {
                    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
                } else {
                    confetti.innerText = emojis[Math.floor(Math.random() * emojis.length)];
                    confetti.style.background = 'transparent';
                    confetti.style.fontSize = Math.random() * 15 + 15 + 'px';
                }

                const duration = Math.random() * 3 + 2;
                confetti.style.animationDuration = duration + 's';
                
                container.appendChild(confetti);

                setTimeout(() => {
                    confetti.remove();
                }, duration * 1000);
                
            }, i * 50);
        }
    }
});
