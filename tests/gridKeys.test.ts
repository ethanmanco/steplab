import { describe, expect, it } from "vitest";
import { moveInGrid } from "../src/ui/gridKeys";

describe("moveInGrid", () => {
  const at = { row: 2, col: 5 };

  it("moves one cell with the arrow keys", () => {
    expect(moveInGrid(at, "ArrowUp", 6, 16)).toEqual({ row: 1, col: 5 });
    expect(moveInGrid(at, "ArrowDown", 6, 16)).toEqual({ row: 3, col: 5 });
    expect(moveInGrid(at, "ArrowLeft", 6, 16)).toEqual({ row: 2, col: 4 });
    expect(moveInGrid(at, "ArrowRight", 6, 16)).toEqual({ row: 2, col: 6 });
  });

  it("stops at the edges instead of wrapping", () => {
    expect(moveInGrid({ row: 0, col: 0 }, "ArrowUp", 6, 16)).toEqual({ row: 0, col: 0 });
    expect(moveInGrid({ row: 0, col: 0 }, "ArrowLeft", 6, 16)).toEqual({ row: 0, col: 0 });
    expect(moveInGrid({ row: 5, col: 15 }, "ArrowDown", 6, 16)).toEqual({ row: 5, col: 15 });
    expect(moveInGrid({ row: 5, col: 15 }, "ArrowRight", 6, 16)).toEqual({ row: 5, col: 15 });
  });

  it("jumps to row ends with Home and End, and grid corners with Ctrl", () => {
    expect(moveInGrid(at, "Home", 6, 16)).toEqual({ row: 2, col: 0 });
    expect(moveInGrid(at, "End", 6, 16)).toEqual({ row: 2, col: 15 });
    expect(moveInGrid(at, "Home", 6, 16, true)).toEqual({ row: 0, col: 0 });
    expect(moveInGrid(at, "End", 6, 16, true)).toEqual({ row: 5, col: 15 });
  });

  it("ignores keys that are not movement keys", () => {
    expect(moveInGrid(at, " ", 6, 16)).toBeNull();
    expect(moveInGrid(at, "Enter", 6, 16)).toBeNull();
    expect(moveInGrid(at, "p", 6, 16)).toBeNull();
  });
});
