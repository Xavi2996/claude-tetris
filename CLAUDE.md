# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Arquitectura

Puntos clave para entender el flujo (no derivables de una lectura rápida del código):

- **Tablero**: matriz `ROWS × COLS` (20×10) donde cada celda es `0` (vacía) o un índice 1–7 que indexa en `COLORS`/`PIECES` para identificar a qué pieza pertenece.
- **Piezas**: matrices cuadradas fijas en `PIECES`. La rotación (`rotateCW`) transpone + invierte filas; no usa las tablas SRS estándar. `tryRotate` aplica *wall kicks* simples probando desplazamientos `[0, -1, 1, -2, 2]`.
- **Colisión** (`collide`) es la función central: la usan el movimiento lateral, la rotación, el soft/hard drop y el spawn para decidir si una posición es válida.
- **Game loop** (`loop`) se basa en `requestAnimationFrame`, acumulando `dt` en `dropAccum` hasta superar `dropInterval`; no hay lógica de framerate fijo.
- **Ciclo de vida de una pieza**: `spawn()` promueve `next` a `current` y genera la siguiente; si la nueva pieza colisiona al aparecer, dispara `endGame()`. `lockPiece()` (llamada al tocar fondo u otra pieza) hace `merge()` → `clearLines()` → `spawn()`.
Si se cambian `COLS`, `ROWS` o `BLOCK` en `game.js`, hay que ajustar también `width`/`height` del `<canvas id="board">` en `index.html` para que coincidan (`COLS × BLOCK` y `ROWS × BLOCK`).

## Idioma

El código (comentarios, README) y la UI están en español. Mantener ese idioma en textos visibles al usuario y comentarios nuevos.
