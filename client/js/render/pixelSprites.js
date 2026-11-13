const PALETTES = {
  rex: {
    hat: '#ff7a00',
    hatDark: '#b84b00',
    skin: '#f6c29f',
    eyes: '#1a1a2e',
    jacket: '#2563eb',
    jacketTrim: '#60a5fa',
    pants: '#1e293b',
    shoes: '#ff8a1f',
  },
  luna: {
    hat: '#a855f7',
    hatDark: '#6b21a8',
    skin: '#fde2d2',
    eyes: '#38bdf8',
    jacket: '#ec4899',
    jacketTrim: '#f9a8d4',
    pants: '#311042',
    shoes: '#e879f9',
  },
  byte: {
    hat: '#0ea5e9',
    hatDark: '#0369a1',
    skin: '#cbd5e1',
    eyes: '#22c55e',
    jacket: '#0f172a',
    jacketTrim: '#38bdf8',
    pants: '#1e293b',
    shoes: '#22d3ee',
  },
  niko: {
    hat: '#22c55e',
    hatDark: '#15803d',
    skin: '#d99b72',
    eyes: '#111827',
    jacket: '#facc15',
    jacketTrim: '#fef08a',
    pants: '#14532d',
    shoes: '#4ade80',
  },
};

const SPRITE_CACHE = new Map();

function buildCharacterSprite(charKey, frame = 0) {
  const key = `${charKey}_${frame}`;
  if (SPRITE_CACHE.has(key)) return SPRITE_CACHE.get(key);

  const pal = PALETTES[charKey] || PALETTES.rex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');

  const px = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  // Sombra
  px(4, 14, 8, 2, 'rgba(0,0,0,0.35)');

  // Capacete / Boné pixel art
  px(4, 1, 8, 2, pal.hat);
  px(3, 3, 10, 2, pal.hatDark);
  px(5, 2, 3, 1, '#ffffff'); // brilho

  // Rosto
  px(4, 5, 8, 4, pal.skin);
  px(5, 6, 2, 2, pal.eyes);
  px(9, 6, 2, 2, pal.eyes);

  // Tronco / Jaqueta
  px(3, 9, 10, 4, pal.jacket);
  px(7, 9, 2, 4, pal.jacketTrim);
  // Braços
  const armOffset = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  px(2, 9 + Math.max(0, armOffset), 1, 3, pal.skin);
  px(13, 9 + Math.max(0, -armOffset), 1, 3, pal.skin);

  // Pernas / Botas animadas
  if (frame === 1) {
    px(4, 13, 3, 2, pal.shoes);
    px(9, 12, 3, 2, pal.shoes);
  } else if (frame === 2) {
    px(4, 12, 3, 2, pal.shoes);
    px(9, 13, 3, 2, pal.shoes);
  } else {
    px(4, 13, 3, 2, pal.shoes);
    px(9, 13, 3, 2, pal.shoes);
  }

  SPRITE_CACHE.set(key, c);
  return c;
}

export function drawCharacter(ctx, charKey, centerX, centerY, size, frame = 0, alpha = 1) {
  const sprite = buildCharacterSprite(charKey, frame);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, centerX - size / 2, centerY - size / 2, size, size);
  ctx.restore();
}

export function renderCharacterPreviews() {
  document.querySelectorAll('canvas.pixel-preview').forEach((canvas) => {
    const charKey = canvas.dataset.preview;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCharacter(ctx, charKey, canvas.width / 2, canvas.height / 2, canvas.width - 4, 0, 1);
  });
}
