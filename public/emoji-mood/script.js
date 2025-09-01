const emojis = ["😎", "😴", "😂", "🤯", "😡", "😍", "🥶", "😱", "🧐", "🤓", "🥳"];
const moods = [
  "Cool and confident 😎",
  "Sleepy... 💤",
  "Laughing out loud 😂",
  "Mind blown 🤯",
  "Frustrated 😡",
  "Totally in love 😍",
  "Freezing 🥶",
  "Terrified 😱",
  "Curious 🧐",
  "Nerd mode 🤓",
  "Celebrating 🥳"
];

// 🎧 Match each mood to a fitting sound
const soundUrls = [
  "https://www.fesliyanstudios.com/play-mp3/4369", // Cool
  "https://www.fesliyanstudios.com/play-mp3/4414", // Sleepy
  "https://www.fesliyanstudios.com/play-mp3/4380", // Laugh
  "https://www.fesliyanstudios.com/play-mp3/6388", // Mind blown
  "https://www.fesliyanstudios.com/play-mp3/4366", // Angry
  "https://www.fesliyanstudios.com/play-mp3/4425", // Love
  "https://www.fesliyanstudios.com/play-mp3/4382", // Freezing
  "https://www.fesliyanstudios.com/play-mp3/4371", // Scared
  "https://www.fesliyanstudios.com/play-mp3/4372", // Curious
  "https://www.fesliyanstudios.com/play-mp3/4400", // Nerd
  "https://www.fesliyanstudios.com/play-mp3/6389"  // Party
];

// 🎺 Preload all sounds
const moodSounds = soundUrls.map(url => {
  const audio = new Audio(url);
  audio.preload = "auto";
  return audio;
});


const emojiDiv = document.querySelector(".emoji");
const moodText = document.getElementById("mood-text");
const button = document.getElementById("newMood");

const matrixBg = document.getElementById("matrix-bg");

function getRandomColor() {
  const colors = ["#fca5f1", "#b5ffff", "#fcd34d", "#a7f3d0", "#93c5fd", "#e879f9", "#fde68a"];
  return colors[Math.floor(Math.random() * colors.length)];
}

button.addEventListener("click", () => {
  const index = Math.floor(Math.random() * emojis.length);

  triggerEffect(index);


  // Update UI
  emojiDiv.textContent = emojis[index];
  moodText.textContent = moods[index];
  document.body.style.background = getRandomColor();

  // Bounce animation
  emojiDiv.classList.remove("bounce");
  void emojiDiv.offsetWidth;
  emojiDiv.classList.add("bounce");

  // Play mood sound
  const sound = moodSounds[index];
  sound.currentTime = 0;
  sound.play().catch(e => console.warn("Sound play error:", e));

// Nerd mode = matrix on
if (index === 9) {
  canvas.style.opacity = "0.25";
  startMatrix();
} else {
  canvas.style.opacity = "0";
  stopMatrix();
}


});

const canvas = document.getElementById('matrix-canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const letters = 'アカサタナハマヤラワ0123456789ABCDEFGHIJKLMNOPQRSTUVXYZ'.split('');
const fontSize = 14;
const columns = canvas.width / fontSize;
const drops = Array(Math.floor(columns)).fill(1);

function drawMatrixRain() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0F0';
  ctx.font = `${fontSize}px monospace`;

  drops.forEach((y, i) => {
    const text = letters[Math.floor(Math.random() * letters.length)];
    const x = i * fontSize;
    ctx.fillText(text, x, y * fontSize);

    if (y * fontSize > canvas.height && Math.random() > 0.975) {
      drops[i] = 0;
    }

    drops[i]++;
  });
}

let matrixInterval;
function startMatrix() {
  if (!matrixInterval) {
    matrixInterval = setInterval(drawMatrixRain, 50);
  }
}

function stopMatrix() {
  clearInterval(matrixInterval);
  matrixInterval = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}


function triggerEffect(index) {
  // Clear all mood effect classes
  const classList = document.body.classList;
  classList.remove(
    "cool-mode", "sleepy-mode", "laugh-mode", "explode-mode",
    "angry-mode", "love-mode", "freeze-mode", "fear-mode",
    "curious-mode", "party-mode"
  );

  // Matrix canvas already handled separately
  if (index === 9) return;

  const effectClasses = [
    "cool-mode", "sleepy-mode", "laugh-mode", "explode-mode",
    "angry-mode", "love-mode", "freeze-mode", "fear-mode",
    "curious-mode", null, "party-mode"
  ];

  const moodClass = effectClasses[index];
  if (moodClass) {
    document.body.classList.add(moodClass);
  }
}
