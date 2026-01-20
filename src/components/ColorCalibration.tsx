import { useRef, useState, useEffect, useCallback } from 'react';
import { DiceColor, DICE_COLORS, COLOR_HEX, CalibrationData, HSVRange } from '../types';
import { calibrateFromImage } from '../vision/diceDetector';
import { isOpenCVReady } from '../vision/opencv';

interface ColorCalibrationProps {
  onComplete: (calibration: Partial<Record<DiceColor, HSVRange>>) => void;
  onCancel: () => void;
  currentCalibration: CalibrationData;
}

export default function ColorCalibration({ onComplete, onCancel }: ColorCalibrationProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentColorIndex, setCurrentColorIndex] = useState(0);
  const [calibratedColors, setCalibratedColors] = useState<Partial<Record<DiceColor, HSVRange>>>({});
  const [isCapturing, setIsCapturing] = useState(false);
  const [message, setMessage] = useState<string>('');

  const currentColor = DICE_COLORS[currentColorIndex];

  // Initialize camera
  useEffect(() => {
    async function initCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        setStream(mediaStream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Camera error:', err);
        setMessage('Unable to access camera');
      }
    }

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, []);

  // Capture and calibrate current color
  const captureColor = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isOpenCVReady()) {
      setMessage('Not ready. Please wait...');
      return;
    }

    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    // Set canvas to a small central region
    const captureSize = 100;
    canvas.width = captureSize;
    canvas.height = captureSize;

    // Capture center region of video
    const sx = (video.videoWidth - captureSize) / 2;
    const sy = (video.videoHeight - captureSize) / 2;
    ctx.drawImage(video, sx, sy, captureSize, captureSize, 0, 0, captureSize, captureSize);

    // Get image data
    const imageData = ctx.getImageData(0, 0, captureSize, captureSize);
    const mat = cv.matFromImageData(imageData);

    // Calibrate this color
    const region = { x: 0, y: 0, width: captureSize, height: captureSize };
    const result = calibrateFromImage(mat, [{ color: currentColor, region }]);

    mat.delete();

    if (result[currentColor]) {
      setCalibratedColors(prev => ({
        ...prev,
        [currentColor]: result[currentColor]
      }));
      setMessage(`✓ ${currentColor} captured!`);

      // Move to next color after short delay
      setTimeout(() => {
        if (currentColorIndex < DICE_COLORS.length - 1) {
          setCurrentColorIndex(currentColorIndex + 1);
          setMessage('');
        }
        setIsCapturing(false);
      }, 500);
    } else {
      setMessage('Failed to capture color. Try again.');
      setIsCapturing(false);
    }
  }, [currentColor, currentColorIndex]);

  // Skip current color (use default)
  const skipColor = useCallback(() => {
    if (currentColorIndex < DICE_COLORS.length - 1) {
      setCurrentColorIndex(currentColorIndex + 1);
      setMessage('');
    }
  }, [currentColorIndex]);

  // Complete calibration
  const handleComplete = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    }
    onComplete(calibratedColors);
  }, [stream, calibratedColors, onComplete]);

  // Cancel and go back
  const handleCancel = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    }
    onCancel();
  }, [stream, onCancel]);

  const calibratedCount = Object.keys(calibratedColors).length;
  const isComplete = calibratedCount === DICE_COLORS.length;

  return (
    <div className="calibration-screen">
      <div className="calibration-header">
        <button className="btn-icon" onClick={handleCancel}>
          ←
        </button>
        <h2>Color Calibration</h2>
        <span className="progress-text">{calibratedCount}/{DICE_COLORS.length}</span>
      </div>

      <div className="calibration-instructions">
        <p>Hold a <strong style={{ color: COLOR_HEX[currentColor] }}>{currentColor}</strong> die in the center of the frame</p>
      </div>

      <div className="camera-container calibration">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-video"
        />
        
        <div className="calibration-target">
          <div 
            className="target-box"
            style={{ borderColor: COLOR_HEX[currentColor] }}
          />
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {message && (
        <div className={`calibration-message ${message.startsWith('✓') ? 'success' : ''}`}>
          {message}
        </div>
      )}

      <div className="color-progress">
        {DICE_COLORS.map((color, index) => (
          <div
            key={color}
            className={`color-dot ${calibratedColors[color] ? 'done' : ''} ${index === currentColorIndex ? 'current' : ''}`}
            style={{ backgroundColor: COLOR_HEX[color] }}
          />
        ))}
      </div>

      <div className="calibration-controls">
        {!isComplete ? (
          <>
            <button
              className="btn-primary"
              onClick={captureColor}
              disabled={isCapturing || !stream}
            >
              📷 Capture {currentColor}
            </button>
            <button
              className="btn-secondary"
              onClick={skipColor}
              disabled={currentColorIndex >= DICE_COLORS.length - 1}
            >
              Skip (use default)
            </button>
          </>
        ) : (
          <button className="btn-primary" onClick={handleComplete}>
            ✓ Save Calibration
          </button>
        )}
      </div>

      <div className="calibration-tips">
        <p>Tips for best results:</p>
        <ul>
          <li>Use consistent lighting</li>
          <li>Fill the target box with the die color</li>
          <li>Avoid shadows and reflections</li>
        </ul>
      </div>
    </div>
  );
}
