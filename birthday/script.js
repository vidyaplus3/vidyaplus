document.getElementById('surpriseBtn').addEventListener('click', function() {
    // Hidden message dikhao
    document.getElementById('hiddenMessage').classList.remove('hidden');
    this.style.display = 'none'; // Button ko hide kar do

    // Confetti / Emoji burst effect
    createConfetti();
});

function createConfetti() {
    const container = document.getElementById('confetti-container');
    const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#9b59b6'];
    const emojis = ['🎉', '🎈', '🎂', '🥳', '✨'];

    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        
        // Random style aur positions
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        
        // Kabhi kabhi emoji daal do color block ki jagah
        if (Math.random() > 0.5) {
            confetti.innerText = emojis[Math.floor(Math.random() * emojis.length)];
            confetti.style.background = 'none';
            confetti.style.fontSize = '20px';
        }

        container.appendChild(confetti);
    }
}

