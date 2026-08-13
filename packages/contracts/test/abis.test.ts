import { describe, expect, it } from 'vitest'
import { decodeEventLog, encodeEventTopics, encodeFunctionData, getAbiItem } from 'viem'
import { DIRECT_MINTING_DELAY_STATES, assetManagerAbi, fassetAbi } from '../src/abis.js'

// R2: typed ABIs. A hand-curated ABI is only worth having if it actually
// encodes — so these tests encode against it rather than eyeballing the shape.

const PROOF = {
  merkleProof: ['0x'.padEnd(66, 'a')] as readonly `0x${string}`[],
  data: {
    attestationType: `0x${'11'.repeat(32)}`,
    sourceId: `0x${'22'.repeat(32)}`,
    votingRound: 1_043_912n,
    lowestUsedTimestamp: 1_780_000_000n,
    requestBody: {
      transactionId: `0x${'33'.repeat(32)}`,
      proofOwner: '0x1234567890abcdef1234567890abcdef12345678',
    },
    responseBody: {
      blockNumber: 4_821_766n,
      blockTimestamp: 1_780_000_100n,
      sourceAddress: 'rNBjmsJ8xLKvSbUZbGpFxk9Tt2cCPVKcRV',
      sourceAddressHash: `0x${'44'.repeat(32)}`,
      receivingAddressHash: `0x${'55'.repeat(32)}`,
      intendedReceivingAddressHash: `0x${'55'.repeat(32)}`,
      spentAmount: 250_000_012n,
      intendedSpentAmount: 250_000_012n,
      receivedAmount: 250_000_000n,
      intendedReceivedAmount: 250_000_000n,
      hasMemoData: false,
      firstMemoData: '0x',
      hasDestinationTag: true,
      destinationTag: 7781n,
      status: 0,
    },
  },
} as const

describe('direct minting', () => {
  it('encodes executeDirectMinting, which proves the whole proof tuple is right', () => {
    // If a single component were missing or misordered, viem would refuse here.
    const data = encodeFunctionData({
      abi: assetManagerAbi,
      functionName: 'executeDirectMinting',
      args: [PROOF],
    })
    expect(data).toMatch(/^0x[0-9a-f]+$/)
  })

  it('keeps executeDirectMinting payable, because the executor fee rides on it', () => {
    const item = getAbiItem({ abi: assetManagerAbi, name: 'executeDirectMinting' })
    expect(item?.stateMutability).toBe('payable')
  })

  it('encodes the delay-state read that AC4 turns on', () => {
    const data = encodeFunctionData({
      abi: assetManagerAbi,
      functionName: 'directMintingDelayState',
      args: [`0x${'33'.repeat(32)}`],
    })
    expect(data).toMatch(/^0x[0-9a-f]+$/)
  })

  it('orders the delay-state enum as the contract declares it', () => {
    // directMintingDelayState returns a uint8 index into this list.
    expect(DIRECT_MINTING_DELAY_STATES[0]).toBe('NotDelayed')
    expect(DIRECT_MINTING_DELAY_STATES[1]).toBe('Delayed')
    expect(DIRECT_MINTING_DELAY_STATES[2]).toBe('Released')
  })

  it('exposes the payment address getter the XRPL handoff needs', () => {
    expect(
      getAbiItem({ abi: assetManagerAbi, name: 'directMintingPaymentAddress' }),
    ).toBeDefined()
  })
})

describe('events', () => {
  it('decodes DirectMintingExecuted into its exact fee breakdown', () => {
    const event = getAbiItem({ abi: assetManagerAbi, name: 'DirectMintingExecuted' })
    expect(event).toBeDefined()
    const topics = encodeEventTopics({
      abi: assetManagerAbi,
      eventName: 'DirectMintingExecuted',
    })
    const decoded = decodeEventLog({
      abi: assetManagerAbi,
      eventName: 'DirectMintingExecuted',
      topics: topics as [`0x${string}`],
      data: encodeFunctionData({
        abi: [
          {
            type: 'function',
            name: 'x',
            inputs: event!.inputs,
            outputs: [],
            stateMutability: 'view',
          },
        ],
        functionName: 'x',
        args: [
          `0x${'33'.repeat(32)}`,
          '0x1234567890abcdef1234567890abcdef12345678',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          249_500_000n,
          400_000n,
          100_000n,
        ],
      }).replace(/^0x[0-9a-f]{8}/, '0x') as `0x${string}`,
    })
    const args = decoded.args as unknown as {
      mintedAmountUBA: bigint
      mintingFeeUBA: bigint
      executorFeeUBA: bigint
    }
    // The three numbers MintFXRP must show separately, never as one total.
    expect(args.mintedAmountUBA).toBe(249_500_000n)
    expect(args.mintingFeeUBA).toBe(400_000n)
    expect(args.executorFeeUBA).toBe(100_000n)
  })

  it('carries the honest below-minimum event as its own outcome', () => {
    // Not an error string: a named protocol outcome the UI renders as such.
    expect(
      getAbiItem({ abi: assetManagerAbi, name: 'DirectMintingPaymentTooSmallForFee' }),
    ).toBeDefined()
  })

  it('distinguishes an ordinary delay from a large-minting delay', () => {
    expect(
      getAbiItem({ abi: assetManagerAbi, name: 'DirectMintingDelayed' }),
    ).toBeDefined()
    expect(
      getAbiItem({ abi: assetManagerAbi, name: 'LargeDirectMintingDelayed' }),
    ).toBeDefined()
  })
})

// `as const` matters: these are literal ABI member names, so a typo is a
// compile error rather than a test that quietly asserts undefined is undefined.
const QUOTE_READS = [
  'getDirectMintingFeeBIPS',
  'getDirectMintingMinimumFeeUBA',
  'getDirectMintingExecutorFeeUBA',
  'getDirectMintingLargeMintingThresholdUBA',
  'getDirectMintingLargeMintingDelaySeconds',
  'getDirectMintingOthersCanExecuteAfterSeconds',
  'lotSize',
  'assetMintingDecimals',
  'mintingPaused',
  'emergencyPaused',
] as const

describe('quote inputs', () => {
  it.each(QUOTE_READS)('reads %s', (name) => {
    expect(getAbiItem({ abi: assetManagerAbi, name })).toBeDefined()
  })
})

describe('fasset token', () => {
  it('reads the symbol from the chain rather than assuming FXRP', () => {
    expect(getAbiItem({ abi: fassetAbi, name: 'symbol' })).toBeDefined()
    expect(getAbiItem({ abi: fassetAbi, name: 'decimals' })).toBeDefined()
  })

  it('encodes a balance read', () => {
    expect(
      encodeFunctionData({
        abi: fassetAbi,
        functionName: 'balanceOf',
        args: ['0x1234567890abcdef1234567890abcdef12345678'],
      }),
    ).toMatch(/^0x[0-9a-f]+$/)
  })
})
