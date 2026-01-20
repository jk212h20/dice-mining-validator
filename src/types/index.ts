// Dice colors in the game
export type DiceColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

// All dice colors
export const DICE_COLORS: DiceColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

// Mapping of dice value to color (the VALUES determine required colors for next block)
export const VALUE_TO_COLOR: Record<number, DiceColor> = {
  1: 'red',
  2: 'orange',
  3: 'yellow',
  4: 'green',
  5: 'blue',
  6: 'purple'
};

export const COLOR_TO_VALUE: Record<DiceColor, number> = {
  red: 1,
  orange: 2,
  yellow: 3,
  green: 4,
  blue: 5,
  purple: 6
};

// Display colors for UI
export const COLOR_HEX: Record<DiceColor, string> = {
  red: '#e63946',
  orange: '#f4a261',
  yellow: '#e9c46a',
  green: '#2a9d8f',
  blue: '#457b9d',
  purple: '#9b5de5'
};

// Genesis block fixed pattern: 2 red, 2 orange, 2 yellow, 3 green
// Total value: 1+1+2+2+3+3+4+4+4 = 24
export const GENESIS_PATTERN: DiceColor[] = [
  'red', 'red',       // value 1
  'orange', 'orange', // value 2
  'yellow', 'yellow', // value 3
  'green', 'green', 'green' // value 4
];

export const GENESIS_VALUES: number[] = [1, 1, 2, 2, 3, 3, 4, 4, 4];

// Detected die from camera
export interface DetectedDie {
  color: DiceColor;
  pips: number; // 1-6
  confidence: number; // 0-1 for color detection
  bounds: { x: number; y: number; width: number; height: number };
}

// Detected block (9 dice in a 3x3 tray)
export interface DetectedBlock {
  id: string;
  dice: DetectedDie[];
  total: number; // sum of pip values
  trayColor: string; // hex color of the tray
  position: { x: number; y: number }; // center position for column sorting
  column: number; // computed: 0 = genesis, 1, 2, etc.
}

// Validated block with predecessor info
export interface ValidatedBlock extends DetectedBlock {
  isGenesis: boolean;
  predecessorId: string | null;
  isValid: boolean;
  errors: string[];
  requiredColors: DiceColor[]; // colors required for blocks building on this
}

// Calibration data for color detection
export interface HSVRange {
  hMin: number;
  hMax: number;
  sMin: number;
  sMax: number;
  vMin: number;
  vMax: number;
}

export interface CalibrationData {
  diceColors: Record<DiceColor, HSVRange>;
  trayColors: HSVRange[]; // player tray colors
  isCalibrated: boolean;
  calibratedAt: number;
}

// App state
export type AppScreen = 'home' | 'calibrate' | 'scan' | 'review' | 'results';

export interface ValidationResult {
  blocks: ValidatedBlock[];
  longestChain: string[];
  totalBlocks: number;
  validBlocks: number;
  invalidBlocks: number;
  difficulty: number;
}

// Default calibration (rough estimates for typical lighting)
export const DEFAULT_CALIBRATION: CalibrationData = {
  diceColors: {
    red: { hMin: 0, hMax: 10, sMin: 100, sMax: 255, vMin: 100, vMax: 255 },
    orange: { hMin: 10, hMax: 25, sMin: 100, sMax: 255, vMin: 100, vMax: 255 },
    yellow: { hMin: 25, hMax: 40, sMin: 100, sMax: 255, vMin: 100, vMax: 255 },
    green: { hMin: 40, hMax: 80, sMin: 50, sMax: 255, vMin: 50, vMax: 255 },
    blue: { hMin: 90, hMax: 130, sMin: 50, sMax: 255, vMin: 50, vMax: 255 },
    purple: { hMin: 130, hMax: 170, sMin: 50, sMax: 255, vMin: 50, vMax: 255 }
  },
  trayColors: [],
  isCalibrated: false,
  calibratedAt: 0
};
