import { Mat, Rect } from './opencv';
import {
  DiceColor,
  DICE_COLORS,
  DetectedDie,
  DetectedBlock,
  CalibrationData,
  HSVRange
} from '../types';

// Minimum die area (percentage of image) to filter noise
const MIN_DIE_AREA_RATIO = 0.001;
const MAX_DIE_AREA_RATIO = 0.05;

// Minimum pip area relative to die size
const MIN_PIP_AREA_RATIO = 0.005;
const MAX_PIP_AREA_RATIO = 0.15;

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
 */
export function countPips(dieMat: Mat): number {
  // Convert to grayscale
  const gray = new cv.Mat();
  cv.cvtColor(dieMat, gray, cv.COLOR_RGBA2GRAY);
  
  // Apply Gaussian blur to reduce noise
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  
  // Threshold to find white pips (they're bright on colored background)
  const thresh = new cv.Mat();
  cv.threshold(blurred, thresh, 200, 255, cv.THRESH_BINARY);
  
  // Alternative: adaptive threshold for varying lighting
  // cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
  
  // Morphological operations to clean up
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  const morphed = new cv.Mat();
  cv.morphologyEx(thresh, morphed, cv.MORPH_OPEN, kernel);
  cv.morphologyEx(morphed, morphed, cv.MORPH_CLOSE, kernel);
  
  // Find contours (potential pips)
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  // Filter contours by area and circularity
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
  gray.delete();
  blurred.delete();
  thresh.delete();
  kernel.delete();
  morphed.delete();
  contours.delete();
  hierarchy.delete();
  
  // Clamp to valid die values
  return Math.max(1, Math.min(6, pipCount));
}

/**
 * Detect all dice in an image region
 */
export function detectDiceInRegion(
  imageMat: Mat,
  calibration: CalibrationData,
  regionBounds?: Rect
): DetectedDie[] {
  const detected: DetectedDie[] = [];
  
  // Get the region to process
  let region: Mat;
  if (regionBounds) {
    region = imageMat.roi(regionBounds);
  } else {
    region = imageMat;
  }
  
  // Convert to HSV for color detection
  const rgb = new cv.Mat();
  cv.cvtColor(region, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  
  // For each dice color, find regions
  for (const color of DICE_COLORS) {
    const range = calibration.diceColors[color];
    const mask = new cv.Mat();
    
    // Handle red hue wrap-around
    if (color === 'red') {
      const mask1 = new cv.Mat();
      const mask2 = new cv.Mat();
      
      cv.inRange(
        hsv,
        new cv.Scalar(0, range.sMin, range.vMin),
        new cv.Scalar(10, range.sMax, range.vMax),
        mask1
      );
      cv.inRange(
        hsv,
        new cv.Scalar(170, range.sMin, range.vMin),
        new cv.Scalar(180, range.sMax, range.vMax),
        mask2
      );
      cv.bitwise_or(mask1, mask2, mask);
      
      mask1.delete();
      mask2.delete();
    } else {
      cv.inRange(
        hsv,
        new cv.Scalar(range.hMin, range.sMin, range.vMin),
        new cv.Scalar(range.hMax, range.sMax, range.vMax),
        mask
      );
    }
    
    // Morphological cleanup
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    
    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    const imageArea = region.rows * region.cols;
    const minArea = imageArea * MIN_DIE_AREA_RATIO;
    const maxArea = imageArea * MAX_DIE_AREA_RATIO;
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      if (area >= minArea && area <= maxArea) {
        const rect = cv.boundingRect(contour);
        
        // Check aspect ratio (dice should be roughly square)
        const aspectRatio = rect.width / rect.height;
        if (aspectRatio > 0.6 && aspectRatio < 1.7) {
          // Extract die region and count pips
          const dieRegion = region.roi(rect);
          const pips = countPips(dieRegion);
          
          detected.push({
            color,
            pips,
            confidence: area / (rect.width * rect.height), // Fill ratio
            bounds: {
              x: rect.x + (regionBounds?.x || 0),
              y: rect.y + (regionBounds?.y || 0),
              width: rect.width,
              height: rect.height
            }
          });
          
          dieRegion.delete();
        }
      }
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
  
  // Remove duplicate detections (overlapping dice)
  return removeDuplicateDetections(detected);
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
 * Calibrate color detection from a reference image
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
