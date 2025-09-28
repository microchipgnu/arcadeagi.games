
import { Hono } from "hono"
import { cors } from "hono/cors"
import { createMcpPaidHandler } from "mcpay/handler"
import { createUIResource } from "@mcp-ui/server"
import { Buffer } from "node:buffer"
import { Redis } from "@upstash/redis"

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

let meta: CanvasMeta = {
    width: 10,
    height: 10,
    palette: DEFAULT_PALETTE.slice(),
}

// pixels store palette index per cell (palette index)
let pixels = new Uint8Array(meta.width * meta.height)

// -----------------------------
// RNG with serializable state
// -----------------------------
type RngState = { a: number; b: number; c: number; d: number }

function createRngFromSeed(seed: number): { rng: () => number; state: RngState } {
	// sfc32 seeded deterministically from a single seed
	const state: RngState = {
		a: (seed >>> 0) || 1,
		b: (seed * 48271 >>> 0) || 2,
		c: (seed * 279470273 >>> 0) || 3,
		d: (seed * 4294967291 >>> 0) || 4,
	}
	const rng = () => {
		state.a >>>= 0; state.b >>>= 0; state.c >>>= 0; state.d >>>= 0
		let t = (state.a + state.b) | 0
		state.a = state.b ^ (state.b >>> 9)
		state.b = (state.c + (state.c << 3)) | 0
		state.c = (state.c << 21) | (state.c >>> 11)
		state.d = (state.d + 1) | 0
		t = (t + state.d) | 0
		state.c = (state.c + t) | 0
		return (t >>> 0) / 4294967296
	}
	return { rng, state }
}

function createRngFromState(state: RngState): () => number {
	return () => {
		state.a >>>= 0; state.b >>>= 0; state.c >>>= 0; state.d >>>= 0
		let t = (state.a + state.b) | 0
		state.a = state.b ^ (state.b >>> 9)
		state.b = (state.c + (state.c << 3)) | 0
		state.c = (state.c << 21) | (state.c >>> 11)
		state.d = (state.d + 1) | 0
		t = (t + state.d) | 0
		state.c = (state.c + t) | 0
		return (t >>> 0) / 4294967296
	}
}

const getPayer = (extra: any) => {
    const paymentMeta = extra._meta?.["x402/payment"];
    if (paymentMeta) {
        try {
            const decoded = JSON.parse(Buffer.from(paymentMeta as string, 'base64').toString());
            console.log("Payment metadata:", decoded);
            
            // Extract who paid what from the payment information
            if (decoded.payload?.authorization) {
                const auth = decoded.payload.authorization;
                const payer = auth.from;
                const recipient = auth.to;
                const amount = auth.value;
                
                console.log(`Payment: ${payer} paid ${amount} to ${recipient}`);
                
                // Store or use the payment information as needed
                return payer; // Set the agent ID to the payer
            }
        } catch (error) {
            console.error("Failed to decode payment metadata:", error);
        }
    }
}

function normalizeAgentId(id: string | null | undefined): string {
    const s = id != null ? String(id) : ""
    return s.trim().toLowerCase() || "anonymous"
}

let currentAgentId = "anonymous"
function resolveAgentId(extra: any, fallbackId = "anonymous"): string {
    const payer = getPayer(extra)
    const id = normalizeAgentId(payer || fallbackId)
    return id
}

function resizeCanvas(width: number, height: number) {
    meta = { ...meta, width, height }
    pixels = new Uint8Array(width * height)
}

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

export async function getCanvas(): Promise<CanvasState> {
    const b64 = Buffer.from(pixels).toString("base64")
    return { meta, pixelsBase64: b64 }
}

