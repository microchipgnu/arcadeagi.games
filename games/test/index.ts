
import { Hono } from "hono"
import { createMcpHandler } from "mcpay/handler"
import { z } from "zod"
import { createUIResource } from "@mcp-ui/server"
import { Buffer } from "node:buffer"

export type CanvasMeta = {
    width: number
    height: number
    palette: string[]
}

export type CanvasState = {
    meta: CanvasMeta
    pixelsBase64: string
}

type PixelUpdate = { x: number; y: number; color: string; source: string }

export type CanvasEvent = {
    t: number
    updates: { x: number; y: number; color: string; source: string }[]
}

const DEFAULT_PALETTE = [
    "#000000", // 0 black
    "#FFFFFF", // 1 white
    "#00FF00", // 2 green
    "#FF0000", // 3 red
    "#0000FF", // 4 blue
    "#FFFF00", // 5 yellow
    "#FF00FF", // 6 magenta
    "#00FFFF", // 7 cyan
]

const WIDTH = 32
const HEIGHT = 24

const meta: CanvasMeta = {
    width: WIDTH,
    height: HEIGHT,
    palette: DEFAULT_PALETTE,
}

// pixels store palette index per cell
const pixels = new Uint8Array(WIDTH * HEIGHT)

// event log for replay
const events: CanvasEvent[] = []

function colorToIndex(color: string): number {
    const idx = meta.palette.indexOf(color)
    if (idx >= 0) return idx
    // fallback: if unknown, push into palette up to a limit
    if (meta.palette.length < 256) {
        meta.palette.push(color)
        return meta.palette.length - 1
    }
    return 0
}

function indexToColor(idx: number): string {
    return meta.palette[idx] ?? "#000000"
}

export async function getCanvas(): Promise<CanvasState> {
    const b64 = Buffer.from(pixels).toString("base64")
    return { meta, pixelsBase64: b64 }
}

export async function getCanvasEvents({ limit }: { limit?: number } = {}): Promise<CanvasEvent[]> {
    const slice = typeof limit === "number" ? events.slice(-limit) : events.slice()
    return slice
}

export async function setPixel(update: PixelUpdate): Promise<{ ok: true }>
export async function setPixel(
    update: PixelUpdate,
    recordEvent: boolean,
): Promise<{ ok: true }>
export async function setPixel(update: PixelUpdate, recordEvent = true): Promise<{ ok: true }> {
    const { x, y, color } = update
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return { ok: true }
    const idx = y * WIDTH + x
    const colorIdx = colorToIndex(color)
    pixels[idx] = colorIdx
    if (recordEvent) {
        events.push({ t: Date.now(), updates: [{ x, y, color, source: update.source }] })
    }
    return { ok: true }
}

export async function setPixels({ updates, source }: { updates: { x: number; y: number; color: string }[]; source: string }): Promise<{ ok: true }> {
    const applied: PixelUpdate[] = []
    for (const u of updates) {
        const { x, y, color } = u
        if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) continue
        const idx = y * WIDTH + x
        const cIdx = colorToIndex(color)
        pixels[idx] = cIdx
        applied.push({ x, y, color, source })
    }
    if (applied.length > 0) {
        events.push({ t: Date.now(), updates: applied })
    }
    return { ok: true }
}

export async function clearCanvas(color = "#000000"): Promise<void> {
    const idx = colorToIndex(color)
    pixels.fill(idx)
    events.push({ t: Date.now(), updates: [{ x: -1, y: -1, color, source: "system:clear" }] })
}

// Logging helper for observability parity
export async function logToolUsed(name: string, args: unknown): Promise<void> {
    void name
    void args
}

// Snake-specific helpers
export type Point = { x: number; y: number }
export type Direction = "up" | "down" | "left" | "right"

type SnakeGame = {
    snake: Point[]
    dir: Direction
    food: Point
    alive: boolean
    turn: number
}

let game: SnakeGame | null = null

function randomEmptyCell(occupied: Set<string>): Point {
    for (let i = 0; i < 1000; i++) {
        const x = Math.floor(Math.random() * WIDTH)
        const y = Math.floor(Math.random() * HEIGHT)
        const key = `${x},${y}`
        if (!occupied.has(key)) return { x, y }
    }
    return { x: 1, y: 1 }
}

function drawGame(g: SnakeGame) {
    const bgColor = "#000000"
    const bodyColor = "#00FF00"
    const headColor = "#FFFF00"
    const foodColor = "#FF0000"

    const updates: { x: number; y: number; color: string }[] = []

    // Fill background first
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            updates.push({ x, y, color: bgColor })
        }
    }

    // Food
    updates.push({ x: g.food.x, y: g.food.y, color: foodColor })

    // Snake segments (head last so it overwrites body/bg)
    for (let i = 0; i < g.snake.length; i++) {
        const segment = g.snake[i]
        if (!segment) continue
        updates.push({ x: segment.x, y: segment.y, color: i === g.snake.length - 1 ? headColor : bodyColor })
    }

    // Apply all updates and record as a single event for this turn
    void setPixels({ updates, source: `snake:turn:${g.turn}` })
}

