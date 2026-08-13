# @flare-kit/core

[![npm](https://img.shields.io/npm/v/@flare-kit/core.svg)](https://www.npmjs.com/package/@flare-kit/core)
[![license](https://img.shields.io/npm/l/@flare-kit/core.svg)](https://github.com/Blockchain-Oracle/flare-kit/blob/main/LICENSE)

The durable operation lifecycle for Flare: intent, quote, unsigned plan,
execution, evidence and recovery. Headless — no React, no DOM.

> Community-built. Not an official Flare Networks product.

## Install

```bash
npm i @flare-kit/core viem
```

## Usage

This example runs with no wallet, no key and no network. `createMockKit`
reproduces the real state machine, including its waits.

```ts
import { createMockKit } from '@flare-kit/core'

const kit = createMockKit()
kit.isMock // true — mock surfaces are always labelled, never a silent fallback

const intent = {
  amountXrp: '25', // an exact decimal string, never a float
  recipient: '0xA4b05cdB545FA7CA12Be9f866d64E8A843A31Bd9',
  xrplAccount: 'rDYeq...',
}

const quote = kit.quote(intent)
quote.mintedEstimate // every term carries its asset and full precision
quote.minimumPayment

let operation = kit.start(intent)
operation.state // 'draft'

operation = await kit.reconcile(operation)
operation.state // e.g. 'awaiting_external' — the XRP Ledger has not answered yet
```

`reconcile` reads the chain and returns the operation's real state. It is safe
to call at any time, including after a reload — operations persist and
reconcile themselves, so there is no resume step.

## The lifecycle

Every surface in flare-kit — headless, hooks, widgets and agent tools — reports
exactly these sixteen states:

```
draft · discovering · quoting · awaiting_input · awaiting_approval · ready
executing · submitted · confirming · awaiting_external · action_required
partially_succeeded · succeeded · failed · cancelled · expired
```

Four of them exist because the alternative is a lie. `submitted` is never
rendered as `succeeded`. `awaiting_external` means the answer is genuinely not
known yet, and is never rendered as `failed`. `action_required` means the
protocol is waiting on the user — an XRPL payment inside a deadline, say.
`partially_succeeded` means exactly that.

## Going live

The live kit satisfies the same contract, so nothing downstream branches on it:

```ts
import { createPublicClient, http } from 'viem'
import { chainFor } from '@flare-kit/contracts'
import { createFlareKit } from '@flare-kit/core'

const chainId = 114 // Coston2
const kit = await createFlareKit({
  client: createPublicClient({ transport: http(chainFor(chainId).rpcUrl) }),
  chainId,
})
kit.isMock // false
```

Mock mode is explicit and labelled. It is never entered as a fallback when
something fails — a failure reports the failure.

## Documentation

Full documentation at [flare-kit.xyz](https://flare-kit.xyz).

## License

MIT
