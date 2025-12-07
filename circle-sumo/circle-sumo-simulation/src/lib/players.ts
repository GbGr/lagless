const COLORS = [
  0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xb25000, 0x09b200, 0x008fb2, 0x000000, 0x26ff00,
  0xb2a900, 0x00ffbb, 0xfbff00, 0x7500a4, 0x949494, 0xffffff, 0x4400ff, 0xff54c6, 0xf8c89b, 0xff00e5, 0x003cff,
  0xbe026c, 0xff5e00, 0xd4af37, 0x8b4513, 0xcc00ff,
];

export enum PatterType {
  Solid,
  Static,
  Dynamic,
}

type PlayerSolid = {
  type: PatterType.Solid;
  color: number;
};

type PlayerStatic = {
  type: PatterType.Static;
  colorA: number;
  colorB: number;
};

type PlayerDynamic = {
  type: PatterType.Dynamic;
  colorA: number;
  colorB: number;
};

export type PlayerPreset = PlayerSolid | PlayerStatic | PlayerDynamic;

export const PLAYER_PRESETS_META = {
  [PatterType.Solid]: { startIndex: 0, count: 0 },
  [PatterType.Static]: { startIndex: 0, count: 0 },
  [PatterType.Dynamic]: { startIndex: 0, count: 0 },
};

export const PLAYER_PRESETS: Record<number, PlayerPreset> = {};

export const isSolid = (id: number) => PLAYER_PRESETS[id]?.type === PatterType.Solid;
export const isStatic = (id: number) => PLAYER_PRESETS[id]?.type === PatterType.Static;
export const isDynamic = (id: number) => PLAYER_PRESETS[id]?.type === PatterType.Dynamic;

export const isSolidGuard = (preset: PlayerPreset) => preset.type === PatterType.Solid;
export const isStaticGuard = (preset: PlayerPreset) => preset.type === PatterType.Static;
export const isDynamicGuard = (preset: PlayerPreset) => preset.type === PatterType.Dynamic;

export const getRandomSolidSkinId = () => Math.floor(Math.random() * COLORS.length);
export const getRandomSkinId = () => Math.floor(Math.random() * nextPlayerId);
export const spinRandomSkinId = (ownedSkins: Array<number>) => {
  const ownedSkinsMap = new Map<number, void>(ownedSkins.map((id) => [id, undefined]));
  const roll = Math.random();
  if (roll < 0.1) {
    const startIndex = PLAYER_PRESETS_META[PatterType.Dynamic].startIndex;
    const count = PLAYER_PRESETS_META[PatterType.Dynamic].count;
    let winningIndex = Math.floor(Math.random() * count);

    while (ownedSkinsMap.has(startIndex + winningIndex)) {
      winningIndex = (winningIndex + 1) % count;
    }

    return startIndex + winningIndex;
  } else {
    const fromIndex = 0;
    const toIndex = PLAYER_PRESETS_META[PatterType.Dynamic].startIndex;
    let winningIndex = Math.floor(Math.random() * (toIndex - fromIndex));
    while (ownedSkinsMap.has(fromIndex + winningIndex)) {
      winningIndex = (winningIndex + 1) % (toIndex - fromIndex);
    }

    return fromIndex + winningIndex;
  }
};

// Player ids start from 0
let nextPlayerId = 0;

// Helper to fill presets and meta for each pattern type
const definePresetsForType = (type: PatterType, build: () => void) => {
  const startIndex = nextPlayerId;
  PLAYER_PRESETS_META[type].startIndex = startIndex;

  build();

  PLAYER_PRESETS_META[type].count = nextPlayerId - startIndex;
};

// --- Solid presets ---
definePresetsForType(PatterType.Solid, () => {
  for (const color of COLORS) {
    PLAYER_PRESETS[nextPlayerId++] = {
      type: PatterType.Solid,
      color,
    };
  }
});

// --- Static presets (all ordered pairs, colors must be different) ---
definePresetsForType(PatterType.Static, () => {
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = 0; j < COLORS.length; j++) {
      if (i === j) continue; // colors must be different
      PLAYER_PRESETS[nextPlayerId++] = {
        type: PatterType.Static,
        colorA: COLORS[i],
        colorB: COLORS[j],
      };
    }
  }
});

// --- Dynamic presets (same ordered pairs as Static) ---
definePresetsForType(PatterType.Dynamic, () => {
  for (let i = 0; i < COLORS.length; i++) {
    for (let j = 0; j < COLORS.length; j++) {
      if (i === j) continue; // colors must be different
      PLAYER_PRESETS[nextPlayerId++] = {
        type: PatterType.Dynamic,
        colorA: COLORS[i],
        colorB: COLORS[j],
      };
    }
  }
});

export const SKINS_COUNT = nextPlayerId;
