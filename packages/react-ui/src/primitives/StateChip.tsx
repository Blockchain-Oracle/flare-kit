import type { OperationState } from '@flarekit-dev/core'
import { type Glyph, type Tone, visualFor } from '../state-visuals.js'

/**
 * The state chip: mono, pill, glyph plus word.
 *
 * The glyph is `aria-hidden` and the word carries the meaning, so the state is
 * conveyed by text and shape as well as colour (R11). A screen reader gets the
 * word; a colour-blind reader gets the shape; nobody depends on the hue.
 */

export interface GlyphMarkProps {
  glyph: Glyph
}

export function GlyphMark({ glyph }: GlyphMarkProps) {
  return <span className={`fk-g fk-g-${glyph}`} aria-hidden="true" />
}

export interface StateChipProps {
  state: OperationState
  /** Overrides the default word, for a surface with a more specific one. */
  label?: string
  className?: string
}

export function StateChip({ state, label, className }: StateChipProps) {
  const visual = visualFor(state)
  return (
    <span
      className={`fk-chip fk-chip-${visual.tone}${className ? ` ${className}` : ''}`}
      data-state={state}
      data-glyph={visual.glyph}
    >
      <GlyphMark glyph={visual.glyph} />
      {label ?? visual.word}
    </span>
  )
}

export interface ToneChipProps {
  tone: Tone
  /**
   * Omit for a chip that **labels** rather than states an outcome.
   *
   * The seven marks are an operation-outcome vocabulary — each asserts something
   * about how an operation went. A mode badge ("mock kit") and a property badge
   * ("Renamed") are neither, and both previously borrowed `unknown`, which means
   * *outcome unknown*. That made a label claim something false, and the P7 glyph
   * fix sharpened it: `unknown` is now a distinct dotted ring, so the wrong claim
   * became more legible rather than less.
   *
   * Inflating the fixed seven with an eighth "this is a label" mark would be
   * worse. DESIGN.md's rule is that every **state** pairs its colour with a glyph
   * and a word; a label is not a state, so it carries the word alone.
   */
  glyph?: Glyph
  children: React.ReactNode
  className?: string
}

/** A chip for something that is not an operation state, same anatomy. */
export function ToneChip({ tone, glyph, children, className }: ToneChipProps) {
  return (
    <span
      className={`fk-chip fk-chip-${tone}${glyph ? '' : ' fk-chip-label'}${className ? ` ${className}` : ''}`}
      {...(glyph ? { 'data-glyph': glyph } : { 'data-label': 'true' })}
    >
      {glyph ? <GlyphMark glyph={glyph} /> : null}
      {children}
    </span>
  )
}
