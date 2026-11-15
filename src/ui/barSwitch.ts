import { MAX_BARS, barOfStep } from "../core/timing";
import { segmented } from "./controls";
import type { AppState } from "./store";

const BARS = Array.from({ length: MAX_BARS }, (_, b) => b);

/** "Bar 1 2 3 4" switch for the bar being edited, with a dot on the playing bar. */
export function createBarSwitch(onChange: (bar: number) => void) {
  const seg = segmented<number>({
    legend: "Bar",
    options: BARS.map((b) => ({ value: b, label: String(b + 1), title: `Edit bar ${b + 1}` })),
    value: 0,
    onChange,
    className: "seg-editbar",
  });
  return {
    el: seg.el,
    update(s: AppState) {
      seg.setAvailable(BARS.filter((b) => b < s.project.bars));
      seg.setValue(s.editBar);
      seg.el.hidden = s.project.bars === 1;
    },
    setPlayhead(step: number) {
      seg.setMarked(step < 0 ? null : barOfStep(step));
    },
  };
}
