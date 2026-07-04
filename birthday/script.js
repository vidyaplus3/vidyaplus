

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
    
    // Typewriter Message
    const specialMessage = "Happy Birthday Pooja! 🥳 Hamesha aise hi khush reh, mast reh, aur haan... party dena mat bhoolna! 🍕🎁 - your friend, Sudhir.";
    let i = 0;
    
    function typeWriter() {
        if (i < specialMessage.length) {
            document.getElementById("typewriter-text").innerHTML += specialMessage.charAt(i);
            i++;
            setTimeout(typeWriter, 50); 
        }
    }

    // Button Click Event
    document.getElementById('start-btn').addEventListener('click', function() {
        this.style.display = 'none';
        document.getElementById('surprise-section').classList.remove('hidden');
        audio.play().catch(e => console.log("Audio play failed: ", e));

        setTimeout(typeWriter, 500); 

        // Start Image Slider with Smooth Crossfade Trick
        setInterval(() => {
            currentImageIndex = (currentImageIndex + 1) % images.length;
            
            // Animation reset technique
            sliderImg.classList.remove("fade-anim");
            void sliderImg.offsetWidth; // Trigger reflow
            sliderImg.classList.add("fade-anim");
            
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
                audio.play().catch(e => console.log(e));
            }
        }
    });

    // Optimized Confetti Function (No Lag)
    function startConfetti() {
        const container = document.getElementById('confetti-container');
        const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#ff69b4', '#ffd700'];
        const emojis = ['🎉', '🎈', '🎂', '🥳', '🎁', '✨']; 

        // Reduced count to 75 to keep 60fps on mobile devices
        for (let j = 0; j < 75; j++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                
                confetti.style.left = Math.random() * 100 + 'vw';
                
                if (Math.random() > 0.4) {
                    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
                    confetti.style.width = (Math.random() * 10 + 5) + 'px';
                    confetti.style.height = confetti.style.width;
                } else {
                    confetti.innerText = emojis[Math.floor(Math.random() * emojis.length)];
                    confetti.style.background = 'transparent';
                    confetti.style.fontSize = Math.random() * 15 + 15 + 'px';
                }

                const duration = Math.random() * 2.5 + 2;
                confetti.style.animationDuration = duration + 's';
                
                container.appendChild(confetti);

                setTimeout(() => {
                    confetti.remove();
                }, duration * 1000);
                
            }, j * 60); 
        }
    }
});