export async function getGrid(): Promise<string[][]> {
    const grid: string[][] = []
    for (let y = 0; y < meta.height; y++) {
        const row: string[] = []
        for (let x = 0; x < meta.width; x++) {
            const idx = y * meta.width + x
            const cIdx = pixels[idx] ?? 0
            row.push(meta.palette[cIdx] || "#000000")
        }
        grid.push(row)
    }
    return grid
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
    if (x < 0 || y < 0 || x >= meta.width || y >= meta.height) return { ok: true }
    const idx = y * meta.width + x
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
        if (x < 0 || y < 0 || x >= meta.width || y >= meta.height) continue
        const idx = y * meta.width + x
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

type EpisodeRules = {
    wrapAround: boolean
    badFoodChance: number
    growthFactor: 1 | 2 | 3
    vision: number | "full"
    obstacleDensity: number
}

type EpisodeStats = {
    rewardTotal: number
    foodSpawned: number
    foodEaten: number
    steps: number
}

type SnakeGame = {
    snake: Point[]
    dir: Direction
    food: Point & { bad: boolean }
    obstacles: Set<string>
    alive: boolean
    turn: number
    pendingGrowth: number
    rules: EpisodeRules
    seed: number
    stats: EpisodeStats
    rng: () => number
    rngState: RngState
}

let game: SnakeGame | null = null
const GAME_ID = "snakepp"

// Upstash Redis (leaderboard)
const leaderboardKey = "snakepp:leaderboard"
const agentsSetKey = "snakepp:agents"
function createRedis(): Redis | null {
    try {
        // Prefer fromEnv when available
        // @ts-ignore - types might not include fromEnv in older versions
        if (typeof (Redis as any).fromEnv === "function") {
            return (Redis as any).fromEnv()
        }
        const url = process.env.UPSTASH_REDIS_REST_URL
        const token = process.env.UPSTASH_REDIS_REST_TOKEN
        if (url && token) return new Redis({ url, token })
        return null
    } catch {
        return null
    }
}
const redis: Redis | null = createRedis()
const memoryLeaderboard = new Map<string, number>()

// In-memory fallback for episode state (for local dev if Redis is not configured)
type SerializedSnakeGame = {
	snake: Point[]
	dir: Direction
	food: { x: number; y: number; bad: boolean }
	obstacles: string[]
	alive: boolean
	turn: number
	pendingGrowth: number
	rules: EpisodeRules
	seed: number
	stats: EpisodeStats
	rngState: RngState
}

type PersistedEpisodeState = {
	meta: CanvasMeta
	pixelsBase64: string
	game: SerializedSnakeGame
}

const memoryAgentStates = new Map<string, PersistedEpisodeState>()

function episodeKey(agentId: string): string {
	return `snakepp:episode:agent:${agentId}`
}

function serializeGame(g: SnakeGame): SerializedSnakeGame {
	return {
		snake: g.snake,
		dir: g.dir,
		food: { x: g.food.x, y: g.food.y, bad: g.food.bad },
		obstacles: Array.from(g.obstacles),
		alive: g.alive,
		turn: g.turn,
		pendingGrowth: g.pendingGrowth,
		rules: g.rules,
		seed: g.seed,
		stats: g.stats,
		rngState: g.rngState,
	}
}

function deserializeGame(s: SerializedSnakeGame): SnakeGame {
	const rng = createRngFromState(s.rngState)
	return {
		snake: s.snake,
		dir: s.dir,
		food: { x: s.food.x, y: s.food.y, bad: s.food.bad },
		obstacles: new Set<string>(s.obstacles),
		alive: s.alive,
		turn: s.turn,
		pendingGrowth: s.pendingGrowth,
		rules: s.rules,
		seed: s.seed,
		stats: s.stats,
		rng,
		rngState: s.rngState,
	}
}

async function saveAgentEpisode(agentId: string, g: SnakeGame): Promise<void> {
	const state: PersistedEpisodeState = {
		meta,
		pixelsBase64: Buffer.from(pixels).toString("base64"),
		game: serializeGame(g),
	}
	if (redis) {
		try {
			await redis.hset(episodeKey(agentId), {
				meta: JSON.stringify(state.meta),
				pixelsBase64: state.pixelsBase64,
				game: JSON.stringify(state.game),
				updatedAt: String(Date.now()),
			})
			return
		} catch {
			// fall back to memory
		}
	}
	memoryAgentStates.set(agentId, state)
}

async function loadAgentEpisode(agentId: string): Promise<PersistedEpisodeState | null> {
	if (redis) {
		try {
			const row = await redis.hgetall<Record<string, string>>(episodeKey(agentId))
			if (row && row.meta && row.pixelsBase64 && row.game) {
				return {
					meta: JSON.parse(row.meta) as CanvasMeta,
					pixelsBase64: row.pixelsBase64,
					game: JSON.parse(row.game) as SerializedSnakeGame,
				}
			}
		} catch {
			// ignore and try memory
		}
	}
	return memoryAgentStates.get(agentId) ?? null
}

// Payments log (overall table)
const paymentsAllListKey = "payments:all"
const paymentsByGameListKey = `payments:game:${GAME_ID}`

async function logPaymentFromExtra(extra: any, toolName: string): Promise<void> {
	if (!redis) return
	try {
		const paymentMeta = extra?._meta?.["x402/payment"]
		if (!paymentMeta) return
		const decodedRaw = JSON.parse(Buffer.from(paymentMeta as string, "base64").toString())
		const auth = decodedRaw?.payload?.authorization ?? {}
		const payer = auth.from ?? null
		const recipient = auth.to ?? null
		const amount = auth.value ?? null
		const asset = auth.asset ?? decodedRaw?.asset ?? null
		const chain = auth.chain ?? auth.chainId ?? decodedRaw?.chainId ?? null
		const txHash = decodedRaw?.txHash ?? decodedRaw?.transactionHash ?? auth?.hash ?? null
		const now = Date.now()
		const id = String(txHash ?? `${now}-${Math.random().toString(36).slice(2, 10)}`)

		// Store a hash for quick querying
		await redis.hset(`payments:${id}`,
			{
				id,
				at: String(now),
				gameId: GAME_ID,
				tool: toolName,
				payer: payer ? String(payer) : "",
				recipient: recipient ? String(recipient) : "",
				amount: amount != null ? String(amount) : "",
				asset: asset != null ? String(asset) : "",
				chain: chain != null ? String(chain) : "",
				txHash: txHash != null ? String(txHash) : "",
				raw: JSON.stringify(decodedRaw),
			}
		)
		// Append to overall and per-game lists (newest first)
		await redis.lpush(paymentsAllListKey, id)
		await redis.lpush(paymentsByGameListKey, id)
	} catch {
		// ignore logging failures
	}
}

type PaymentRow = {
    id: string
    at: string
    gameId: string
    tool: string
    payer: string
    recipient: string
    amount: string
    asset: string
    chain: string
    txHash: string
    raw: string
}

async function getPaymentsByGame(gameId: string, limit = 50): Promise<PaymentRow[]> {
    if (!redis) return []
    try {
        const ids = await redis.lrange(`payments:game:${gameId}`, 0, limit - 1)
        if (!ids || ids.length === 0) return []
        const results: PaymentRow[] = []
        for (const id of ids) {
            const row = await redis.hgetall<Record<string, string>>(`payments:${id}`)
            if (!row) continue
            results.push({
                id: row.id ?? id,
                at: row.at ?? "",
                gameId: row.gameId ?? gameId,
                tool: row.tool ?? "",
                payer: row.payer ?? "",
                recipient: row.recipient ?? "",
                amount: row.amount ?? "",
                asset: row.asset ?? "",
                chain: row.chain ?? "",
                txHash: row.txHash ?? "",
                raw: row.raw ?? "",
            })
        }
        return results
    } catch {
        return []
    }
}

async function recordEpisodeResult(agentId: string, stats: EpisodeStats) {
    const score = stats.rewardTotal
    if (redis) {
        try {
            await redis.zincrby(leaderboardKey, score, agentId)
            await redis.sadd(agentsSetKey, agentId)
            await redis.hincrby(`snakepp:agent:${agentId}`, "episodes", 1)
            await redis.hincrby(`snakepp:agent:${agentId}`, "totalReward", score)
            await redis.hincrby(`snakepp:agent:${agentId}`, "totalSteps", stats.steps)
            await redis.hincrby(`snakepp:agent:${agentId}`, "foodEaten", stats.foodEaten)
            await redis.hincrby(`snakepp:agent:${agentId}`, "foodSpawned", stats.foodSpawned)
        } catch {
            // fall back silently
            const prev = memoryLeaderboard.get(agentId) ?? 0
            memoryLeaderboard.set(agentId, prev + score)
        }
    } else {
        const prev = memoryLeaderboard.get(agentId) ?? 0
        memoryLeaderboard.set(agentId, prev + score)
    }
}

async function getTopLeaderboard(n = 10): Promise<{ agentId: string; score: number }[]> {
    if (redis) {
        try {
            // zrange with rev + scores
            const rows = await (redis as any).zrange(leaderboardKey, 0, n - 1, { withScores: true, rev: true })
            // Upstash returns an array alternating member/score or array of {member, score}
            if (Array.isArray(rows)) {
                if (rows.length > 0 && typeof rows[0] === "object" && rows[0] && "member" in (rows[0] as any)) {
                    return (rows as any[]).map((r: any) => ({ agentId: r.member, score: Number(r.score) }))
                }
                const out: { agentId: string; score: number }[] = []
                for (let i = 0; i < rows.length; i += 2) {
                    const member = String(rows[i])
                    const score = Number(rows[i + 1])
                    out.push({ agentId: member, score })
                }
                return out
            }
        } catch {
            // ignore
        }
    }
    // memory fallback
    return Array.from(memoryLeaderboard.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([agentId, score]) => ({ agentId, score }))
}

function seededRandom(seed: number) {
    // sfc32
    let a = (seed >>> 0) || 1
    let b = (seed * 48271 >>> 0) || 2
    let c = (seed * 279470273 >>> 0) || 3
    let d = (seed * 4294967291 >>> 0) || 4
    return function () {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0
        let t = (a + b) | 0
        a = b ^ (b >>> 9)
        b = (c + (c << 3)) | 0
        c = (c << 21) | (c >>> 11)
        d = (d + 1) | 0
        t = (t + d) | 0
        c = (c + t) | 0
        return (t >>> 0) / 4294967296
    }
}

function spawnFood(rng: () => number, obstacles: Set<string>, snake: Point[], rules: EpisodeRules): Point & { bad: boolean } {
    const occ = new Set<string>([...obstacles, ...snake.map((p) => `${p.x},${p.y}`)])
    // oversample attempts
    for (let i = 0; i < 2000; i++) {
        const x = Math.floor(rng() * meta.width)
        const y = Math.floor(rng() * meta.height)
        const key = `${x},${y}`
        if (!occ.has(key)) {
            const bad = rng() < rules.badFoodChance
            return { x, y, bad }
        }
    }
    // fallback
    return { x: 0, y: 0, bad: false }
}

type ObservationGridCell = 0 | 1 | 2 | 3 | 4 // empty, snake, head, food, obstacle


async function drawGame(g: SnakeGame, agentId: string) {
    const bgColor = "#000000"
    const bodyColor = "#00FF00"
    const headColor = "#FFFF00"
    const foodGoodColor = "#FF0000"
    const foodBadColor = "#FF00FF"
    const obstacleColor = "#444444"

    const updates: { x: number; y: number; color: string }[] = []

    // Fill background first
    for (let y = 0; y < meta.height; y++) {
        for (let x = 0; x < meta.width; x++) {
            updates.push({ x, y, color: bgColor })
        }
    }

    // Obstacles
    for (const key of g.obstacles) {
        const [sx, sy] = key.split(",")
        const x = Number(sx)
        const y = Number(sy)
        updates.push({ x, y, color: obstacleColor })
    }

    // Food
    updates.push({ x: g.food.x, y: g.food.y, color: g.food.bad ? foodBadColor : foodGoodColor })

    // Snake segments (head last so it overwrites body/bg)
    for (let i = 0; i < g.snake.length; i++) {
        const segment = g.snake[i]
        if (!segment) continue
        updates.push({ x: segment.x, y: segment.y, color: i === g.snake.length - 1 ? headColor : bodyColor })
    }

    // Apply all updates and record as a single event for this turn
    await setPixels({ updates, source: `agent:${agentId}:turn:${g.turn}` })
}

function advance(g: SnakeGame, nextDir: Direction): SnakeGame {
    // Prevent reversing into self directly in one step
    const dir = (() => {
        const opposite: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" }
        if (g.snake.length > 1 && nextDir === opposite[g.dir]) return g.dir
        return nextDir
    })()

    if (g.snake.length === 0) {
        return { ...g, alive: false, dir, turn: g.turn + 1 }
    }
    const head = g.snake[g.snake.length - 1]
    if (!head) {
        return { ...g, alive: false, dir, turn: g.turn + 1 }
    }
    const delta: Record<Direction, Point> = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }
    let next = { x: head.x + delta[dir].x, y: head.y + delta[dir].y }

    // Wrap-around or wall collision
    if (g.rules.wrapAround) {
        next.x = (next.x + meta.width) % meta.width
        next.y = (next.y + meta.height) % meta.height
    } else {
        if (next.x < 0 || next.y < 0 || next.x >= meta.width || next.y >= meta.height) {
            // death penalty
            const stats = { ...g.stats, steps: g.stats.steps + 1, rewardTotal: g.stats.rewardTotal - 1 }
            return { ...g, alive: false, dir, turn: g.turn + 1, stats }
        }
    }

    // Will we eat on this move?
    const willEat = next.x === g.food.x && next.y === g.food.y

    // Check obstacles
    if (g.obstacles.has(`${next.x},${next.y}`)) {
        const stats = { ...g.stats, steps: g.stats.steps + 1, rewardTotal: g.stats.rewardTotal - 1 }
        return { ...g, alive: false, dir, turn: g.turn + 1, stats }
    }

    // Check self collision (allow moving into the current tail cell if it will move)
    const bodySet = new Set(g.snake.map((p) => `${p.x},${p.y}`))
    if (!willEat && g.snake.length > 0 && g.pendingGrowth === 0) {
        const tail = g.snake[0]
        if (tail) bodySet.delete(`${tail.x},${tail.y}`)
    }
    if (bodySet.has(`${next.x},${next.y}`)) {
        const stats = { ...g.stats, steps: g.stats.steps + 1, rewardTotal: g.stats.rewardTotal - 1 }
        return { ...g, alive: false, dir, turn: g.turn + 1, stats }
    }

    // Move
    let newSnake = g.snake.slice()
    if (g.pendingGrowth === 0) {
        newSnake = newSnake.slice(1)
    } else {
        // consume one growth unit
        // growth means we do not remove the tail this turn
    }
    newSnake.push(next)

    // Food and growth
    let newFood = g.food
    let pendingGrowth = g.pendingGrowth
    let alive = true
    let stats = { ...g.stats }
    stats.steps += 1
    if (g.pendingGrowth > 0) {
        pendingGrowth = Math.max(0, pendingGrowth - 1)
    }
    let rewardDelta = 0
    if (willEat) {
        stats.foodEaten += g.food.bad ? 0 : 1
        if (g.food.bad) {
            // poison → death, penalty
            alive = false
            rewardDelta -= 1
        } else {
            rewardDelta += 1
            pendingGrowth += g.rules.growthFactor
            // spawn new food
            newFood = spawnFood(g.rng, g.obstacles, newSnake, g.rules)
            stats.foodSpawned += 1
        }
    }
    stats.rewardTotal += rewardDelta

    return { ...g, snake: newSnake, dir, food: newFood, alive, turn: g.turn + 1, pendingGrowth, stats }
}

