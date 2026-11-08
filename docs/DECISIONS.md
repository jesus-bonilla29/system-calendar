# Decisiones de arquitectura

## Hoja de ruta

0. Fundamentos · 1. Agenda básica · 2. Recordatorios · 3. Paquetes de recursos · 4. Seguimiento (**MVP = 0 a 4**) · 5. Motor de reglas · 6. Google Calendar · 7. Planificador · 8. Pulido.

## Decisiones

### D1. Stack

Electron + React + Vite + TypeScript, SQLite (better-sqlite3) + Drizzle, rrule, React Flow, electron-builder. Build con `electron-vite`, que gestiona main/preload/renderer.

### D2. Seguridad del renderer

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP por cabecera (más permisiva solo en desarrollo para HMR), navegación y ventanas nuevas bloqueadas. La interfaz solo ve `window.api.invoke`.

### D3. IPC tipado y validado

`src/shared/ipc.ts` define el contrato (esquemas zod de petición y respuesta por canal). Main valida entrada y salida. `src/shared/channels.ts` lista los canales **sin dependencias** porque un preload con sandbox solo puede cargar `electron`; importar zod ahí rompe el preload.

### D4. Fechas y IDs

Fechas en milisegundos UTC (integer); las recurrencias guardan zona IANA aparte. IDs de texto (UUID). Evita ambigüedades con cambios de hora y facilita sincronizar con Google Calendar.

### D5. Esquema de datos

Todas las tablas del modelo existen desde la migración inicial. `items` incluye ya `estimated_minutes`, `due_at`, `priority` y `flexibility` para el planificador. `resource_packages` (1:1 con ítem) guarda `open_mode`; por defecto `auto` (abrir solo a la hora), configurable por tarea. La tabla de disparos del scheduler se añadirá en la Fase 2.

### D6. Ubicación de la base

`%APPDATA%\agenda\agenda.db` (userData de Electron), nunca en el proyecto ni en OneDrive. WAL y claves foráneas activadas. Migraciones al arrancar.

### D7. better-sqlite3 sin compilar

La versión 13 incluye binarios N-API precompilados para Windows: no requiere Visual Studio y el mismo binario funciona en Node (tests) y en Electron. Los scripts de instalación de npm 11 están bloqueados por defecto y no hace falta aprobarlos.

### D8. TypeScript 6

Se fija TypeScript en la serie 6 porque `typescript-eslint` aún no soporta la 7. Revisar al subir de versión.

### D9. Node de desarrollo

Se recomienda Node 22 LTS (`.nvmrc`); funciona también con Node 25 instalado en esta máquina.

### D10. Electron 45

Su paquete no descarga el binario al instalar; se hace con `npx install-electron` (documentado en el README).

## Fase 1: Agenda básica

### D11. Recurrencias con rrule y zona horaria

`rrule` trabaja con fechas "flotantes": se le pasa la hora de pared codificada como UTC y cada ocurrencia se convierte a instante real con `@date-fns/tz`. Así "10:00" sigue siendo las 10:00 al cambiar el horario de verano (tests con Madrid y Nueva York). La regla se guarda sin DTSTART: el inicio es `items.start_at`. Frecuencias de segundos y minutos no se admiten.

### D12. Excepciones y edición de series

Las excepciones son los instantes originales omitidos (`recurrences.exceptions`). En esta fase solo se puede editar la serie completa u omitir una ocurrencia; editar una sola ocurrencia (con sobrescrituras) queda para más adelante porque exige una tabla nueva. Si al editar cambia el inicio o la zona, las excepciones se descartan (ya no apuntarían a instantes válidos).

### D13. Estado de una serie

El estado (pendiente, completada…) es del ítem, no de cada ocurrencia. El seguimiento por ocurrencia (p. ej. un hábito completado hoy pero no ayer) se diseña en la Fase 4.

### D14. Calendario propio

Vistas día/semana/mes propias con date-fns (semana desde el lunes), sin FullCalendar: control total y sin licencias. Los eventos solapados se reparten en columnas (`lib/layout.ts`).

### D15. Validación en dos capas

Los esquemas zod de `src/shared/domain.ts` validan en el formulario y de nuevo en main antes de tocar la base. Las fechas se envían como milisegundos UTC.

## Fase 2: Recordatorios

### D16. Scheduler persistente por ticks cortos

Los disparos viven en `scheduled_triggers` (SQLite). No se usa un temporizador largo: un tick cada 15 s compara con el reloj real, así que suspensión, cambios manuales de hora y saltos de NTP se detectan solos. Cada 5 min (y al editar ítems) se reconcilia un horizonte de 48 h; la operación es idempotente (índice único recordatorio + ocurrencia).

### D17. Nada se pierde en silencio

Un aviso que vence con más de 2 min de retraso (app cerrada, suspensión, salto adelante) pasa a `missed`; uno que cae en horas de silencio, a `silenced`. Ambos aparecen en el diálogo "Mientras no estabas" hasta que el usuario los reconoce. Se persiste el último latido (`scheduler.lastTickAt`) para buscar lo vencido desde entonces (máx. 7 días atrás). Se recupera al arrancar y con los eventos `resume` y `unlock-screen` de `powerMonitor`. Si el reloj retrocede, los avisos ya dados no se repiten.

### D18. Aviso con ventana propia + toast nativo

En el equipo de desarrollo las notificaciones de Windows estaban desactivadas (`ToastEnabled = 0`) y Electron no soporta botones en toasts de Windows sin XML y activación por protocolo. Por fiabilidad el aviso principal es una ventana pequeña siempre visible con "Iniciar ahora", "Posponer N min" y "Descartar"; además se lanza un toast nativo sin botones. Si Windows rechaza el toast se registra en el log y el aviso sigue funcionando. Cerrar la ventana sin elegir cuenta como descartado.

### D19. Posponer

Cada recordatorio tiene política propia (minutos y máximo de veces). Posponer reutiliza la fila: vuelve a `pending` con nueva hora y `snoozeCount + 1`; la reconciliación respeta la hora pospuesta. Al llegar al máximo el botón se desactiva.

### D20. Ediciones y recordatorios

Al editar un ítem, los recordatorios se actualizan por posición para conservar sus IDs; el historial de avisos sobrevive (`reminder_id` pasa a null si el recordatorio se borra). Completar o cancelar un ítem, omitir una ocurrencia o quitar recordatorios elimina los avisos pendientes.

### D21. Bandeja, instancia única y autoarranque

Cerrar la ventana la oculta; la app sigue en la bandeja ("Salir" la cierra de verdad). Instancia única: abrir otra vez la app muestra la ventana existente. El arranque con Windows es opcional (desactivado por defecto), se activa en Ajustes y arranca con `--hidden`; solo está disponible en la versión instalada para no registrar `electron.exe` de desarrollo en el sistema. El icono (`resources/icon.png`) se genera con `scripts/make-icon.mjs`; el empaquetado de recursos queda para la Fase 8.
