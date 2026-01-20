# Dice Mining Validator

A mobile web app that uses your phone's camera to scan and validate a physical Dice Mining game board after a round.

## Features

- 📷 **Camera Scanning**: Capture photos of your game table using your phone's camera
- 🎨 **Color Calibration**: Calibrate the app to your specific dice colors and lighting conditions
- 🎲 **Automatic Detection**: Detects dice colors and pip counts using OpenCV.js
- ✓ **Blockchain Validation**: Validates the entire blockchain structure:
  - Checks dice colors match predecessor requirements
  - Verifies totals are under difficulty threshold
  - Identifies the longest valid chain
- 📊 **Visual Results**: Clear display of valid/invalid blocks with detailed error messages

## Game Rules Summary

Dice Mining uses colored dice where the color corresponds to a value:
- 🔴 Red = 1
- 🟠 Orange = 2
- 🟡 Yellow = 3
- 🟢 Green = 4
- 🔵 Blue = 5
- 🟣 Purple = 6

Each block contains 9 dice in a 3x3 tray. The **values** rolled in one block determine the **colors** required for the next block. Blocks form a blockchain, and the total of each block must be ≤ the difficulty threshold.

## Getting Started

### Prerequisites

- Node.js 18+ 
- A mobile device with camera access (or desktop with webcam)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5174`. Access it from your phone using your computer's local IP address.

### Build

```bash
npm run build
```

## Usage

1. **Calibrate Colors** (optional but recommended): 
   - Tap "Calibrate Colors"
   - Point your camera at one die of each color
   - This helps the app accurately detect colors in your lighting

2. **Set Difficulty**: Choose the difficulty threshold (20, 25, 30, or 35)

3. **Scan Table**: 
   - Arrange your dice blocks in their chain/tree structure
   - Tap "Scan Table" and capture a photo
   - The app will detect all dice and group them into blocks

4. **Review**: 
   - Check the detected dice and make corrections if needed
   - Tap individual dice to change their color or pip count

5. **Validate**: 
   - View the validation results
   - See which blocks are valid/invalid and why
   - Identify the longest valid chain

## Technology

- React + TypeScript
- Vite
- OpenCV.js for computer vision
- Pure CSS (no framework dependencies)

## How Detection Works

1. **Color Calibration**: Captures HSV color ranges for each dice color
2. **Color Segmentation**: Uses HSV thresholding to find dice by color
3. **Contour Detection**: Finds rectangular dice shapes
4. **Pip Counting**: Detects white dots on each die face using blob detection
5. **Block Grouping**: Clusters nearby dice into 3x3 blocks
6. **Chain Building**: Matches dice colors to predecessor values to build the blockchain

## License

MIT
