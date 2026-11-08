import { useEffect, useState } from 'react'

export function App(): React.JSX.Element {
  const [pong, setPong] = useState('...')
  const [db, setDb] = useState('...')

  useEffect(() => {
    window.api
      .invoke('app:ping', { message: 'hola' })
      .then((r) => setPong(r.reply))
      .catch((e: unknown) => setPong(`error: ${String(e)}`))
    window.api
      .invoke('app:dbInfo', {})
      .then((r) => setDb(`${r.migrationsApplied} migración(es), ${r.tables.length} tablas`))
      .catch((e: unknown) => setDb(`error: ${String(e)}`))
  }, [])

  return (
    <main>
      <h1>Hola, Agenda</h1>
      <p>IPC: {pong}</p>
      <p>Base de datos: {db}</p>
    </main>
  )
}
