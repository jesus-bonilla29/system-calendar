export interface Segment {
  key: string
  /** minutos desde las 00:00 del día */
  start: number
  end: number
}

export interface Placed extends Segment {
  col: number
  cols: number
}

/** Reparte segmentos solapados en columnas para que no se tapen entre sí. */
export function layoutSegments(segments: Segment[]): Placed[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || b.end - a.end)
  const placed: Placed[] = []
  let cluster: Placed[] = []
  let clusterEnd = -1

  const flush = (): void => {
    const cols = cluster.reduce((m, p) => Math.max(m, p.col + 1), 1)
    for (const p of cluster) p.cols = cols
    placed.push(...cluster)
    cluster = []
  }

  for (const seg of sorted) {
    if (cluster.length > 0 && seg.start >= clusterEnd) flush()
    const used = new Set(cluster.filter((p) => p.end > seg.start).map((p) => p.col))
    let col = 0
    while (used.has(col)) col++
    cluster.push({ ...seg, col, cols: 1 })
    clusterEnd = Math.max(clusterEnd, seg.end)
  }
  flush()
  return placed
}
