type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'height'>;

/**
 * Horizontal room left clear of Safari / Chrome's native AutoFill key decoration inside a field.
 * Geometric only — we do not observe the native icon (fragile across OS / browser builds).
 * Native control is ~20–24px at the trailing edge; 28px leaves a small gap beside our 22px mark.
 */
export const SYSTEM_AUTOFILL_ICON_CLEARANCE = 28;

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
  return { display: 'grid', left: `${left}px`, top: `${box.top + (box.height - 22) / 2}px` };
}

/** Align the menu with the field's writing start while keeping it inside the viewport. */
export function menuLeft(box: Pick<Box, 'left' | 'right'>, width: number, rtl: boolean, viewportWidth: number) {
  const start = rtl ? box.right - width : box.left;
  return `${Math.max(8, Math.min(start, viewportWidth - width - 8))}px`;
}

export type MenuVertical = {
  /** CSS `top` or `bottom` value (with px), mutually exclusive. */
  top?: string;
  bottom?: string;
  /** For spring transform-origin: menus above grow upward. */
  above: boolean;
};

/**
 * Prefer above the field: Safari / Chrome system AutoFill panels claim the space directly under
 * username and password fields, and page / shadow UI cannot cover them. Fall back to below only
 * when there is not enough room above.
 */
export function menuVertical(
  box: Pick<DOMRect, 'top' | 'bottom'>,
  height: number,
  viewportHeight: number,
  gap = 6,
): MenuVertical {
  const aboveRoom = box.top - 12;
  const belowRoom = viewportHeight - box.bottom - 12;
  if (aboveRoom >= height) {
    return { bottom: `${viewportHeight - box.top + gap}px`, above: true };
  }
  if (belowRoom >= height) {
    return { top: `${box.bottom + gap}px`, above: false };
  }
  // Neither side fits fully: pick the side with more space.
  if (aboveRoom >= belowRoom) {
    return { bottom: `${viewportHeight - box.top + gap}px`, above: true };
  }
  return { top: `${box.bottom + gap}px`, above: false };
}

type Rect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;

/**
 * The generate menu (Safari): tied to the new-password field and its icon, and never over the confirm field, which
 * the person fills or checks next. Above the new password when it fits; otherwise below the confirm field (or the new
 * password when there is none). Horizontally it ends at the icon, so it reads as the icon's menu.
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
  const icon = Number.parseFloat(iconPosition({ ...field, height: field.bottom - field.top }, rtl, false).left);
  const start = rtl ? icon : icon + 22 - width;
  const left = `${Math.max(8, Math.min(start, viewport.width - width - 8))}px`;
  const top = Math.min(field.top, confirm?.top ?? Infinity);
  const bottom = Math.max(field.bottom, confirm?.bottom ?? -Infinity);
  const aboveRoom = top - 12;
  const belowRoom = viewport.height - bottom - 12;
  const above = aboveRoom >= height || aboveRoom >= belowRoom;
  return {
    left,
    vertical: above
      ? { bottom: `${viewport.height - top + gap}px`, above: true }
      : { top: `${bottom + gap}px`, above: false },
  };
}
