import { CtaBand } from '../components/landing/cta-band'
import { Hero } from '../components/landing/hero'
import { PackageStrip } from '../components/landing/package-strip'
import { Principles } from '../components/landing/principles'
import { QuickstartTeaser } from '../components/landing/quickstart-teaser'

export default function Home() {
  return (
    <>
      <Hero />
      <PackageStrip />
      <QuickstartTeaser />
      <Principles />
      <CtaBand />
    </>
  )
}
