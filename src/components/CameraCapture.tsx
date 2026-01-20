import { useRef, useState, useEffect, useCallback } from 'react';

interface CameraCaptureProps {
  onCapture: (imageData: ImageData) => void;
  onBack: () => void;
  error: string | null;
}

export default function CameraCapture({ onCapture, onBack, error }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Initialize camera
  useEffect(() => {
    async function initCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        });
        
        setStream(mediaStream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Camera error:', err);
        setCameraError('Unable to access camera. Please grant camera permissions.');
      }
    }

    initCamera();

    // Cleanup
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Flash effect
    setTimeout(() => {
      setIsCapturing(false);
      onCapture(imageData);
    }, 100);
  }, [onCapture]);

  // Handle back and cleanup
  const handleBack = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    onBack();
  }, [stream, onBack]);

  if (cameraError) {
    return (
      <div className="camera-screen error-screen">
        <div className="error-message">
          <span className="error-icon">📷</span>
          <p>{cameraError}</p>
        </div>
        <button className="btn-secondary" onClick={handleBack}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="camera-screen">
      <div className="camera-header">
        <button className="btn-icon" onClick={handleBack}>
          ←
        </button>
        <h2>Scan Table</h2>
        <div className="spacer" />
      </div>

      <div className={`camera-container ${isCapturing ? 'flash' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-video"
        />
        
        <div className="camera-overlay">
          <div className="overlay-guide">
            <p>Position dice blocks in frame</p>
          </div>
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      {error && (
        <div className="capture-error">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
        </div>
      )}

      <div className="camera-controls">
        <button
          className="capture-button"
          onClick={capturePhoto}
          disabled={!stream || isCapturing}
        >
          <span className="capture-icon">📸</span>
        </button>
      </div>

      <div className="camera-tips">
        <p>Tips:</p>
        <ul>
          <li>Hold phone steady and level</li>
          <li>Ensure good lighting</li>
          <li>Include all blocks in frame</li>
          <li>Keep dice arranged in clear 3x3 grids</li>
        </ul>
      </div>
    </div>
  );
}