export async function getOrInitGame(): Promise<SnakeGame> {
    if (game) return game
    await initEpisode()
    return game as unknown as SnakeGame
}

async function initEpisode(params?: { seed?: number; gridSize?: [number, number] }, agentId?: string) {
    const seed = params?.seed ?? Date.now() >>> 0
    const { rng, state: rngState } = createRngFromSeed(seed)
    const width = params?.gridSize?.[0] ?? (8 + Math.floor(rng() * 13)) // 8..20
    const height = params?.gridSize?.[1] ?? (8 + Math.floor(rng() * 13))
    resizeCanvas(width, height)

    const gChoices = [1, 2, 3] as const
    const rules: EpisodeRules = {
        wrapAround: rng() < 0.5,
        badFoodChance: rng() * 0.3,
        growthFactor: gChoices[Math.floor(rng() * gChoices.length)] as 1 | 2 | 3,
        vision: rng() < 0.5 ? "full" : 3,
        obstacleDensity: rng() * 0.1,
    }

    // initial snake length 2
    const startX = Math.floor(rng() * Math.max(2, width - 2))
    const startY = Math.floor(rng() * Math.max(2, height - 2))
    const dirs: Direction[] = ['up', 'down', 'left', 'right']
    const startDir = dirs[Math.floor(rng() * dirs.length)] as Direction
    const delta: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
    const second: Point = { x: startX + delta[startDir].x, y: startY + delta[startDir].y }
    const snake: Point[] = [
        { x: startX, y: startY },
        { x: Math.max(0, Math.min(width - 1, second.x)), y: Math.max(0, Math.min(height - 1, second.y)) },
    ]
    // obstacles
    const obstacles = new Set<string>()
    const cells = width * height
    const maxObstacles = Math.floor(cells * rules.obstacleDensity)
    for (let i = 0; i < maxObstacles; i++) {
        const x = Math.floor(rng() * width)
        const y = Math.floor(rng() * height)
        const key = `${x},${y}`
        if (snake.some((p) => p.x === x && p.y === y)) continue
        obstacles.add(key)
    }

    const f = spawnFood(rng, obstacles, snake, rules)
    const stats: EpisodeStats = { rewardTotal: 0, foodSpawned: 1, foodEaten: 0, steps: 0 }
    const start: SnakeGame = {
        snake,
        dir: startDir,
        food: f,
        obstacles,
        alive: true,
        turn: 0,
        pendingGrowth: 0,
        rules,
        seed,
        stats,
        rng,
        rngState,
    }
    game = start
    await drawGame(game, agentId ?? "anonymous")
    await saveAgentEpisode(agentId ?? "anonymous", game)
}

