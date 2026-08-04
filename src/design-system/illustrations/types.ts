/** Props shared by every spot illustration. */
export interface IllustrationProps {
  /** Rendered width/height in dp; the artwork scales from a 160x160 viewBox. */
  size?: number;
  /**
   * When omitted the illustration is decorative and hidden from screen
   * readers. Pass a concise label only when the artwork carries meaning the
   * surrounding copy does not already provide.
   */
  accessibilityLabel?: string;
}
