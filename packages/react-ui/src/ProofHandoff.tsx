import type { FamilyRow } from '@flarekit-dev/core'
import { CodeWindow } from './primitives/CodeWindow.js'
import { DetailRow, Details } from './primitives/DetailRow.js'
import { Panel } from './primitives/Panel.js'

/**
 * The handoff — what a developer needs to take a verified proof into their own
 * contract.
 *
 * This exists because of
 * `.thoughts/decisions/2026-08-04-no-first-party-proof-consumer.md`: for
 * `EVMTransaction` and `Web2Json` the consumer is the integrator's contract by
 * design, and this project will never ship a demo consumer that invents meaning
 * the protocol deliberately leaves open. But a screen that says "nothing takes
 * this" and stops is a cul-de-sac. The kit owes the next step's inputs: the
 * ABI-ready struct, the Solidity type to write against, and the verification
 * call that is already true.
 *
 * The snippet is TypeScript with `bigint` literals rather than JSON, because
 * that is what can actually be pasted. JSON would render every `uint64` as a
 * string or — far worse — as a number, which is the precise corruption this kit
 * exists to prevent, reintroduced at the last possible moment.
 */

/**
 * The struct as a paste-able TypeScript literal. Integers keep their `n` suffix;
 * nothing is routed through `Number` on the way out.
 */
export function toProofLiteral(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent + 1)
  const closePad = '  '.repeat(indent)

  if (typeof value === 'bigint') return `${value.toString()}n`
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean' || value === null) return String(value)
  if (typeof value === 'number') return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((item) => `${pad}${toProofLiteral(item, indent + 1)}`)
    return `[\n${items.join(',\n')}\n${closePad}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const rendered = entries.map(
      ([key, item]) => `${pad}${key}: ${toProofLiteral(item, indent + 1)}`,
    )
    return `{\n${rendered.join(',\n')}\n${closePad}}`
  }

  return String(value)
}

export interface ProofHandoffProps {
  row: FamilyRow
  /** The ABI-ready struct, from the family module's `toProofStruct`. */
  abiStruct: unknown
  className?: string
}

export function ProofHandoff({ row, abiStruct, className }: ProofHandoffProps) {
  const name = row.family.name
  const code = `import { ${name.charAt(0).toLowerCase()}${name.slice(1)}Family } from '@flarekit-dev/core'

// The proof, ABI-ready. Integers are bigint: a uint64 through Number is the
// corruption FDC proofs fail silently on.
const proof = ${toProofLiteral(abiStruct)}

// Your contract takes it as I${name}.Proof calldata.
await wallet.writeContract({
  address: yourContract,
  abi: yourAbi,
  functionName: 'yourFunction',
  args: [proof],
})`

  return (
    <Panel
      title="Take this to your contract"
      subtitle="The proof is verified. What it means is yours to decide."
      {...(className ? { className } : {})}
    >
      <Details>
        <DetailRow
          label="Solidity type"
          value={<span className="fk-mono">I{name}.Proof</span>}
          sub={`From flare-foundry-periphery-package. Import I${name} and take the struct as calldata.`}
        />
        <DetailRow
          label="Already verified by"
          value={<span className="fk-mono">FdcVerification.verify{name}</span>}
          sub="Your contract should verify it again itself — this kit's check is a pre-flight, not a substitute."
        />
      </Details>

      <CodeWindow
        filename="consume-proof.ts"
        code={code}
        caption="Paste-ready. Nothing here is a placeholder except your contract, its ABI and its function."
      />
    </Panel>
  )
}
