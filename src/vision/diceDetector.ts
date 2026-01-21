import { Mat, Rect } from './opencv';
import {
  DiceColor,
  DICE_COLORS,
  DetectedDie,
  DetectedBlock,
  CalibrationData,
  HSVRange,
  DebugCandidate,
  DetectionDebugInfo
} from '../types';

// Minimum die area (percentage of image) to filter noise - made more lenient
const MIN_DIE_AREA_RATIO = 0.0005; // Very small dice still valid
const MAX_DIE_AREA_RATIO = 0.15;   // Large dice when close up

// Minimum pip area relative to die size
const MIN_PIP_AREA_RATIO = 0.003;
const MAX_PIP_AREA_RATIO = 0.20;

/**
 * Detect dice color from HSV values
 */
export function detectDiceColor(
  hsvMat: Mat,
  calibration: CalibrationData
): { color: DiceColor; confidence: number } | null {
  const results: { color: DiceColor; count: number }[] = [];
  
  for (const color of DICE_COLORS) {
    const range = calibration.diceColors[color];
    const mask = new cv.Mat();
    
    // Handle red hue wrap-around (0-10 and 170-180)
    if (color === 'red') {
      const mask1 = new cv.Mat();
      const mask2 = new cv.Mat();
      
      cv.inRange(
        hsvMat,
        new cv.Scalar(0, range.sMin, range.vMin),
        new cv.Scalar(10, range.sMax, range.vMax),
        mask1
      );
      cv.inRange(
        hsvMat,
        new cv.Scalar(170, range.sMin, range.vMin),
        new cv.Scalar(180, range.sMax, range.vMax),
        mask2
      );
      cv.bitwise_or(mask1, mask2, mask);
      
      mask1.delete();
      mask2.delete();
    } else {
      cv.inRange(
        hsvMat,
        new cv.Scalar(range.hMin, range.sMin, range.vMin),
        new cv.Scalar(range.hMax, range.sMax, range.vMax),
        mask
      );
    }
    
    // Count non-zero pixels
    let count = 0;
    const data = mask.data;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0) count++;
    }
    
    results.push({ color, count });
    mask.delete();
  }
  
  // Find the color with the most matching pixels
  results.sort((a, b) => b.count - a.count);
  
  if (results[0].count === 0) return null;
  
  const totalPixels = hsvMat.rows * hsvMat.cols;
  const confidence = results[0].count / totalPixels;
  
  // Require at least 20% of pixels to match
  if (confidence < 0.2) return null;
  
  return { color: results[0].color, confidence };
}

/**
 * Count pips (white dots) on a die face
 * Uses HSV to find white/gray blobs (low saturation) on colored dice (high saturation)
 */
