/** Settings navigation glyph for the Codex Connect section. */

/** Props the settings shell binds for one section icon. */
export interface CodexSettingsIconProps {
  size?: number
  active?: boolean
}

/**
 * Render the Codex Connect navigation glyph.
 * @param props - shell-provided icon size; the glyph keeps the row's text color in both states.
 * @returns the section glyph.
 */
export function CodexSettingsIcon({ size = 16 }: CodexSettingsIconProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path d="M8 1.75 3.25 4.5v7L8 14.25l4.75-2.75v-7L8 1.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M8 5.1a2.9 2.9 0 1 0 0 5.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
}
