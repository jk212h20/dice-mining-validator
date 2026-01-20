import {
  DiceColor,
  DetectedBlock,
  ValidatedBlock,
  ValidationResult,
  VALUE_TO_COLOR,
  GENESIS_PATTERN,
  GENESIS_VALUES
} from '../types';

/**
 * Get the required colors for the next block based on this block's pip values
 */
export function getRequiredColors(dice: { pips: number }[]): DiceColor[] {
  return dice.map(d => VALUE_TO_COLOR[d.pips]);
}

/**
 * Check if a block matches the genesis pattern (2 red, 2 orange, 2 yellow, 3 green)
 */
export function isGenesisBlock(block: DetectedBlock): boolean {
  const colors = block.dice.map(d => d.color).sort();
  const genesisColors = [...GENESIS_PATTERN].sort();
  
  if (colors.length !== genesisColors.length) return false;
  
  return colors.every((color, i) => color === genesisColors[i]);
}

/**
 * Check if block A can be a valid predecessor of block B
 * (Block B's COLORS must match Block A's VALUES)
 */
export function canBePredecessor(blockA: DetectedBlock, blockB: DetectedBlock): boolean {
  // Get required colors from block A's pip values
  const requiredColors = getRequiredColors(blockA.dice);
  
  // Get actual colors from block B
  const actualColors = blockB.dice.map(d => d.color);
  
  // Sort and compare
  const sortedRequired = [...requiredColors].sort();
  const sortedActual = [...actualColors].sort();
  
  if (sortedRequired.length !== sortedActual.length) return false;
  
  return sortedRequired.every((color, i) => color === sortedActual[i]);
}

/**
 * Sort blocks into columns based on x position
 * Genesis block is column 0, subsequent blocks increase
 */
export function assignColumns(blocks: DetectedBlock[]): DetectedBlock[] {
  if (blocks.length === 0) return [];
  
  // Find the genesis block
  const genesisIndex = blocks.findIndex(isGenesisBlock);
  if (genesisIndex === -1) {
    // No genesis found - use leftmost block as column 0
    const sortedByX = [...blocks].sort((a, b) => a.position.x - b.position.x);
    const minX = sortedByX[0].position.x;
    
    // Estimate column width based on average block spacing
    const avgWidth = blocks.reduce((sum, b) => {
      const diceWidths = b.dice.map(d => d.bounds.width);
      return sum + (Math.max(...diceWidths) * 3); // 3x3 grid width
    }, 0) / blocks.length;
    
    const columnWidth = avgWidth * 1.5;
    
    return blocks.map(block => ({
      ...block,
      column: Math.round((block.position.x - minX) / columnWidth)
    }));
  }
  
  const genesisBlock = blocks[genesisIndex];
  const genesisX = genesisBlock.position.x;
  
  // Determine if blocks go left or right from genesis
  const blocksToRight = blocks.filter(b => b.position.x > genesisX).length;
  const blocksToLeft = blocks.filter(b => b.position.x < genesisX).length;
  
  // Direction: positive means blocks increase column to the right
  const direction = blocksToRight >= blocksToLeft ? 1 : -1;
  
  // Estimate column width
  const avgWidth = blocks.reduce((sum, b) => {
    const diceWidths = b.dice.map(d => d.bounds.width);
    return sum + (Math.max(...diceWidths) * 3);
  }, 0) / blocks.length;
  
  const columnWidth = avgWidth * 1.5;
  
  return blocks.map(block => ({
    ...block,
    column: Math.max(0, Math.round((block.position.x - genesisX) * direction / columnWidth))
  }));
}

/**
 * Build the blockchain by finding valid predecessor connections
 */
