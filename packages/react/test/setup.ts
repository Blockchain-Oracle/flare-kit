import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Each test mounts a fresh provider. Without this they accumulate in one
// document and every query finds several matches. The same file exists in
// react-ui; this package needed it as soon as it had more than one rendering
// test.
afterEach(cleanup)