export async function stepGame(direction: Direction, agentId: string): Promise<SnakeGame> {
    // Always hydrate from storage for serverless statelessness
    const loaded = await loadAgentEpisode(agentId)
    if (loaded) {
        meta = loaded.meta
        pixels = new Uint8Array(Buffer.from(loaded.pixelsBase64, "base64"))
        game = deserializeGame(loaded.game)
    } else {
        await initEpisode(undefined, agentId)
    }
    let current = game as SnakeGame
    // If previous episode already ended, return the final state without auto-restart
    if (!current.alive) {
        return current
    }

    const next = advance(current, direction)

    if (!next.alive) {
        // Episode end → record and persist final board; do not auto-restart
        await recordEpisodeResult(agentId, next.stats)
        game = next
        await drawGame(next, agentId)
        await saveAgentEpisode(agentId, next)
        return next
    }

    game = next
    await drawGame(next, agentId)
    await saveAgentEpisode(agentId, next)
    return next
}

const app = new Hono()

// CORS for JSON endpoints
app.use("/leaderboard", cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
}))

// Public JSON leaderboard endpoint
app.get("/leaderboard", async (c) => {
    const top = await getTopLeaderboard(10)
    return c.json({ top })
})

app.use("/payments", cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
}))

// Public JSON payments endpoint
app.get("/payments", async (c) => {
    const payments = await getPaymentsByGame(GAME_ID)
    return c.json({ payments: payments.reverse() })
})

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
          const cIdx = pixels[idx] ?? 0;
          ctx.fillStyle = META.palette[cIdx] || '#000';
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
    </script>
  </body>
