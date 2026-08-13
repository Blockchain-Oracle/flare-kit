'use client'

import {
  FLARE_NETWORKS,
  type FlareNetworkKey,
  delegationFor,
  dexFor,
  gaslessFor,
  rewardsFor,
  routesFor,
  stakingFor,
  vaultsFor,
  x402For,
} from '@flarekit-dev/contracts'
import { DataTable, Panel, ToneChip } from '@flarekit-dev/react-ui'
import { Preview } from '../preview'

/**
 * Every `*Verified` flag the contracts package carries, read from the package
 * on this render.
 *
 * Nothing in this table is typed into the page (R10). The booleans are the ones
 * the kit itself branches on, so a flag that flips after a live run flips here
 * too, and a docs page can never claim a capability is proven after the registry
 * stopped saying so.
 */

type CapabilityFlag =
  | 'addLiquidityVerified'
  | 'withdrawVerified'
  | 'bridgeVerified'
  | 'gaslessVerified'
  | 'x402Verified'
  | 'delegationVerified'
  | 'rewardsVerified'
  | 'stakeVerified'

interface FlagRow {
  readonly id: string
  readonly capability: string
  /** The registry entry the flag hangs off, where a network carries several. */
  readonly scope?: string
  readonly network: FlareNetworkKey
  readonly flag: CapabilityFlag
  readonly value: boolean | undefined
  /** False when the network carries no deployment at all — not the same as unproven. */
  readonly configured: boolean
}

/**
 * The four honest readings. `false` is never "broken" and never "failed": it
 * says no live run has proven this path yet, so the surface shows the capability
 * as a declared-unbuilt affordance rather than emitting a plan that spends real
 * value on an unconfirmed call shape.
 */
const READINGS = {
  proven: 'Proven by a recorded live run, with transaction evidence.',
  unproven: 'Not proven — the path is carried, never faked.',
  unset: 'Not set on this network, which reads exactly as not proven.',
  absent: 'Not configured on this network. No address is carried, so there is nothing to prove.',
} as const

function readingFor(row: FlagRow): string {
  if (!row.configured) return READINGS.absent
  if (row.value === undefined) return READINGS.unset
  return row.value ? READINGS.proven : READINGS.unproven
}

function rowsFor(network: FlareNetworkKey): FlagRow[] {
  const chainId = FLARE_NETWORKS[network].id
  const rows: FlagRow[] = []

  const push = (
    capability: string,
    flag: CapabilityFlag,
    value: boolean | undefined,
    configured: boolean,
    scope?: string,
  ) => {
    rows.push({
      id: `${network}-${flag}-${scope ?? 'network'}`,
      capability,
      network,
      flag,
      value,
      configured,
      ...(scope ? { scope } : {}),
    })
  }

  // The swap venue exists on both networks; only the add-liquidity call shape is
  // network-verified, and on one of them the flag is simply absent.
  push('Add liquidity', 'addLiquidityVerified', dexFor(chainId).addLiquidityVerified, true)

  const vaults = vaultsFor(network)
  if (vaults.length === 0) push('Vault withdraw', 'withdrawVerified', undefined, false)
  for (const vault of vaults) {
    push('Vault withdraw', 'withdrawVerified', vault.withdrawVerified, true, vault.key)
  }

  const routes = routesFor(network)
  if (routes.length === 0) push('Cross-chain delivery', 'bridgeVerified', undefined, false)
  for (const route of routes) {
    push('Cross-chain delivery', 'bridgeVerified', route.bridgeVerified, true, route.key)
  }

  const gasless = gaslessFor(network)
  push('Gasless payment', 'gaslessVerified', gasless?.gaslessVerified, gasless !== undefined)

  const x402 = x402For(network)
  push('x402 settlement', 'x402Verified', x402?.x402Verified, x402 !== undefined)

  const delegation = delegationFor(network)
  push('Vote-power delegation', 'delegationVerified', delegation?.delegationVerified, delegation !== undefined)

  const rewards = rewardsFor(network)
  push('Reward claim', 'rewardsVerified', rewards?.rewardsVerified, rewards !== undefined)

  const staking = stakingFor(network)
  push('Staking', 'stakeVerified', staking?.stakeVerified, staking !== undefined)

  return rows
}

const COLUMNS = [
  { key: 'capability', label: 'Capability' },
  { key: 'network', label: 'Network' },
  { key: 'flag', label: 'Flag' },
  { key: 'value', label: 'Value' },
  { key: 'reading', label: 'What it means' },
] as const

/**
 * The value cell. `true` takes the filled disc (complete); everything short of
 * it takes the dotted ring, which in this kit's fixed vocabulary means *outcome
 * unknown* — the precise thing an unflipped flag records. Colour is never the
 * only signal: the word is the literal boolean the registry returned.
 */
function ValueChip({ row }: { row: FlagRow }) {
  if (!row.configured) return <ToneChip tone="neutral">not configured</ToneChip>
  return (
    <ToneChip tone={row.value ? 'ok' : 'neutral'} glyph={row.value ? 'done' : 'unknown'}>
      {String(row.value)}
    </ToneChip>
  )
}

const CODE = `import { stakingFor, vaultsFor } from '@flarekit-dev/contracts'

// Read the flag before you offer the action.
const staking = stakingFor('coston2')
if (staking?.stakeVerified) {
  // Only here may a stake plan be emitted.
}

const firelight = vaultsFor('coston2').find((v) => v.key === 'firelight-fxrp')
if (!firelight?.withdrawVerified) {
  // Show the vault's reads and a declared-unbuilt withdraw affordance.
  // Never a plan: the call shape has not been confirmed on this network.
}
`

export function VerifiedFlagsDemo() {
  const networks = Object.keys(FLARE_NETWORKS) as FlareNetworkKey[]
  const rows = networks.flatMap(rowsFor)

  return (
    <Preview code={CODE} label="registry constants">
      <Panel
        title="Verified flags"
        subtitle={
          <>
            Read from <span className="fk-mono">@flarekit-dev/contracts</span> on this render — no
            value below is typed into the page.
          </>
        }
      >
        <DataTable caption="Every capability's verified flag, by network" columns={COLUMNS}>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                {row.capability}
                {row.scope ? <span className="fk-table-account">{row.scope}</span> : null}
              </td>
              <td>
                <span className="fk-table-asset">{row.network}</span>
                <span className="fk-table-account">chain {FLARE_NETWORKS[row.network].id}</span>
              </td>
              <td>
                <span className="fk-table-asset">{row.flag}</span>
              </td>
              <td>
                <ValueChip row={row} />
              </td>
              <td>{readingFor(row)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </Preview>
  )
}
