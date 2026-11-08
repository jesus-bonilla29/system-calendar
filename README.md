# Agenda

Aplicación de escritorio para Windows que planifica tu agenda, hace seguimiento, envía recordatorios y ejecuta acciones automáticas (por ejemplo, abrir los recursos de estudio de una tarea a su hora). Local-first: los datos viven en tu PC.

> Estado: **Fase 2 (recordatorios)**. Hoja de ruta completa en `docs/DECISIONS.md`.

## Requisitos

- Windows 10/11
- Node.js 22 o superior (ver `.nvmrc`) y npm
- Git

## Puesta en marcha

```bash
npm install
npx install-electron   # Electron 45 no descarga su binario al instalar
npm run dev
```

## Scripts

| Comando               | Qué hace                                         |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Abre la app en modo desarrollo (recarga en vivo) |
| `npm run build`       | Compila main, preload y renderer a `out/`        |
| `npm test`            | Ejecuta los tests (Vitest)                       |
| `npm run lint`        | ESLint                                           |
| `npm run format`      | Prettier (escribe cambios)                       |
| `npm run typecheck`   | Comprobación de tipos                            |
| `npm run db:generate` | Genera una migración tras cambiar `schema.ts`    |

## Qué puedes hacer ahora

- Crear, editar y borrar tareas, eventos y hábitos (clic en una hora de la rejilla o en un día del mes, o en **+ Nuevo**).
- Ver la agenda por **día, semana o mes**; las tareas sin fecha aparecen en el panel derecho.
- Repeticiones (diaria, semanal con días, mensual, anual, o regla RRULE avanzada), con opción de **omitir una ocurrencia**.
- Añadir **recordatorios** a cualquier ítem ("X minutos antes", con política de posponer). Al llegar la hora aparece una ventana de aviso con **Iniciar ahora / Posponer / Descartar**.
- La app sigue en la **bandeja del sistema** al cerrar la ventana y avisando; "Salir" desde el icono la cierra de verdad.
- Si el equipo estuvo suspendido o la app cerrada, al volver aparece **"Mientras no estabas"** con lo que se perdió.
- **Ajustes:** horas de silencio (23:00–07:00 por defecto) y arranque con Windows (solo en la versión instalada).

### Notificaciones de Windows

Además de la ventana de aviso se envía un toast nativo. Si no lo ves, activa las notificaciones en _Configuración › Sistema › Notificaciones_ (y revisa el modo No molestar). La ventana de aviso funciona aunque estén desactivadas.

## Estructura

```
src/main       Proceso principal (Node): base de datos, IPC, servicios, scheduler, bandeja y avisos
src/preload    Puente seguro entre main y la interfaz (contextBridge)
src/renderer   Interfaz React
src/shared     Tipos y contrato IPC compartidos
drizzle/       Migraciones SQL versionadas
docs/          Decisiones de arquitectura
```

## Datos

La base SQLite está en `%APPDATA%\agenda\agenda.db` (no en la carpeta del proyecto). Las migraciones se aplican solas al arrancar.

## Cambiar el esquema de datos

1. Edita `src/main/db/schema.ts`.
2. `npm run db:generate` crea una migración nueva en `drizzle/`.
3. Haz commit de la migración. Nunca edites una migración ya aplicada.

## Aviso sobre OneDrive

Si el proyecto está dentro de OneDrive, pausa la sincronización o excluye `node_modules` mientras desarrollas.
