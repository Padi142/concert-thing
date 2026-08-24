const TAB_BAR_CONTENT_HEIGHT = 60;
const TAB_BAR_TOP_PADDING = 8;
const MINIMUM_BOTTOM_GUTTER = 8;

export function getTabBarLayout(bottomInset: number) {
  const paddingBottom = Math.max(bottomInset, MINIMUM_BOTTOM_GUTTER);

  return {
    height: TAB_BAR_CONTENT_HEIGHT + paddingBottom,
    paddingBottom,
    paddingTop: TAB_BAR_TOP_PADDING,
  };
}
