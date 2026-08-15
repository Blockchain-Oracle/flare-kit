import { redirect } from 'next/navigation'
import { LANDING_FAMILY_ID } from '../lib/families'

export default function Home() {
  redirect(`/${LANDING_FAMILY_ID}`)
}