export function countPips(dieMat: Mat): number {
  // Convert to HSV - pips are WHITE (low saturation, high value)
  const rgb = new cv.Mat();
  cv.cvtColor(dieMat, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  
  // Find white/gray regions: low saturation (< 60) and high value (> 150)
  // This finds the white pips regardless of the die's background color
  const whiteMask = new cv.Mat();
  const lower = cv.matFromArray(1, 3, cv.CV_8U, [0, 0, 150]);   // Any hue, low sat, high val
  const upper = cv.matFromArray(1, 3, cv.CV_8U, [180, 60, 255]); // Any hue, low sat, max val
  cv.inRange(hsv, lower, upper, whiteMask);
  lower.delete();
  upper.delete();
  
  // Morphological operations to clean up
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  cv.morphologyEx(whiteMask, whiteMask, cv.MORPH_OPEN, kernel);
  cv.morphologyEx(whiteMask, whiteMask, cv.MORPH_CLOSE, kernel);
  
  // Find contours (potential pips)
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(whiteMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  // Filter contours by area and shape
  const dieArea = dieMat.rows * dieMat.cols;
  const minPipArea = dieArea * MIN_PIP_AREA_RATIO;
  const maxPipArea = dieArea * MAX_PIP_AREA_RATIO;
  
  let pipCount = 0;
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    
    if (area >= minPipArea && area <= maxPipArea) {
      // Check if roughly circular (pips are round)
      const rect = cv.boundingRect(contour);
      const aspectRatio = rect.width / rect.height;
      
      // Pips should be roughly square (aspect ratio close to 1)
      if (aspectRatio > 0.5 && aspectRatio < 2.0) {
        pipCount++;
      }
    }
  }
  
  // Clean up
  rgb.delete();
  hsv.delete();
  whiteMask.delete();
  kernel.delete();
  contours.delete();
  hierarchy.delete();
  
  // Clamp to valid die values (but return 0 if truly none found)
  return Math.min(6, pipCount);
}

/**
 * Detect all dice in an image region
 */
export function detectDiceInRegion(
  imageMat: Mat,
  calibration: CalibrationData,
  regionBounds?: Rect
): DetectedDie[] {
  const result = detectDiceWithDebug(imageMat, calibration, regionBounds);
  return result.dice;
}

/**
 * Detect all dice with full debug information
 */
export function detectDiceWithDebug(
  imageMat: Mat,
  calibration: CalibrationData,
  regionBounds?: Rect
): { dice: DetectedDie[]; debugInfo: DetectionDebugInfo } {
  const detected: DetectedDie[] = [];
  const candidates: DebugCandidate[] = [];
  const colorRegionCounts: Record<DiceColor, number> = {
    red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0
  };
  
  // Get the region to process
  let region: Mat;
  if (regionBounds) {
    region = imageMat.roi(regionBounds);
  } else {
    region = imageMat;
  }
  
  const imageArea = region.rows * region.cols;
  const minArea = imageArea * MIN_DIE_AREA_RATIO;
  const maxArea = imageArea * MAX_DIE_AREA_RATIO;
  
  // Convert to HSV for color detection
  const rgb = new cv.Mat();
  cv.cvtColor(region, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  
  // Sample HSV at center of image for debugging
  let hsvSampleCenter: { h: number; s: number; v: number } | undefined;
  try {
    const centerY = Math.floor(region.rows / 2);
    const centerX = Math.floor(region.cols / 2);
    const pixel = hsv.ucharPtr(centerY, centerX);
    hsvSampleCenter = { h: pixel[0], s: pixel[1], v: pixel[2] };
  } catch (e) {
    // Ignore sampling errors
  }
  
  // For each dice color, find regions
  for (const color of DICE_COLORS) {
    const range = calibration.diceColors[color];
    const mask = new cv.Mat();
    
    // Handle red hue wrap-around
    if (color === 'red') {
      const mask1 = new cv.Mat();
      const mask2 = new cv.Mat();
      
      // OpenCV.js requires Mat for lower/upper bounds
      const lower1 = cv.matFromArray(1, 3, cv.CV_8U, [0, range.sMin, range.vMin]);
      const upper1 = cv.matFromArray(1, 3, cv.CV_8U, [10, range.sMax, range.vMax]);
      const lower2 = cv.matFromArray(1, 3, cv.CV_8U, [170, range.sMin, range.vMin]);
      const upper2 = cv.matFromArray(1, 3, cv.CV_8U, [180, range.sMax, range.vMax]);
      
      cv.inRange(hsv, lower1, upper1, mask1);
      cv.inRange(hsv, lower2, upper2, mask2);
      cv.bitwise_or(mask1, mask2, mask);
      
      lower1.delete();
      upper1.delete();
      lower2.delete();
      upper2.delete();
      mask1.delete();
      mask2.delete();
    } else {
      const lower = cv.matFromArray(1, 3, cv.CV_8U, [range.hMin, range.sMin, range.vMin]);
      const upper = cv.matFromArray(1, 3, cv.CV_8U, [range.hMax, range.sMax, range.vMax]);
      
      cv.inRange(hsv, lower, upper, mask);
      
      lower.delete();
      upper.delete();
    }
    
    // Morphological cleanup
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    
    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    // Track how many regions found for this color
    colorRegionCounts[color] = contours.size();
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const rect = cv.boundingRect(contour);
      const aspectRatio = rect.width / rect.height;
      
      const bounds = {
        x: rect.x + (regionBounds?.x || 0),
        y: rect.y + (regionBounds?.y || 0),
        width: rect.width,
        height: rect.height
      };
      
      // Determine if accepted or rejected and why
      let accepted = false;
      let rejectionReason: DebugCandidate['rejectionReason'];
      
      if (area < minArea) {
        rejectionReason = 'too_small';
      } else if (area > maxArea) {
        rejectionReason = 'too_large';
      } else if (aspectRatio <= 0.6 || aspectRatio >= 1.7) {
        rejectionReason = 'aspect_ratio';
      } else {
        accepted = true;
        
        // Extract die region and count pips
        const dieRegion = region.roi(rect);
        const pips = countPips(dieRegion);
        
        detected.push({
          color,
          pips,
          confidence: area / (rect.width * rect.height),
          bounds
        });
        
        dieRegion.delete();
      }
      
      // Add to candidates list (all regions, accepted or not)
      candidates.push({
        color,
        bounds,
        area,
        aspectRatio,
        accepted,
        rejectionReason
      });
    }
    
    mask.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
  
  // Clean up
  rgb.delete();
  hsv.delete();
  if (regionBounds) {
    region.delete();
  }
  
  // Remove duplicate detections
  const filteredDice = removeDuplicateDetections(detected);
  
  // Mark duplicates in candidates
  for (let i = 0; i < candidates.length; i++) {
    if (!candidates[i].accepted) continue;
    
    const isDuplicate = !filteredDice.some(d => 
      d.bounds.x === candidates[i].bounds.x && 
      d.bounds.y === candidates[i].bounds.y
    );
    
    if (isDuplicate) {
      candidates[i].accepted = false;
      candidates[i].rejectionReason = 'duplicate';
    }
  }
  
  const debugInfo: DetectionDebugInfo = {
    imageWidth: region.cols,
    imageHeight: region.rows,
    minAreaThreshold: minArea,
    maxAreaThreshold: maxArea,
    candidates,
    colorRegionCounts,
    hsvSampleCenter
  };
  
  return { dice: filteredDice, debugInfo };
}

/**
 * Remove overlapping detections (same die detected by multiple colors)
 */
function removeDuplicateDetections(dice: DetectedDie[]): DetectedDie[] {
  const filtered: DetectedDie[] = [];
  
  for (const die of dice) {
    let isDuplicate = false;
    
    for (const existing of filtered) {
      const overlap = calculateOverlap(die.bounds, existing.bounds);
      if (overlap > 0.5) {
        // Keep the one with higher confidence
        if (die.confidence > existing.confidence) {
          const idx = filtered.indexOf(existing);
          filtered[idx] = die;
        }
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      filtered.push(die);
    }
  }
  
  return filtered;
}

/**
 * Calculate overlap ratio between two rectangles
 */
function calculateOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  
  if (x2 < x1 || y2 < y1) return 0;
  
  const intersectionArea = (x2 - x1) * (y2 - y1);
  const aArea = a.width * a.height;
  const bArea = b.width * b.height;
  const unionArea = aArea + bArea - intersectionArea;
  
  return intersectionArea / unionArea;
}

/**
 * Group dice into blocks based on spatial clustering
 */
export function groupDiceIntoBlocks(dice: DetectedDie[]): DetectedBlock[] {
  if (dice.length === 0) return [];
  
  // Use hierarchical clustering to group nearby dice
  const blocks: DetectedBlock[] = [];
  const used = new Set<number>();
  
  // Sort dice by x position
  const sortedDice = [...dice].sort((a, b) => a.bounds.x - b.bounds.x);
  
  // Average die size for distance threshold
  const avgDieSize = dice.reduce((sum, d) => sum + (d.bounds.width + d.bounds.height) / 2, 0) / dice.length;
  const clusterThreshold = avgDieSize * 2.5; // Dice in same block should be within ~2.5 die widths
  
  for (let i = 0; i < sortedDice.length; i++) {
    if (used.has(i)) continue;
    
    const cluster: DetectedDie[] = [sortedDice[i]];
    used.add(i);
    
    // Find all nearby dice
    for (let j = i + 1; j < sortedDice.length; j++) {
      if (used.has(j)) continue;
      
      // Check if this die is close to any die in the cluster
      const dieJ = sortedDice[j];
      let isNearby = false;
      
      for (const clusterDie of cluster) {
        const dist = Math.sqrt(
          Math.pow(dieJ.bounds.x - clusterDie.bounds.x, 2) +
          Math.pow(dieJ.bounds.y - clusterDie.bounds.y, 2)
        );
        
        if (dist < clusterThreshold) {
          isNearby = true;
          break;
        }
      }
      
      if (isNearby) {
        cluster.push(dieJ);
        used.add(j);
      }
    }
    
    // Only create block if we have 9 dice (3x3 grid)
    // Be lenient: accept 7-11 dice in case of detection errors
    if (cluster.length >= 7 && cluster.length <= 11) {
      // Calculate block center
      const centerX = cluster.reduce((sum, d) => sum + d.bounds.x + d.bounds.width / 2, 0) / cluster.length;
      const centerY = cluster.reduce((sum, d) => sum + d.bounds.y + d.bounds.height / 2, 0) / cluster.length;
      
      // Calculate total
      const total = cluster.reduce((sum, d) => sum + d.pips, 0);
      
      blocks.push({
        id: `block-${blocks.length}`,
        dice: cluster,
        total,
        trayColor: '#888888', // Will be detected separately if needed
        position: { x: centerX, y: centerY },
        column: 0 // Will be computed later
      });
    }
  }
  
  return blocks;
}

/**
 * Auto-calibrate from a "Color Key" of 6 dice showing pips 1-6
 * Pip count determines color: 1=Red, 2=Orange, 3=Yellow, 4=Green, 5=Blue, 6=Purple
 * 
 * This function:
 * 1. Detects all dice candidates using permissive settings
 * 2. Looks for 6 dice with unique pip counts {1,2,3,4,5,6} (any orientation!)
 * 3. The pip count identifies which color each die is
 * 4. Extracts HSV calibration from each die
 */
export function autoCalibrate(
  imageMat: Mat
): { calibration: CalibrationData; keyBounds: Rect[] } | null {
  // Convert to HSV
  const rgb = new cv.Mat();
  cv.cvtColor(imageMat, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  
  // First, find ALL potential die candidates with very permissive color detection
  // We look for anything colored (saturation > 30, value > 40)
  const colorMask = new cv.Mat();
  const lower = cv.matFromArray(1, 3, cv.CV_8U, [0, 30, 40]);
  const upper = cv.matFromArray(1, 3, cv.CV_8U, [180, 255, 255]);
  cv.inRange(hsv, lower, upper, colorMask);
  lower.delete();
  upper.delete();
  
  // Morphological cleanup
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  cv.morphologyEx(colorMask, colorMask, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(colorMask, colorMask, cv.MORPH_OPEN, kernel);
  kernel.delete();
  
  // Find contours
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(colorMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  colorMask.delete();
  
  const imageArea = imageMat.rows * imageMat.cols;
  const minArea = imageArea * 0.001;  // Reasonable minimum
  const maxArea = imageArea * 0.06;   // Reasonable maximum
  
  // Collect all candidate dice with pip counts
  interface DieCandidate {
    bounds: Rect;
    pips: number;
    centerX: number;
    centerY: number;
    size: number;
  }
  
  const candidates: DieCandidate[] = [];
  
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    
    if (area >= minArea && area <= maxArea) {
      const rect = cv.boundingRect(contour);
      const aspectRatio = rect.width / rect.height;
      
      // Dice should be roughly square
      if (aspectRatio > 0.6 && aspectRatio < 1.7) {
        const dieRegion = imageMat.roi(rect);
        const pips = countPips(dieRegion);
        dieRegion.delete();
        
        candidates.push({
          bounds: rect,
          pips,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2,
          size: (rect.width + rect.height) / 2
        });
      }
    }
  }
  
  contours.delete();
  hierarchy.delete();
  
  console.log(`Auto-calibrate: Found ${candidates.length} die candidates`);
  console.log(`Pip counts: ${candidates.map(c => c.pips).join(', ')}`);
  
  // Group candidates with pips 1-6 (the Color Key pattern)
  // We need exactly one die with each pip count from 1 to 6
  const byPips: Map<number, DieCandidate[]> = new Map();
  for (const c of candidates) {
    if (c.pips >= 1 && c.pips <= 6) {
      if (!byPips.has(c.pips)) {
        byPips.set(c.pips, []);
      }
      byPips.get(c.pips)!.push(c);
    }
  }
  
  // Check if we have at least one candidate for each pip count 1-6
  const hasAllPips = [1, 2, 3, 4, 5, 6].every(p => byPips.has(p) && byPips.get(p)!.length > 0);
  
  if (!hasAllPips) {
    console.log('Auto-calibrate: Missing some pip counts for Color Key');
    console.log(`Have pips: ${[...byPips.keys()].sort().join(', ')}`);
    rgb.delete();
    hsv.delete();
    return null;
  }
  
  // Find the best set of 6 dice (one for each pip count) that are:
  // 1. Similar in size (part of the same Key)
  // 2. Reasonably grouped together
  
  // For simplicity, try to find 6 dice that are close to each other
  // Take the first candidate for each pip count and check if they form a group
  let bestKeyDice: DieCandidate[] | null = null;
  let bestScore = Infinity;
  
  // Generate combinations (take first few candidates for each pip)
  const maxPerPip = 3;
  const options: DieCandidate[][] = [1, 2, 3, 4, 5, 6].map(p => 
    byPips.get(p)!.slice(0, maxPerPip)
  );
  
  // Try combinations to find 6 dice that are grouped together
  function* combinations(arrays: DieCandidate[][], current: DieCandidate[] = []): Generator<DieCandidate[]> {
    if (current.length === arrays.length) {
      yield current;
      return;
    }
    for (const item of arrays[current.length]) {
      yield* combinations(arrays, [...current, item]);
    }
  }
  
  for (const combo of combinations(options)) {
    // Calculate how "grouped" these 6 dice are
    const avgX = combo.reduce((sum, c) => sum + c.centerX, 0) / 6;
    const avgY = combo.reduce((sum, c) => sum + c.centerY, 0) / 6;
    const avgSize = combo.reduce((sum, c) => sum + c.size, 0) / 6;
    
    // Score based on spread (lower is better - more grouped)
    const spreadScore = combo.reduce((sum, c) => 
      sum + Math.sqrt(Math.pow(c.centerX - avgX, 2) + Math.pow(c.centerY - avgY, 2)), 0
    );
    
    // Score based on size consistency (lower is better - more uniform)
    const sizeVariance = combo.reduce((sum, c) => sum + Math.pow(c.size - avgSize, 2), 0) / 6;
    const sizeScore = Math.sqrt(sizeVariance);
    
    // Combined score (weighted)
    const score = spreadScore + sizeScore * 10;
    
    if (score < bestScore) {
      bestScore = score;
      bestKeyDice = combo;
    }
  }
  
  if (!bestKeyDice) {
    console.log('Auto-calibrate: Could not find valid Color Key combination');
    rgb.delete();
    hsv.delete();
    return null;
  }
  
  console.log('Auto-calibrate: Found Color Key! Extracting colors...');
  
  // Build calibration from the key dice
  // Pip count determines color: 1=Red, 2=Orange, 3=Yellow, 4=Green, 5=Blue, 6=Purple
  const pipToColor: Record<number, DiceColor> = {
    1: 'red',
    2: 'orange', 
    3: 'yellow',
    4: 'green',
    5: 'blue',
    6: 'purple'
  };
  
  const calibration: CalibrationData = {
    diceColors: {
      red: { hMin: 0, hMax: 15, sMin: 50, sMax: 255, vMin: 50, vMax: 255 },
      orange: { hMin: 8, hMax: 30, sMin: 50, sMax: 255, vMin: 50, vMax: 255 },
      yellow: { hMin: 20, hMax: 50, sMin: 40, sMax: 255, vMin: 80, vMax: 255 },
      green: { hMin: 35, hMax: 90, sMin: 30, sMax: 255, vMin: 40, vMax: 255 },
      blue: { hMin: 85, hMax: 140, sMin: 30, sMax: 255, vMin: 40, vMax: 255 },
      purple: { hMin: 120, hMax: 175, sMin: 30, sMax: 255, vMin: 40, vMax: 255 }
    },
    trayColors: [],
    isCalibrated: true,
    calibratedAt: Date.now()
  };
  
  const keyBounds: Rect[] = [];
  
  for (const die of bestKeyDice) {
    const color = pipToColor[die.pips];
    const rect = die.bounds;
    keyBounds.push(rect);
    
    // Sample HSV values from this die (avoiding the white pips)
    const roi = hsv.roi(rect);
    const hValues: number[] = [];
    const sValues: number[] = [];
    const vValues: number[] = [];
    
    // Sample center region (inner 50%) and only high-saturation pixels (the colored die, not white pips)
    const margin = Math.floor(rect.width * 0.2);
    for (let y = margin; y < roi.rows - margin; y++) {
      for (let x = margin; x < roi.cols - margin; x++) {
        const pixel = roi.ucharPtr(y, x);
        const s = pixel[1];
        // Only sample colored pixels (saturation > 50), skip white pips
        if (s > 50) {
          hValues.push(pixel[0]);
          sValues.push(pixel[1]);
          vValues.push(pixel[2]);
        }
      }
    }
    roi.delete();
    
    if (hValues.length > 0) {
      // Calculate mean and std dev
      const hMean = hValues.reduce((a, b) => a + b, 0) / hValues.length;
      const sMean = sValues.reduce((a, b) => a + b, 0) / sValues.length;
      const vMean = vValues.reduce((a, b) => a + b, 0) / vValues.length;
      
      const hStd = Math.sqrt(hValues.reduce((sum, v) => sum + Math.pow(v - hMean, 2), 0) / hValues.length);
      const sStd = Math.sqrt(sValues.reduce((sum, v) => sum + Math.pow(v - sMean, 2), 0) / sValues.length);
      const vStd = Math.sqrt(vValues.reduce((sum, v) => sum + Math.pow(v - vMean, 2), 0) / vValues.length);
      
      // Use 3 std deviations for tolerance (more permissive)
      calibration.diceColors[color] = {
        hMin: Math.max(0, Math.floor(hMean - 3 * Math.max(hStd, 8))),
        hMax: Math.min(180, Math.ceil(hMean + 3 * Math.max(hStd, 8))),
        sMin: Math.max(30, Math.floor(sMean - 3 * Math.max(sStd, 20))),
        sMax: Math.min(255, Math.ceil(sMean + 3 * Math.max(sStd, 20))),
        vMin: Math.max(30, Math.floor(vMean - 3 * Math.max(vStd, 20))),
        vMax: 255
      };
      
      console.log(`Calibrated ${color} (${die.pips} pips): H=${hMean.toFixed(1)}±${hStd.toFixed(1)}, S=${sMean.toFixed(1)}, V=${vMean.toFixed(1)}`);
    }
  }
  
  rgb.delete();
  hsv.delete();
  
  return { calibration, keyBounds };
}

/**
 * Detect dice with auto-calibration from color key
 * This is the main entry point that:
 * 1. Tries to find and use the color key for calibration
 * 2. Falls back to provided calibration if no key found
 * 3. Returns detected dice and debug info
 */
export function detectDiceWithAutoCalibration(
  imageMat: Mat,
  fallbackCalibration: CalibrationData
): { dice: DetectedDie[]; debugInfo: DetectionDebugInfo; calibrationUsed: CalibrationData; keyFound: boolean; keyBounds: Rect[] } {
  // Try auto-calibration first
  const autoResult = autoCalibrate(imageMat);
  
  let calibration: CalibrationData;
  let keyFound = false;
  let keyBounds: Rect[] = [];
  
  if (autoResult) {
    calibration = autoResult.calibration;
    keyFound = true;
    keyBounds = autoResult.keyBounds;
    console.log('Using auto-calibrated colors from color key');
  } else {
    calibration = fallbackCalibration;
    console.log('Color key not found, using fallback calibration');
  }
  
  // Now detect dice with the calibration
  const { dice, debugInfo } = detectDiceWithDebug(imageMat, calibration);
  
  // Filter out the color key dice from detection results
  const filteredDice = keyFound 
    ? dice.filter(die => !keyBounds.some(kb => 
        Math.abs(die.bounds.x - kb.x) < 10 && Math.abs(die.bounds.y - kb.y) < 10
      ))
    : dice;
  
  return { 
    dice: filteredDice, 
    debugInfo, 
    calibrationUsed: calibration, 
    keyFound,
    keyBounds 
  };
}

/**
 * Calibrate color detection from a reference image (legacy)
 */
export function calibrateFromImage(
  imageMat: Mat,
  colorRegions: { color: DiceColor; region: Rect }[]
): Partial<Record<DiceColor, HSVRange>> {
  const calibration: Partial<Record<DiceColor, HSVRange>> = {};
  
  // Convert to HSV
  const rgb = new cv.Mat();
  cv.cvtColor(imageMat, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  
  for (const { color, region } of colorRegions) {
    const roi = hsv.roi(region);
    
    // Collect HSV values
    const hValues: number[] = [];
    const sValues: number[] = [];
    const vValues: number[] = [];
    
    for (let y = 0; y < roi.rows; y++) {
      for (let x = 0; x < roi.cols; x++) {
        const pixel = roi.ucharPtr(y, x);
        hValues.push(pixel[0]);
        sValues.push(pixel[1]);
        vValues.push(pixel[2]);
      }
    }
    
    // Calculate mean and standard deviation
    const hMean = hValues.reduce((a, b) => a + b, 0) / hValues.length;
    const sMean = sValues.reduce((a, b) => a + b, 0) / sValues.length;
    const vMean = vValues.reduce((a, b) => a + b, 0) / vValues.length;
    
    const hStd = Math.sqrt(hValues.reduce((sum, v) => sum + Math.pow(v - hMean, 2), 0) / hValues.length);
    const sStd = Math.sqrt(sValues.reduce((sum, v) => sum + Math.pow(v - sMean, 2), 0) / sValues.length);
    const vStd = Math.sqrt(vValues.reduce((sum, v) => sum + Math.pow(v - vMean, 2), 0) / vValues.length);
    
    // Set range as mean ± 2 standard deviations
    calibration[color] = {
      hMin: Math.max(0, Math.floor(hMean - 2 * hStd)),
      hMax: Math.min(180, Math.ceil(hMean + 2 * hStd)),
      sMin: Math.max(0, Math.floor(sMean - 2 * sStd)),
      sMax: Math.min(255, Math.ceil(sMean + 2 * sStd)),
      vMin: Math.max(0, Math.floor(vMean - 2 * vStd)),
      vMax: 255 // Keep max brightness high
    };
    
    roi.delete();
  }
  
  rgb.delete();
  hsv.delete();
  
  return calibration;
}
