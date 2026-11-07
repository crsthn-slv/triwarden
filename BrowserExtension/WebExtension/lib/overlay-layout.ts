type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'height'>;

/**
 * Horizontal room left clear of Safari / Chrome's native AutoFill key decoration inside a field.
 * Geometric only — we do not observe the native icon (fragile across OS / browser builds).
 * Native control is ~20–24px at the trailing edge; 28px leaves a small gap beside our 22px mark.
 */
export const SYSTEM_AUTOFILL_ICON_CLEARANCE = 28;

const ICON_SIZE = 22;

/** Position the field icon inside a normal field, or just beyond a row of one-character code fields. */
export function iconPosition(box: Box, rtl: boolean, outside: boolean) {
  // Outside a one-time-code row: past the field, so no clash with the native trailing decoration.
  // Inside: sit inward of that decoration so our mark is not stacked on the system key icon.
  const left = outside
    ? rtl
      ? box.left - 28
      : box.right + 6
    : rtl
      ? box.left + 8 + SYSTEM_AUTOFILL_ICON_CLEARANCE
      : box.right - 30 - SYSTEM_AUTOFILL_ICON_CLEARANCE;
  return { display: 'grid', left: `${left}px`, top: `${box.top + (box.height - ICON_SIZE) / 2}px` };
}

/** Align the menu with the field's writing start while keeping it inside the viewport. */
export function menuLeft(box: Pick<Box, 'left' | 'right'>, width: number, rtl: boolean, viewportWidth: number) {
  const start = rtl ? box.right - width : box.left;
  return `${Math.max(8, Math.min(start, viewportWidth - width - 8))}px`;
}

/**
 * Horizontal place for a menu that belongs to the in-field icon: the menu's trailing edge meets the
 * icon's trailing edge (LTR ends at the icon; RTL starts at it), so it reads as that icon's panel.
 */
export function menuLeftNearIcon(
  iconLeft: number,
  width: number,
  rtl: boolean,
  viewportWidth: number,
  iconSize = ICON_SIZE,
) {
  const start = rtl ? iconLeft : iconLeft + iconSize - width;
  return `${Math.max(8, Math.min(start, viewportWidth - width - 8))}px`;
}

export type MenuVertical = {
  /** CSS `top` from the viewport. Always set — never `bottom`. */
  top: string;
  /** For spring transform-origin: menus above grow upward. */
  above: boolean;
};

/**
 * Prefer above the field: Safari / Chrome system AutoFill panels claim the space directly under
 * username and password fields, and page / shadow UI cannot cover them. Fall back to below only
 * when there is not enough room above.
 *
 * Always returns `top` (viewport px). CSS `bottom` on `position: fixed` inside WXT's shadow overlay
 * mis-resolves in Safari and parks the menu at the host's static position (viewport top-left).
 */
export function menuVertical(
  box: Pick<DOMRect, 'top' | 'bottom'>,
  height: number,
  viewportHeight: number,
  gap = 6,
): MenuVertical {
  const aboveRoom = box.top - 12;
  const belowRoom = viewportHeight - box.bottom - 12;
  if (aboveRoom >= height || aboveRoom >= belowRoom) {
    return { top: `${Math.max(8, box.top - gap - height)}px`, above: true };
  }
  return { top: `${box.bottom + gap}px`, above: false };
}

type Rect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;

/**
 * Vertical place for the Safari generate menu: above the new-password field when it fits (system
 * AutoFill owns the strip under the field); otherwise below the confirm field (or the new password
 * when there is none) so the confirm stays readable. Always `top`, never CSS `bottom`.
 */
export function menuVerticalGenerate(
  field: Rect,
  confirm: Rect | null | undefined,
  height: number,
  viewportHeight: number,
  gap = 6,
): MenuVertical {
  const topEdge = Math.min(field.top, confirm?.top ?? Infinity);
  const bottomEdge = Math.max(field.bottom, confirm?.bottom ?? -Infinity);
  const aboveRoom = topEdge - 12;
  const belowRoom = viewportHeight - bottomEdge - 12;
  if (aboveRoom >= height || aboveRoom >= belowRoom) {
    return { top: `${Math.max(8, topEdge - gap - height)}px`, above: true };
  }
  return { top: `${bottomEdge + gap}px`, above: false };
}

/**
 * The generate menu (Safari): tied to the new-password field's icon, and never over the confirm
 * field. Horizontally it ends at the icon (`menuLeftNearIcon`). Vertically: above the new password
 * when it fits; otherwise below the confirm (or the new password when there is none).
 */
export function generateMenuPlace(
  field: Rect,
  confirm: Rect | null | undefined,
  width: number,
  height: number,
  viewport: { width: number; height: number },
  rtl: boolean,
  gap = 6,
): { left: string; vertical: MenuVertical } {
  const iconLeft = Number.parseFloat(
    iconPosition({ ...field, height: field.bottom - field.top }, rtl, false).left,
  );
  return {
    left: menuLeftNearIcon(iconLeft, width, rtl, viewport.width),
    vertical: menuVerticalGenerate(field, confirm, height, viewport.height, gap),
  };
}
