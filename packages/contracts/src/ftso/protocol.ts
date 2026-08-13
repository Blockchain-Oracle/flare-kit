/**
 * The FTSO protocol's identity on the shared Flare Systems Protocol machinery.
 *
 * FTSO and FDC publish their merkle roots on the *same* Relay, for the same
 * voting rounds, under different protocol ids. That is the whole reason
 * `@flarekit-dev/core`'s voting-round module is protocol-generic rather than
 * FDC-shaped: `Relay.isFinalized(100, r)` and `Relay.isFinalized(200, r)` are
 * two independent questions about one round, and both are live on both networks.
 */

/** The protocol id FTSO scaling merkle roots are published under. */
export const FTSO_PROTOCOL_ID = 100

