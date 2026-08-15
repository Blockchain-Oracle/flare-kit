import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

/**
 * Testing Library only registers its own auto-cleanup when vitest runs with
 * `globals: true`. It does not here, so without this every render stacks into
 * the same document and `getByRole` starts finding duplicates from earlier
 * tests — a failure that looks like a component bug and is not one.
 */
afterEach(cleanup)
