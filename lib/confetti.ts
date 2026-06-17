import confetti from "canvas-confetti";

export const triggerEmojiConfetti = (emoji: string, x?: number, y?: number) => {
  try {
    const scalar = 2;
    // shapeFromText creates a canvas particle shaped like the emoji!
    const emojiShape = confetti.shapeFromText({ text: emoji, scalar });

    confetti({
      shapes: [emojiShape],
      scalar,
      particleCount: 20,
      spread: 70,
      origin: x && y ? { x: x / window.innerWidth, y: y / window.innerHeight } : { y: 0.8 },
      zIndex: 9999,
      gravity: 0.8,
      ticks: 150
    });
  } catch (e) {
    // Fallback if shapeFromText is not supported or fails
    confetti({
      particleCount: 30,
      spread: 70,
      origin: x && y ? { x: x / window.innerWidth, y: y / window.innerHeight } : { y: 0.8 },
      zIndex: 9999
    });
  }
};
