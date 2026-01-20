import { ValidationResult, ValidatedBlock, COLOR_HEX, DiceColor } from '../types';

interface ValidationResultsProps {
  result: ValidationResult;
  onScanAgain: () => void;
  onHome: () => void;
}

export default function ValidationResults({ result, onScanAgain, onHome }: ValidationResultsProps) {
  const { blocks, longestChain, totalBlocks, validBlocks, invalidBlocks, difficulty } = result;

  // Group blocks by column for visualization
  const blocksByColumn = new Map<number, ValidatedBlock[]>();
  blocks.forEach(block => {
    const existing = blocksByColumn.get(block.column) || [];
    existing.push(block);
    blocksByColumn.set(block.column, existing);
  });

  // Sort columns
  const columns = Array.from(blocksByColumn.keys()).sort((a, b) => a - b);

  // Check if block is in longest chain
  const chainBlockIds = new Set(longestChain);

  return (
    <div className="results-screen">
      <div className="results-header">
        <button className="btn-icon" onClick={onHome}>
          ←
        </button>
        <h2>Validation Results</h2>
      </div>

      <div className="results-summary">
        <div className={`summary-card ${invalidBlocks === 0 ? 'success' : 'warning'}`}>
          <div className="summary-icon">
            {invalidBlocks === 0 ? '✅' : '⚠️'}
          </div>
          <div className="summary-text">
            {invalidBlocks === 0 
              ? 'All blocks valid!' 
              : `${invalidBlocks} invalid block${invalidBlocks > 1 ? 's' : ''}`}
          </div>
        </div>

        <div className="stats-row">
          <div className="stat">
            <span className="stat-value">{totalBlocks}</span>
            <span className="stat-label">Total Blocks</span>
          </div>
          <div className="stat">
            <span className="stat-value">{validBlocks}</span>
            <span className="stat-label">Valid</span>
          </div>
          <div className="stat">
            <span className="stat-value">{invalidBlocks}</span>
            <span className="stat-label">Invalid</span>
          </div>
          <div className="stat">
            <span className="stat-value">{difficulty}</span>
            <span className="stat-label">Difficulty</span>
          </div>
        </div>

        <div className="chain-info">
          <span className="chain-label">Longest Chain:</span>
          <span className="chain-length">{longestChain.length} blocks</span>
        </div>
      </div>

      <div className="blockchain-visualization">
        <h3>Blockchain View</h3>
        <div className="chain-columns">
          {columns.map(column => (
            <div key={column} className="chain-column">
              <div className="column-header">
                {column === 0 ? 'Genesis' : `Col ${column}`}
              </div>
              {blocksByColumn.get(column)?.map(block => (
                <BlockCard
                  key={block.id}
                  block={block}
                  isInChain={chainBlockIds.has(block.id)}
                  difficulty={difficulty}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="block-details">
        <h3>Block Details</h3>
        {blocks.map(block => (
          <BlockDetailCard
            key={block.id}
            block={block}
            isInChain={chainBlockIds.has(block.id)}
          />
        ))}
      </div>

      <div className="results-actions">
        <button className="btn-secondary" onClick={onScanAgain}>
          📷 Scan Again
        </button>
        <button className="btn-primary" onClick={onHome}>
          🏠 Home
        </button>
      </div>
    </div>
  );
}

interface BlockCardProps {
  block: ValidatedBlock;
  isInChain: boolean;
  difficulty: number;
}

function BlockCard({ block, isInChain, difficulty }: BlockCardProps) {
  const statusClass = block.isGenesis 
    ? 'genesis' 
    : block.isValid 
      ? (isInChain ? 'valid-chain' : 'valid') 
      : 'invalid';

  return (
    <div className={`block-card ${statusClass}`}>
      <div className="block-card-header">
        {block.isGenesis ? '🌟' : block.isValid ? (isInChain ? '✓' : '○') : '✗'}
        <span className="block-total">{block.total}</span>
        {!block.isGenesis && block.total > difficulty && (
          <span className="over-difficulty">!</span>
        )}
      </div>
      <div className="block-card-dice">
        {block.dice.slice(0, 9).map((die, i) => (
          <div
            key={i}
            className="mini-die"
            style={{ backgroundColor: COLOR_HEX[die.color as DiceColor] }}
          >
            {die.pips}
          </div>
        ))}
      </div>
    </div>
  );
}

interface BlockDetailCardProps {
  block: ValidatedBlock;
  isInChain: boolean;
}

function BlockDetailCard({ block, isInChain }: BlockDetailCardProps) {
  return (
    <div className={`detail-card ${block.isValid ? 'valid' : 'invalid'}`}>
      <div className="detail-header">
        <span className="detail-title">
          {block.isGenesis ? '🌟 Genesis Block' : `Block (Col ${block.column})`}
        </span>
        <span className={`detail-status ${block.isValid ? 'valid' : 'invalid'}`}>
          {block.isValid ? '✓ Valid' : '✗ Invalid'}
        </span>
      </div>

      <div className="detail-body">
        <div className="detail-row">
          <span className="detail-label">Dice:</span>
          <div className="detail-dice">
            {block.dice.map((die, i) => (
              <span
                key={i}
                className="die-badge"
                style={{ backgroundColor: COLOR_HEX[die.color as DiceColor] }}
              >
                {die.pips}
              </span>
            ))}
          </div>
        </div>

        <div className="detail-row">
          <span className="detail-label">Total:</span>
          <span className="detail-value">{block.total}</span>
        </div>

        {!block.isGenesis && (
          <div className="detail-row">
            <span className="detail-label">Predecessor:</span>
            <span className="detail-value">
              {block.predecessorId || 'None found'}
            </span>
          </div>
        )}

        {isInChain && (
          <div className="detail-row chain-badge">
            <span>🔗 In Longest Chain</span>
          </div>
        )}

        {block.errors.length > 0 && (
          <div className="detail-errors">
            <span className="errors-title">Errors:</span>
            <ul>
              {block.errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {!block.isGenesis && (
          <div className="detail-row">
            <span className="detail-label">Required colors for next:</span>
            <div className="detail-dice">
              {block.requiredColors.map((color, i) => (
                <span
                  key={i}
                  className="color-badge"
                  style={{ backgroundColor: COLOR_HEX[color] }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
