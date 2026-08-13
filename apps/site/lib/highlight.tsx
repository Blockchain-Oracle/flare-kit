import type { ReactNode } from 'react'

/**
 * Dependency-free syntax highlighter for the docs code surfaces. Emits `.tok-*`
 * spans against the palette DESIGN.md fixes and the accepted specimen renders:
 * keyword = primary, string = success, number = attention, comment = faint
 * italic, function/type = brand-text, punctuation = muted.
 *
 * Ported from Abu's cdr-kit (`apps/site/lib/highlight.tsx`, MIT) — the reference
 * this kit mirrors — rather than pulling Shiki into the build. A hand tokenizer
 * is enough for the four languages the docs actually show, and it renders on the
 * server with no client cost and no theme round-trip.
 */

export type Lang = 'tsx' | 'ts' | 'json' | 'bash'

interface Token {
  cls: string
  text: string
}

const TS_KEYWORDS = new Set([
  'import', 'from', 'export', 'const', 'let', 'var', 'function', 'return', 'new',
  'async', 'await', 'class', 'if', 'else', 'type', 'interface', 'of', 'in',
  'typeof', 'as', 'default', 'extends', 'implements', 'public', 'private',
  'protected', 'readonly', 'static', 'true', 'false', 'null', 'undefined', 'void',
  'this', 'super', 'throw', 'try', 'catch', 'finally', 'for', 'while', 'do',
  'switch', 'case', 'break', 'continue', 'yield', 'enum',
])

function tokenizeTs(code: string): Token[] {
  const out: Token[] = []
  let i = 0
  const len = code.length
  while (i < len) {
    const c = code[i]!
    // line comment
    if (c === '/' && code[i + 1] === '/') {
      let j = code.indexOf('\n', i)
      if (j === -1) j = len
      out.push({ cls: 'tok-com', text: code.slice(i, j) })
      i = j
      continue
    }
    // block comment
    if (c === '/' && code[i + 1] === '*') {
      let j = code.indexOf('*/', i + 2)
      if (j === -1) j = len
      else j += 2
      out.push({ cls: 'tok-com', text: code.slice(i, j) })
      i = j
      continue
    }
    // string (no escape handling — good enough for snippets)
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      let j = i + 1
      while (j < len && code[j] !== quote) {
        if (code[j] === '\\') j++
        j++
      }
      j++
      out.push({ cls: 'tok-str', text: code.slice(i, j) })
      i = j
      continue
    }
    // number (allow trailing `n` for bigints)
    if (/\d/.test(c)) {
      let j = i + 1
      while (j < len && /[\d._xobBA-Fa-f]/.test(code[j]!)) j++
      if (code[j] === 'n') j++
      out.push({ cls: 'tok-num', text: code.slice(i, j) })
      i = j
      continue
    }
    // identifier / keyword / function or type name
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1
      while (j < len && /[A-Za-z0-9_$]/.test(code[j]!)) j++
      const word = code.slice(i, j)
      let k = j
      while (k < len && /\s/.test(code[k]!)) k++
      if (TS_KEYWORDS.has(word)) out.push({ cls: 'tok-key', text: word })
      else if (code[k] === '(') out.push({ cls: 'tok-fn', text: word })
      else if (/^[A-Z]/.test(word)) out.push({ cls: 'tok-fn', text: word })
      else out.push({ cls: '', text: word })
      i = j
      continue
    }
    // punctuation run
    if (/[{}()[\];,.<>=+\-*/&|!?:]/.test(c)) {
      let j = i + 1
      while (j < len && /[{}()[\];,.<>=+\-*/&|!?:]/.test(code[j]!)) j++
      out.push({ cls: 'tok-punc', text: code.slice(i, j) })
      i = j
      continue
    }
    // whitespace / other — pass through unstyled
    let j = i + 1
    while (j < len && /\s/.test(code[j]!)) j++
    out.push({ cls: '', text: code.slice(i, j) })
    i = j
  }
  return out
}

function tokenizeJson(code: string): Token[] {
  const out: Token[] = []
  let i = 0
  const len = code.length
  while (i < len) {
    const c = code[i]!
    if (c === '"') {
      let j = i + 1
      while (j < len && code[j] !== '"') {
        if (code[j] === '\\') j++
        j++
      }
      j++
      let k = j
      while (k < len && /\s/.test(code[k]!)) k++
      out.push({ cls: code[k] === ':' ? 'tok-key' : 'tok-str', text: code.slice(i, j) })
      i = j
      continue
    }
    if (/-?\d/.test(c)) {
      let j = i + 1
      while (j < len && /[\d.eE+-]/.test(code[j]!)) j++
      out.push({ cls: 'tok-num', text: code.slice(i, j) })
      i = j
      continue
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i + 1
      while (j < len && /[a-zA-Z]/.test(code[j]!)) j++
      const word = code.slice(i, j)
      out.push({ cls: word === 'true' || word === 'false' || word === 'null' ? 'tok-num' : '', text: word })
      i = j
      continue
    }
    out.push({ cls: 'tok-punc', text: c })
    i++
  }
  return out
}

function tokenizeBash(code: string): Token[] {
  const out: Token[] = []
  for (const line of code.split('\n')) {
    if (line.length === 0) {
      out.push({ cls: '', text: '\n' })
      continue
    }
    const promptMatch = line.match(/^(\s*)([$#>])(\s+)(.*)$/)
    if (promptMatch) {
      out.push({ cls: '', text: promptMatch[1] ?? '' })
      out.push({ cls: 'tok-punc', text: promptMatch[2] ?? '' })
      out.push({ cls: '', text: promptMatch[3] ?? '' })
      const rest = promptMatch[4] ?? ''
      const firstWord = rest.match(/^(\S+)(.*)$/)
      if (firstWord) {
        out.push({ cls: 'tok-fn', text: firstWord[1] ?? '' })
        out.push({ cls: '', text: (firstWord[2] ?? '') + '\n' })
      } else {
        out.push({ cls: '', text: rest + '\n' })
      }
    } else {
      out.push({ cls: '', text: line + '\n' })
    }
  }
  return out
}

function tokenize(code: string, lang: Lang): Token[] {
  if (lang === 'json') return tokenizeJson(code)
  if (lang === 'bash') return tokenizeBash(code)
  return tokenizeTs(code)
}

/** Render a code string as syntax-highlighted spans. */
export function highlight(code: string, lang: Lang = 'tsx'): ReactNode {
  return tokenize(code, lang).map((t, i) =>
    t.cls ? (
      <span key={i} className={t.cls}>
        {t.text}
      </span>
    ) : (
      <span key={i}>{t.text}</span>
    ),
  )
}

/** Map a fenced-code language hint (`language-ts`, `sh`, …) to a supported lang. */
export function normalizeLang(raw: string | undefined): Lang {
  const l = (raw ?? '').replace(/^language-/, '').toLowerCase()
  if (l === 'ts' || l === 'typescript') return 'ts'
  if (l === 'json') return 'json'
  if (l === 'bash' || l === 'sh' || l === 'shell' || l === 'console') return 'bash'
  return 'tsx'
}
