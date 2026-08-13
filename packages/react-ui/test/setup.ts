import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Each test renders a fresh widget. Without this they accumulate in one
// document and every query finds several matches.
afterEach(cleanup)