export function buildChain(
  blocks: DetectedBlock[],
  difficulty: number
): ValidatedBlock[] {
  if (blocks.length === 0) return [];
  
  // Assign columns first
  const blocksWithColumns = assignColumns(blocks);
  
  // Sort by column
  const sortedBlocks = [...blocksWithColumns].sort((a, b) => a.column - b.column);
  
  const validatedBlocks: ValidatedBlock[] = [];
  
  for (const block of sortedBlocks) {
    const errors: string[] = [];
    let predecessorId: string | null = null;
    let isValid = true;
    
    const blockIsGenesis = isGenesisBlock(block);
    
    if (blockIsGenesis) {
      // Genesis block validation
      if (block.column !== 0) {
        errors.push('Genesis block should be in column 0');
        isValid = false;
      }
      
      // Check if total matches expected
      const expectedTotal = GENESIS_VALUES.reduce((a, b) => a + b, 0); // 24
      if (block.total !== expectedTotal) {
        errors.push(`Genesis total ${block.total} doesn't match expected ${expectedTotal}`);
        // This might be a pip counting error, not necessarily invalid
      }
    } else {
      // Non-genesis block validation
      
      // Check total against difficulty
      if (block.total > difficulty) {
        errors.push(`Total ${block.total} exceeds difficulty ${difficulty}`);
        isValid = false;
      }
      
      // Find valid predecessor in previous column
      const predecessorCandidates = validatedBlocks.filter(
        vb => vb.column === block.column - 1 && vb.isValid
      );
      
      if (predecessorCandidates.length === 0) {
        errors.push(`No valid blocks in column ${block.column - 1} to build on`);
        isValid = false;
      } else {
        // Find which predecessor this block's colors match
        let foundPredecessor = false;
        
        for (const candidate of predecessorCandidates) {
          if (canBePredecessor(candidate, block)) {
            predecessorId = candidate.id;
            foundPredecessor = true;
            break;
          }
        }
        
        if (!foundPredecessor) {
          errors.push('Dice colors do not match any predecessor\'s values');
          isValid = false;
          
          // Try to provide more helpful error message
          if (predecessorCandidates.length === 1) {
            const pred = predecessorCandidates[0];
            const required = getRequiredColors(pred.dice);
            const actual = block.dice.map(d => d.color);
            errors.push(`Required: ${countColors(required)}, Got: ${countColors(actual)}`);
          }
        }
      }
    }
    
    // Calculate required colors for blocks building on this one
    const requiredColors = getRequiredColors(block.dice);
    
    validatedBlocks.push({
      ...block,
      isGenesis: blockIsGenesis,
      predecessorId,
      isValid,
      errors,
      requiredColors
    });
  }
  
  return validatedBlocks;
}

/**
 * Helper to count colors for error messages
 */
function countColors(colors: DiceColor[]): string {
  const counts: Record<DiceColor, number> = {
    red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0
  };
  
  for (const color of colors) {
    counts[color]++;
  }
  
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([color, count]) => `${count} ${color}`)
    .join(', ');
}

/**
 * Find the longest valid chain
 */
export function findLongestChain(blocks: ValidatedBlock[]): string[] {
  if (blocks.length === 0) return [];
  
  // Build adjacency list
  const children = new Map<string, string[]>();
  
  for (const block of blocks) {
    if (block.predecessorId && block.isValid) {
      const existing = children.get(block.predecessorId) || [];
      existing.push(block.id);
      children.set(block.predecessorId, existing);
    }
  }
  
  // Find genesis block
  const genesis = blocks.find(b => b.isGenesis);
  if (!genesis) return [];
  
  // DFS to find longest chain
  function findLongestFromNode(nodeId: string): string[] {
    const childIds = children.get(nodeId) || [];
    
    if (childIds.length === 0) {
      return [nodeId];
    }
    
    let longestChild: string[] = [];
    for (const childId of childIds) {
      const childChain = findLongestFromNode(childId);
      if (childChain.length > longestChild.length) {
        longestChild = childChain;
      }
    }
    
    return [nodeId, ...longestChild];
  }
  
  return findLongestFromNode(genesis.id);
}

/**
 * Validate all blocks and return complete results
 */
export function validateBlocks(
  blocks: DetectedBlock[],
  difficulty: number
): ValidationResult {
  const validatedBlocks = buildChain(blocks, difficulty);
  const longestChain = findLongestChain(validatedBlocks);
  
  const validBlocks = validatedBlocks.filter(b => b.isValid).length;
  const invalidBlocks = validatedBlocks.filter(b => !b.isValid).length;
  
  return {
    blocks: validatedBlocks,
    longestChain,
    totalBlocks: validatedBlocks.length,
    validBlocks,
    invalidBlocks,
    difficulty
  };
}

/**
 * Calculate scores based on blocks in the longest chain
 */
export function calculateScores(
  result: ValidationResult
): Map<string, number> {
  const scores = new Map<string, number>();
  
  const chainBlockIds = new Set(result.longestChain);
  
  for (const block of result.blocks) {
    if (chainBlockIds.has(block.id) && !block.isGenesis) {
      // Score by tray color (player identifier)
      const playerId = block.trayColor;
      const currentScore = scores.get(playerId) || 0;
      scores.set(playerId, currentScore + 1);
    }
  }
  
  return scores;
}