function advance(g: SnakeGame, nextDir: Direction): SnakeGame {
    // Prevent reversing into self directly in one step
    const dir = (() => {
        const opposite: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" }
        if (g.snake.length > 1 && nextDir === opposite[g.dir]) return g.dir
        return nextDir
    })()

    if (g.snake.length === 0) {
        return { ...g, alive: false, dir: nextDir, turn: g.turn + 1 }
    }
    const head = g.snake[g.snake.length - 1]
    if (!head) {
        return { ...g, alive: false, dir: nextDir, turn: g.turn + 1 }
    }
    const delta: Record<Direction, Point> = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }
    const next = { x: head.x + delta[dir].x, y: head.y + delta[dir].y }

    // Check walls
    if (next.x < 0 || next.y < 0 || next.x >= WIDTH || next.y >= HEIGHT) {
        return { ...g, alive: false, dir, turn: g.turn + 1 }
    }

    // Check self collision
    const bodySet = new Set(g.snake.map((p) => `${p.x},${p.y}`))
    if (bodySet.has(`${next.x},${next.y}`)) {
        return { ...g, alive: false, dir, turn: g.turn + 1 }
    }

    // Move
    const newSnake = g.snake.slice(1)
    newSnake.push(next)

    // Food
    let newFood = g.food
    if (next.x === g.food.x && next.y === g.food.y) {
        // Grow: add a copy of tail at the beginning
        const tail = g.snake[0]
        newSnake.unshift(tail ?? next)
        // place new food
        const occ = new Set(newSnake.map((p) => `${p.x},${p.y}`))
        newFood = randomEmptyCell(occ)
    }

    return { snake: newSnake, dir, food: newFood, alive: true, turn: g.turn + 1 }
}

export function getOrInitGame(): SnakeGame {
    if (game) return game
    const start: SnakeGame = {
        snake: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }],
        dir: "right",
        food: { x: 12, y: 8 },
        alive: true,
        turn: 0,
    }
    game = start
    drawGame(game)
    return game
}

export function stepGame(direction: Direction): SnakeGame {
    const current = getOrInitGame()
    if (!current.alive) return current
    const next = advance(current, direction)
    game = next
    drawGame(next)
    return next
}






const app = new Hono()

function renderCanvasHtml(state: CanvasState): string {
    const metaJson = JSON.stringify(state.meta)
    const pixelsBase64 = state.pixelsBase64
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Canvas</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; }
      canvas { image-rendering: pixelated; display: block; }
    </style>
  </head>
  <body>
    <canvas id="place"></canvas>
    <script>
      const META = ${metaJson};
      const PIXELS_BASE64 = ${JSON.stringify(pixelsBase64)};
      const SCALE = 16;

      function b64ToBytes(b64) {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      }

      const pixels = b64ToBytes(PIXELS_BASE64);

      const canvas = document.getElementById('place');
      const ctx = canvas.getContext('2d');
      canvas.width = META.width * SCALE;
      canvas.height = META.height * SCALE;
      ctx.imageSmoothingEnabled = false;

      for (let y = 0; y < META.height; y++) {
        for (let x = 0; x < META.width; x++) {
          const idx = y * META.width + x;
          const cIdx = pixels[idx] || 0;
          ctx.fillStyle = META.palette[cIdx] || '#000';
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
    </script>
  </body>
</html>`
}

const move = async (direction: "up" | "down" | "left" | "right") => {
    const g = stepGame(direction)
    const state = await getCanvas()
    const payload = { turn: g.turn, alive: g.alive, dir: g.dir, state }

    return payload

}

const handler = createMcpHandler(
    (server) => {

        server.tool("start", "Start the snake game", {}, async () => {
            const g = getOrInitGame()
            console.log("START", g)
            const uri = (`ui://place`) as `ui://${string}`;

            const state = await getCanvas()

            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource] } as const;
        })

        server.tool("up", "Advance one turn moving up", {}, async () => {
            const g = await move("up")

            const state = await getCanvas()

            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri: `ui://place`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource] } as const;

            return { content: [resource] } as const;
        })

        server.tool("down", "Advance one turn moving down", {}, async () => {
            const g = await move("down")
            const state = await getCanvas()

            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri: `ui://place`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource] } as const;
        })

        server.tool("left", "Advance one turn moving left", {}, async () => {
            const g = await move("left")
            const state = await getCanvas()

            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri: `ui://place`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource] } as const;
        })

        server.tool("right", "Advance one turn moving right", {}, async () => {
            const g = await move("right")
            const state = await getCanvas()

            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri: `ui://place`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource] } as const;
        })
    },
    { serverInfo: { name: "snake-mcp", version: "1.0.0" } },
    {
        maxDuration: 60, 
        verboseLogs: true, 
    },
)

app.use("*", (c) => handler(c.req.raw))

export default {
    port: 3010,
    fetch: app.fetch,
}