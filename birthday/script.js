// Apne images folder ke paths yahan daaliye
const images = [
    "images/pooja1.png",  // Pehli photo ka path
    "images/pooja2.png",  // Doosri photo ka path
    "images/pooja3.png"   // Teesri photo ka path (agar png hai toh .png likhein)
    "images/pooja4.png"
"images/pooja5.png"
"images/pooja6.png"

];

let currentImageIndex = 0;
const sliderImg = document.getElementById('slider-img');
const audio = document.getElementById('bday-audio');

// ... (Baaki ka poora code same rahega) ...
document.getElementById('start-btn').addEventListener('click', function() {
    // UI changes
    this.style.display = 'none';
    document.getElementById('surprise-section').classList.remove('hidden');
    
    // Play Music
    audio.play();

    // Start Image Slider (Har 3 second mein photo change hogi)
    setInterval(() => {
        currentImageIndex = (currentImageIndex + 1) % images.length;
        sliderImg.src = images[currentImageIndex];
    }, 3000);

    // Advanced Confetti
    startConfetti();
});

function startConfetti() {
    const container = document.getElementById('confetti-container');
    const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#ff69b4', '#ffd700'];
    const emojis = ['🎈', '✨', '🎉', '🎊', '🎁'];

    // Create 100 confetti pieces
    for (let i = 0; i < 100; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            
            // Random properties
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.top = '-5vh';
            
            // Mix of colors and emojis
            if (Math.random() > 0.4) {
                confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                // Some square, some round
                confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
            } else {
                confetti.innerText = emojis[Math.floor(Math.random() * emojis.length)];
                confetti.style.background = 'transparent';
                confetti.style.fontSize = Math.random() * 15 + 15 + 'px';
            }

            // Random animation duration
            const duration = Math.random() * 3 + 2;
            confetti.style.animationDuration = duration + 's';
            
            container.appendChild(confetti);

            // Clean up DOM
            setTimeout(() => {
                confetti.remove();
            }, duration * 1000);
            
        }, i * 50); // Staggered drop effect
    }
}
