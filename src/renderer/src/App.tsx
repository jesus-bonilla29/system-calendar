import { useEffect, useState } from 'react'

export function App(): React.JSX.Element {
  const [pong, setPong] = useState('...')

  useEffect(() => {
    window.api
      .invoke('app:ping', { message: 'hola' })
      .then((r) => setPong(r.reply))
      .catch((e: unknown) => setPong(`error: ${String(e)}`))
  }, [])

  return (
    <main>
      <h1>Hola, Agenda</h1>
      <p>IPC: {pong}</p>
    </main>
  )
}
