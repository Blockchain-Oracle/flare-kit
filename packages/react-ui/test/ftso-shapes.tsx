import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { expect } from 'vitest'
import { shapeOf } from './fdc-shapes.js'

/**
 * The shape signature for the FTSO surfaces.
 *
 * Composed onto `shapeOf` rather than copying its attribute list: the base
 * signature already reads glyph modifiers, operation state, staleness and which
 * controls are disabled, and a second copy of that list would drift from the
 * first the moment either milestone adds a signal.
 *
 * What FTSO adds is its own vocabulary. Every attribute below drives a visible
 * chip, row treatment or panel tint, so a difference here is a difference a
 * person can see — which is the only thing that makes "these states are
 * distinct" worth asserting.
 */

const FTSO_ATTRIBUTES = [
  /** Serving / no value / not read — the availability chip. */
  'data-availability',
  /** Protocol or custom — the trust chip, and never presented as equivalent. */
  'data-trust',
  /** proven / not_proven / could_not_check — the three-valued verdict. */
  'data-outcome',
  /** Whether the protocol called this random secure. Tints the value's frame. */
  'data-secure',
  /** Whether a widening's duration has elapsed. */
  'data-expired',
  /** Why an enumeration source's entry is not rendered as a feed. */
  'data-condition',
  /** retrieved / committed_not_retrievable / not_finalized / could_not_ask. */
  'data-status',
] as const

/**
 * The structural signals that are not attributes.
 *
 * DESIGN.md requires every state to pair its colour with a glyph **and a word**,
 * so the chip's word is a first-class part of a state's shape. Two states with
 * the same glyph and different words are genuinely distinguishable on screen,
 * and a signature blind to the word calls them identical — which is what the
 * first version of this file did to "waiting on the host" and "host could not be
 * asked". Skeletons and empty-row copy are the same story: "loading" and "there
 * is nothing here" look nothing alike and share every attribute.
 *
 * Body prose stays excluded. An explanation *under* a state is not the state,
 * and letting paragraph text in would let two identical-looking states pass by
 * wording their footnotes differently.
 */
function structureOf(container: HTMLElement): string {
  const text = (selector: string) =>
    [...container.querySelectorAll(selector)].map((node) => node.textContent?.trim()).join(',')
  return [
    text('.fk-chip'),
    text('.fk-table-empty'),
    `skeletons=${container.querySelectorAll('.fk-skeleton').length}`,
    `unread=${container.querySelectorAll('.fk-unread').length}`,
    `values=${container.querySelectorAll('.fk-ftso-value').length}`,
  ].join(' | ')
}

export function ftsoShapeOf(ui: ReactElement): string {
  const base = shapeOf(ui)
  const { container, unmount } = render(ui)
  const ftso = FTSO_ATTRIBUTES.map((attribute) =>
    [...container.querySelectorAll(`[${attribute}]`)]
      .map((node) => node.getAttribute(attribute))
      .join(','),
  ).join(' | ')
  const structure = structureOf(container)
  unmount()
  return `${base} || ${ftso} || ${structure}`
}

/** Every pair must be distinguishable, and the failure names the pair. */
export function expectFtsoDistinct(cases: Record<string, ReactElement>) {
  const seen = new Map<string, string>()
  const collisions: string[] = []
  for (const [name, ui] of Object.entries(cases)) {
    const shape = ftsoShapeOf(ui)
    const previous = seen.get(shape)
    if (previous) collisions.push(`${previous} and ${name} render an identical shape`)
    else seen.set(shape, name)
  }
  expect(collisions).toEqual([])
}
