import JSConfetti from 'js-confetti';

const confettiInstance = new JSConfetti();

export const launchConfetti = async () => {
  await confettiInstance.addConfetti({
    emojis: ['🎉', '✨', '💥', '🌟', '🥳'],
    emojiSize: 50,
    confettiNumber: 100,
    confettiColors: [
      '#FFD700',
      '#FFC700',
      '#FFB700',
      '#FFA700',
      '#FF9700',
      '#FF8700',
      '#FF7700',
    ],
  });
};

export const playTop1Confetti = async () => {
  await confettiInstance.addConfetti({
    emojis: ['🏆', '🥇'],
    emojiSize: 80,
    confettiNumber: 100,
    confettiColors: [
      '#FFD700',
      '#FFC700',
      '#FFB700',
      '#FFA700',
      '#FF9700',
      '#FF8700',
      '#FF7700',
    ],
  });
};

export const playTop2Confetti = async () => {
  await confettiInstance.addConfetti({
    emojis: ['🥈'],
    emojiSize: 80,
    confettiNumber: 100,
    confettiColors: [
      '#C0C0C0',
      '#B0B0B0',
      '#A0A0A0',
      '#909090',
      '#808080',
    ],
  });
};

export const playTop3Confetti = async () => {
  await confettiInstance.addConfetti({
    emojis: ['🥉'],
    emojiSize: 80,
    confettiNumber: 200,
    confettiColors: [
      '#CD7F32',
      '#BC6F2B',
      '#AC5F24',
      '#9C4F1D',
      '#8C3F16',
    ],
  });
};
