import { useState } from 'react'
import Manifest from '../pages/Manifest'

export const useView = (view: string) => {
  const [component, setComponent] = useState<JSX.Element | null>(null)

  if (view === 'manifest') {
    setComponent(Manifest)
  }

  return component
}