</html>`
}

const move = async (direction: "up" | "down" | "left" | "right", agentId: string) => {
    const g = await stepGame(direction, agentId)
    const grid = await getGrid()
    const payload = { turn: g.turn, alive: g.alive, dir: g.dir, grid }
    return payload
}

const handler = (recipient: string) => createMcpPaidHandler(
    (server) => {

        server.paidTool(
            "start", 
            "Start a new Snake++ episode", 
            "$0.001",
            {}, 
            {},
            async (_, extra) => {
                const agentId = resolveAgentId(extra)
                await logPaymentFromExtra(extra, "start")

                // start fresh episode each time start is called
            await initEpisode(undefined, agentId)
            const g = await getOrInitGame()
            const uri = (`ui://place/${agentId}`) as `ui://${string}`;

            const state = await getCanvas()
            const grid = await getGrid()
            const payload = { turn: g.turn, alive: g.alive, dir: g.dir, grid }

            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource, { type: 'text', text: JSON.stringify(payload) }] } as const;
        })

		server.paidTool(
			"reset", 
			"Reset and start a new episode", 
			"$0.001",
			{}, 
			{},
            async (_, extra) => {
            const agentId = resolveAgentId(extra)
            await logPaymentFromExtra(extra, "reset")
            await initEpisode(undefined, agentId)
            const g = await getOrInitGame()
            const state = await getCanvas()
            const grid = await getGrid()
            const payload = { turn: g.turn, alive: g.alive, dir: g.dir, grid }
            const html = renderCanvasHtml(state)
            const resource = createUIResource({
                uri: `ui://place/${agentId}`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource, { type: 'text', text: JSON.stringify(payload) }] } as const;
        })

        server.tool(
            "leaderboard", 
            "Get top 10 leaderboard", 
            {}, 
            async () => {
            const top = await getTopLeaderboard(10)
            const html = `<!doctype html><html><body><pre>${top.map((r, i) => `${i + 1}. ${r.agentId} - ${r.score}`).join("\n")}</pre></body></html>`
            const resource = createUIResource({ uri: `ui://place`, content: { type: 'rawHtml', htmlString: html }, encoding: 'text' })
            return { content: [resource] } as const
        })

		server.paidTool(
			"up", 
			"Advance one turn moving up", 
			"$0.001",
			{}, 
			{},
            async (_, extra) => {
            const agentId = resolveAgentId(extra)
            await logPaymentFromExtra(extra, "up")
            const payload = await move("up", agentId)
            const state = await getCanvas()
            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri: `ui://place/${agentId}`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource, { type: 'text', text: JSON.stringify(payload) }] } as const;
        })

		server.paidTool(
			"down", 
			"Advance one turn moving down", 
			"$0.001",
			{}, 
			{},
            async (_, extra) => {
            const agentId = resolveAgentId(extra)
            await logPaymentFromExtra(extra, "down")
            const payload = await move("down", agentId)
            const state = await getCanvas()
            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri: `ui://place/${agentId}`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
			return { content: [resource, { type: 'text', text: JSON.stringify(payload) }] } as const;
		})

		server.paidTool(
			"left", 
			"Advance one turn moving left", 
			"$0.001",
			{}, 
			{},
            async (_, extra) => {
            const agentId = resolveAgentId(extra)
            await logPaymentFromExtra(extra, "left")
            const payload = await move("left", agentId)
            const state = await getCanvas()
            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri: `ui://place/${agentId}`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
            return { content: [resource, { type: 'text', text: JSON.stringify(payload) }] } as const;
        })

		server.paidTool(
			"right", 
			"Advance one turn moving right", 
			"$0.001",
			{}, 
			{},
            async (_, extra) => {
            const agentId = resolveAgentId(extra)
            await logPaymentFromExtra(extra, "right")
            const payload = await move("right", agentId)
            const state = await getCanvas()
            const html = renderCanvasHtml(state)

            const resource = createUIResource({
                uri: `ui://place/${agentId}`,
                content: { type: 'rawHtml', htmlString: html },
                encoding: 'text',
            });
			return { content: [resource, { type: 'text', text: JSON.stringify(payload) }] } as const;
		})
    },
    {
        facilitator: {
            "url": "https://facilitator.payai.network",
        },
        recipient: {
            evm: {
                address: recipient,
                isTestnet: true
            }
        }
    },
    { serverInfo: { name: "snake-mcp", version: "1.0.0" } },
    {
        maxDuration: 60, 
        verboseLogs: true,

    },
)

app.all("*", async (c) => {
    const leaderboard = await getTopLeaderboard(1)
    if (!leaderboard[0]?.agentId) {
        return new Response("No leaderboard found", { status: 500 })
    }

    console.log("Leaderboard", leaderboard[0]?.agentId)
    return handler(leaderboard[0]?.agentId)(c.req.raw)
})

export default {
    port: 3010,
    fetch: app.fetch,
}