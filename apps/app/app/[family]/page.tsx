import { notFound } from 'next/navigation'
import { SwapPanel } from '../../components/panels/swap-panel'
import { Unbuilt } from '../../components/unbuilt'
import { FAMILIES, familyById } from '../../lib/families'

export function generateStaticParams() {
  return FAMILIES.map((family) => ({ family: family.id }))
}

export default async function FamilyPage({ params }: { params: Promise<{ family: string }> }) {
  const { family: id } = await params
  const family = familyById(id)
  if (!family) notFound()
  if (family.status.kind === 'unbuilt') return <Unbuilt family={family} />
  if (family.id === 'swap') return <SwapPanel />
  // The remaining families are wired in later plans. Until then the panel states
  // the family it is, and claims nothing about it.
  return <h1>{family.label}</h1>
}
