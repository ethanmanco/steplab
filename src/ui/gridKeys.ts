export interface Cell {
  row: number;
  col: number;
}

/**
 * Where focus goes inside a grid for a key press, or null when the key is
 * not a grid movement key. Movement stops at the edges rather than wrapping,
 * so a screen reader user always knows where they are.
 */
export function moveInGrid(
  from: Cell,
  key: string,
  rows: number,
  cols: number,
  ctrl = false,
): Cell | null {
  const clampRow = (r: number) => Math.min(rows - 1, Math.max(0, r));
  const clampCol = (c: number) => Math.min(cols - 1, Math.max(0, c));
  switch (key) {
    case "ArrowUp":
      return { row: clampRow(from.row - 1), col: from.col };
    case "ArrowDown":
      return { row: clampRow(from.row + 1), col: from.col };
    case "ArrowLeft":
      return { row: from.row, col: clampCol(from.col - 1) };
    case "ArrowRight":
      return { row: from.row, col: clampCol(from.col + 1) };
    case "Home":
      return ctrl ? { row: 0, col: 0 } : { row: from.row, col: 0 };
    case "End":
      return ctrl ? { row: rows - 1, col: cols - 1 } : { row: from.row, col: cols - 1 };
    default:
      return null;
  }
}
