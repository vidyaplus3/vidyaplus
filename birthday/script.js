
document.addEventListener("DOMContentLoaded", function() {
    
    // Tumhari Photos
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
    
    // Typewriter Message (Yeh apne aap type hoga)
    const specialMessage = "Happy Birthday Pooja! 🥳 Hamesha aise hi khush reh, mast reh, aur haan... party dena mat bhoolna! 🍕🎁 - Tera Dost, Sudhir.";
    let i = 0;
    
    function typeWriter() {
        if (i < specialMessage.length) {
            document.getElementById("typewriter-text").innerHTML += specialMessage.charAt(i);
            i++;
            setTimeout(typeWriter, 50); // Speed control (50ms per letter)
        }
    }

    // Button Click Event
    document.getElementById('start-btn').addEventListener('click', function() {
        this.style.display = 'none';
        document.getElementById('surprise-section').classList.remove('hidden');
        audio.play();

        // Start Typewriter Effect
        setTimeout(typeWriter, 500); // Thodi der baad type hona shuru hoga

        // Start Image Slider
        setInterval(() => {
            currentImageIndex = (currentImageIndex + 1) % images.length;
            sliderImg.src = images[currentImageIndex];
        }, 3000);

        startConfetti();
    });

    // Background Tab Stop Fix
    document.addEventListener("visibilitychange", function() {
        if (document.hidden) {
            audio.pause(); 
        } else {
            if (!document.getElementById('surprise-section').classList.contains('hidden')) {
                audio.play();
            }
        }
    });

    // Confetti Function
    function startConfetti() {
        const container = document.getElementById('confetti-container');
        const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#ff69b4', '#ffd700'];
        const emojis = ['🎉', '🎈', '🎂', '🥳', '🎁', '✨']; 

        for (let j = 0; j < 120; j++) {
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
                
            }, j * 40); // Thoda aur fast confetti drops
        }
    }
});
