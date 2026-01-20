import { useState, useEffect, useRef, useCallback } from 'react';
import { DetectedBlock, DetectedDie, COLOR_HEX, DiceColor, DICE_COLORS } from '../types';

interface BlockReviewProps {
  imageData: ImageData;
  blocks: DetectedBlock[];
  onConfirm: (blocks: DetectedBlock[]) => void;
  onRescan: () => void;
  onBack: () => void;
}

export default function BlockReview({ imageData, blocks, onConfirm, onRescan, onBack }: BlockReviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [editedBlocks, setEditedBlocks] = useState<DetectedBlock[]>(blocks);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [selectedDieIndex, setSelectedDieIndex] = useState<number | null>(null);

  // Draw image with detection overlays
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = imageData.width;
    canvas.height = imageData.height;

    // Draw original image
    ctx.putImageData(imageData, 0, 0);

    // Draw block overlays
    editedBlocks.forEach((block, blockIndex) => {
      const isSelected = blockIndex === selectedBlockIndex;

      // Draw dice in block
      block.dice.forEach((die, dieIndex) => {
        const isSelectedDie = isSelected && dieIndex === selectedDieIndex;

        // Draw die bounding box
        ctx.strokeStyle = isSelectedDie ? '#ffffff' : COLOR_HEX[die.color];
        ctx.lineWidth = isSelectedDie ? 4 : 2;
        ctx.strokeRect(die.bounds.x, die.bounds.y, die.bounds.width, die.bounds.height);

        // Draw pip count label
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(die.bounds.x, die.bounds.y - 20, 30, 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${die.pips}`, die.bounds.x + 10, die.bounds.y - 5);
      });

      // Draw block boundary
      if (block.dice.length > 0) {
        const minX = Math.min(...block.dice.map(d => d.bounds.x));
        const minY = Math.min(...block.dice.map(d => d.bounds.y));
        const maxX = Math.max(...block.dice.map(d => d.bounds.x + d.bounds.width));
        const maxY = Math.max(...block.dice.map(d => d.bounds.y + d.bounds.height));

        ctx.strokeStyle = isSelected ? '#00ff00' : '#ffffff';
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(minX - 10, minY - 10, maxX - minX + 20, maxY - minY + 20);
        ctx.setLineDash([]);

        // Block info label
        ctx.fillStyle = isSelected ? 'rgba(0, 255, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(minX - 10, minY - 45, 120, 25);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`Block ${blockIndex + 1}: Total ${block.total}`, minX - 5, minY - 28);
      }
    });
  }, [imageData, editedBlocks, selectedBlockIndex, selectedDieIndex]);

  // Handle canvas click to select die
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // Find clicked die
    for (let blockIndex = 0; blockIndex < editedBlocks.length; blockIndex++) {
      const block = editedBlocks[blockIndex];
      for (let dieIndex = 0; dieIndex < block.dice.length; dieIndex++) {
        const die = block.dice[dieIndex];
        if (
          x >= die.bounds.x &&
          x <= die.bounds.x + die.bounds.width &&
          y >= die.bounds.y &&
          y <= die.bounds.y + die.bounds.height
        ) {
          setSelectedBlockIndex(blockIndex);
          setSelectedDieIndex(dieIndex);
          return;
        }
      }
    }

    // Clicked outside any die - deselect
    setSelectedBlockIndex(null);
    setSelectedDieIndex(null);
  }, [editedBlocks]);

  // Edit selected die color
  const changeDieColor = useCallback((newColor: DiceColor) => {
    if (selectedBlockIndex === null || selectedDieIndex === null) return;

    setEditedBlocks(prev => {
      const updated = [...prev];
      const block = { ...updated[selectedBlockIndex] };
      const dice = [...block.dice];
      dice[selectedDieIndex] = { ...dice[selectedDieIndex], color: newColor };
      block.dice = dice;
      updated[selectedBlockIndex] = block;
      return updated;
    });
  }, [selectedBlockIndex, selectedDieIndex]);

  // Edit selected die pips
  const changeDiePips = useCallback((newPips: number) => {
    if (selectedBlockIndex === null || selectedDieIndex === null) return;

    setEditedBlocks(prev => {
      const updated = [...prev];
      const block = { ...updated[selectedBlockIndex] };
      const dice = [...block.dice];
      dice[selectedDieIndex] = { ...dice[selectedDieIndex], pips: newPips };
      block.dice = dice;
      // Recalculate total
      block.total = dice.reduce((sum, d) => sum + d.pips, 0);
      updated[selectedBlockIndex] = block;
      return updated;
    });
  }, [selectedBlockIndex, selectedDieIndex]);

  const selectedDie = selectedBlockIndex !== null && selectedDieIndex !== null
    ? editedBlocks[selectedBlockIndex]?.dice[selectedDieIndex]
    : null;

  return (
    <div className="review-screen">
      <div className="review-header">
        <button className="btn-icon" onClick={onBack}>
          ←
        </button>
        <h2>Review Detection</h2>
        <span className="block-count">{editedBlocks.length} blocks</span>
      </div>

      <div className="review-canvas-container">
        <canvas
          ref={canvasRef}
          className="review-canvas"
          onClick={handleCanvasClick}
        />
      </div>

      <div className="review-info">
        <p>Tap a die to edit its color or pip count</p>
      </div>

      {selectedDie && (
        <div className="die-editor">
          <h3>Edit Die</h3>
          
          <div className="editor-section">
            <label>Color:</label>
            <div className="color-buttons">
              {DICE_COLORS.map(color => (
                <button
                  key={color}
                  className={`color-btn ${selectedDie.color === color ? 'active' : ''}`}
                  style={{ backgroundColor: COLOR_HEX[color] }}
                  onClick={() => changeDieColor(color)}
                />
              ))}
            </div>
          </div>

          <div className="editor-section">
            <label>Pips:</label>
            <div className="pip-buttons">
              {[1, 2, 3, 4, 5, 6].map(pips => (
                <button
                  key={pips}
                  className={`pip-btn ${selectedDie.pips === pips ? 'active' : ''}`}
                  onClick={() => changeDiePips(pips)}
                >
                  {pips}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="block-summary">
        <h3>Block Summary</h3>
        <div className="blocks-list">
          {editedBlocks.map((block, index) => (
            <div
              key={block.id}
              className={`block-item ${selectedBlockIndex === index ? 'selected' : ''}`}
              onClick={() => {
                setSelectedBlockIndex(index);
                setSelectedDieIndex(null);
              }}
            >
              <span className="block-label">Block {index + 1}</span>
              <span className="block-dice">{block.dice.length} dice</span>
              <span className="block-total">Total: {block.total}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="review-actions">
        <button className="btn-secondary" onClick={onRescan}>
          🔄 Rescan
        </button>
        <button className="btn-primary" onClick={() => onConfirm(editedBlocks)}>
          ✓ Validate
        </button>
      </div>
    </div>
  );
}
