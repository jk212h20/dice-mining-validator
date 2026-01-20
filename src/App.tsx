import { useState, useEffect, useCallback } from 'react';
import { waitForOpenCV, isOpenCVReady } from './vision/opencv';
import { detectDiceInRegion, groupDiceIntoBlocks } from './vision/diceDetector';
import { validateBlocks } from './validation/gameRules';
import {
  AppScreen,
  CalibrationData,
  DEFAULT_CALIBRATION,
  DetectedBlock,
  ValidationResult,
  DiceColor,
  DICE_COLORS,
  COLOR_HEX
} from './types';
import CameraCapture from './components/CameraCapture';
import ColorCalibration from './components/ColorCalibration';
import BlockReview from './components/BlockReview';
import ValidationResults from './components/ValidationResults';

function App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [cvReady, setCvReady] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationData>(DEFAULT_CALIBRATION);
  const [capturedImage, setCapturedImage] = useState<ImageData | null>(null);
  const [detectedBlocks, setDetectedBlocks] = useState<DetectedBlock[]>([]);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [difficulty, setDifficulty] = useState(25);
  const [error, setError] = useState<string | null>(null);

  // Load OpenCV
  useEffect(() => {
    waitForOpenCV().then(() => {
      setCvReady(true);
      console.log('OpenCV.js loaded successfully');
    });
  }, []);

  // Load calibration from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('diceCalibration');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCalibration(parsed);
      } catch (e) {
        console.error('Failed to load calibration:', e);
      }
    }
  }, []);

  // Save calibration to localStorage
  const saveCalibration = useCallback((cal: CalibrationData) => {
    setCalibration(cal);
    localStorage.setItem('diceCalibration', JSON.stringify(cal));
  }, []);

  // Handle image capture
  const handleCapture = useCallback((imageData: ImageData) => {
    setCapturedImage(imageData);
    setError(null);

    if (!isOpenCVReady()) {
      setError('OpenCV is not ready yet. Please wait...');
      return;
    }

    try {
      // Convert ImageData to OpenCV Mat
      const mat = cv.matFromImageData(imageData);

      // Detect dice
      const dice = detectDiceInRegion(mat, calibration);
      console.log('Detected dice:', dice.length);

      // Group into blocks
      const blocks = groupDiceIntoBlocks(dice);
      console.log('Detected blocks:', blocks.length);

      mat.delete();

      if (blocks.length === 0) {
        setError('No blocks detected. Try adjusting the camera angle or calibrating colors.');
        return;
      }

      setDetectedBlocks(blocks);
      setScreen('review');
    } catch (e) {
      console.error('Detection error:', e);
      setError('Failed to detect dice. Please try again.');
    }
  }, [calibration]);

  // Handle calibration complete
  const handleCalibrationComplete = useCallback((newCalibration: Partial<Record<DiceColor, any>>) => {
    const updatedCalibration: CalibrationData = {
      ...calibration,
      diceColors: {
        ...calibration.diceColors,
        ...newCalibration
      },
      isCalibrated: true,
      calibratedAt: Date.now()
    };
    saveCalibration(updatedCalibration);
    setScreen('home');
  }, [calibration, saveCalibration]);

  // Handle blocks confirmed
  const handleBlocksConfirmed = useCallback((blocks: DetectedBlock[]) => {
    const result = validateBlocks(blocks, difficulty);
    setValidationResult(result);
    setScreen('results');
  }, [difficulty]);

  // Reset to home
  const goHome = useCallback(() => {
    setScreen('home');
    setCapturedImage(null);
    setDetectedBlocks([]);
    setValidationResult(null);
    setError(null);
  }, []);

  // Render based on screen
  const renderScreen = () => {
    switch (screen) {
      case 'calibrate':
        return (
          <ColorCalibration
            onComplete={handleCalibrationComplete}
            onCancel={() => setScreen('home')}
            currentCalibration={calibration}
          />
        );

      case 'scan':
        return (
          <CameraCapture
            onCapture={handleCapture}
            onBack={() => setScreen('home')}
            error={error}
          />
        );

      case 'review':
        return (
          <BlockReview
            imageData={capturedImage!}
            blocks={detectedBlocks}
            onConfirm={handleBlocksConfirmed}
            onRescan={() => setScreen('scan')}
            onBack={goHome}
          />
        );

      case 'results':
        return (
          <ValidationResults
            result={validationResult!}
            onScanAgain={() => setScreen('scan')}
            onHome={goHome}
          />
        );

      default:
        return (
          <div className="home-screen">
            <header className="app-header">
              <h1>🎲 Dice Mining</h1>
              <h2>Validator</h2>
            </header>

            <div className="status-bar">
              <div className={`status-item ${cvReady ? 'ready' : 'loading'}`}>
                <span className="status-icon">{cvReady ? '✓' : '⏳'}</span>
                <span>OpenCV {cvReady ? 'Ready' : 'Loading...'}</span>
              </div>
              <div className={`status-item ${calibration.isCalibrated ? 'ready' : 'warning'}`}>
                <span className="status-icon">{calibration.isCalibrated ? '✓' : '⚠'}</span>
                <span>Colors {calibration.isCalibrated ? 'Calibrated' : 'Not Calibrated'}</span>
              </div>
            </div>

            <div className="difficulty-setting">
              <label>Difficulty Threshold:</label>
              <div className="difficulty-buttons">
                {[20, 25, 30, 35].map(d => (
                  <button
                    key={d}
                    className={difficulty === d ? 'active' : ''}
                    onClick={() => setDifficulty(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="color-preview">
              <h3>Dice Colors</h3>
              <div className="color-chips">
                {DICE_COLORS.map(color => (
                  <div
                    key={color}
                    className="color-chip"
                    style={{ backgroundColor: COLOR_HEX[color] }}
                    title={`${color} (value ${DICE_COLORS.indexOf(color) + 1})`}
                  >
                    {DICE_COLORS.indexOf(color) + 1}
                  </div>
                ))}
              </div>
            </div>

            <div className="action-buttons">
              <button
                className="btn-primary"
                onClick={() => setScreen('scan')}
                disabled={!cvReady}
              >
                📷 Scan Table
              </button>
              <button
                className="btn-secondary"
                onClick={() => setScreen('calibrate')}
              >
                🎨 Calibrate Colors
              </button>
            </div>

            <footer className="app-footer">
              <p>Point camera at the table after a round to validate blocks</p>
            </footer>
          </div>
        );
    }
  };

  return (
    <div className="app">
      {renderScreen()}
    </div>
  );
}

export default App;
