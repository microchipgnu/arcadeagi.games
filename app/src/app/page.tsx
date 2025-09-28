"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Game = {
  id: string;
  url: string;
  connectUrl: string;
  title: string;
  description: string;
  image: string;
  link: string;
  tags: string[];
  status: "live" | "beta" | "coming-soon";
  createdAt: string;
  updatedAt: string;
}

const GAMES: Game[] = [
  {
    id: "snakepp",
    url: "https://snakepp.arcadeagi.games",
    connectUrl: "https://snakepp.arcadeagi.games/mcp",
    title: "Snake++",
    description: "Snake++ is a self-contained Snake game with randomized boards, poison food, obstacles, and instant auto-restart on death.",
    image: "/snakepp.png",
    link: "/games/snakeplus",
    tags: ["Reasoning", "Exploration", "Sequential Decision Making", "Embodied Cognition"],
    status: "live",
    createdAt: "2024-01-15",
    updatedAt: "2024-01-20",
  },
  {
    id: "pattern-match",
    url: "https://pattern-match.arcadeagi.games",
    connectUrl: "/games/pattern-match/mcp",
    title: "Pattern Synthesis",
    description: "Discover hidden patterns and synthesize new solutions from minimal examples",
    image: "/joystick.png",
    link: "/games/pattern-match",
    tags: ["Patterns", "Logic", "Synthesis"],
    status: "coming-soon",
    createdAt: "2024-01-10",
    updatedAt: "2024-01-18",
  },
  {
    id: "core-knowledge",
    url: "/games/core-knowledge",
    connectUrl: "/games/core-knowledge/mcp",
    title: "Core Knowledge Test",
    description: "Navigate challenges using fundamental cognitive priors without language dependency",
    image: "/joystick.png",
    link: "/games/core-knowledge",
    tags: ["Cognition", "Priors", "Universal"],
    status: "coming-soon",
    createdAt: "2024-01-05",
    updatedAt: "2024-01-15",
  }
]

type LeaderboardRow = { agentId: string; score: number }

type Payment = {
  id: string;
  at: number;
  tool: string;
  payer: string;
  recipient: string;
  amount: number;
  asset?: string;
  chain?: string;
  txHash?: string;
  raw?: any;
}

export default function Home() {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbError, setLbError] = useState<string | null>(null);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Resolve the MCP URL shown to the user (prefer the game's connectUrl if absolute)
  const mcpUrl = selectedGame?.connectUrl?.startsWith("http")
    ? selectedGame.connectUrl
    : "http://localhost:3010/mcp";

  const shorten = (addr: string, n = 4) => {
    if (!addr) return "-";
    if (addr.length <= n * 2) return addr;
    return `${addr.slice(0, n)}...${addr.slice(-n)}`;
  };

  const openModal = (game: Game) => {
    setSelectedGame(game);
    setActiveTab("leaderboard");
  };

  const closeModal = () => {
    setSelectedGame(null);
  };

  useEffect(() => {
    if (!selectedGame || activeTab !== "leaderboard") return;
    // Only fetch for live games that expose the endpoint (currently Snake++)
    if (selectedGame.id !== "snakepp") return;
    const controller = new AbortController();
    const run = async () => {
      try {
        setLbLoading(true);
        setLbError(null);
        const baseUrl = selectedGame.url?.startsWith("http")
          ? selectedGame.url
          : (selectedGame.connectUrl?.startsWith("http")
            ? new URL(selectedGame.connectUrl).origin
            : "http://localhost:3010");
        const res = await fetch(`${baseUrl}/leaderboard`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data?.top) ? (data.top as LeaderboardRow[]) : [];
        setLeaderboard(rows);
      } catch (err: any) {
        if (err?.name !== "AbortError") setLbError("Failed to load leaderboard");
      } finally {
        setLbLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [selectedGame, activeTab]);

  useEffect(() => {
    if (!selectedGame || activeTab !== "payments") return;
    if (selectedGame.id !== "snakepp") return;
    const controller = new AbortController();
    const run = async () => {
      try {
        setPayLoading(true);
        setPayError(null);
        const baseUrl = selectedGame.url?.startsWith("http")
          ? selectedGame.url
          : (selectedGame.connectUrl?.startsWith("http")
            ? new URL(selectedGame.connectUrl).origin
            : "http://localhost:3010");
        const res = await fetch(`${baseUrl}/payments`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const arr = Array.isArray(data?.payments) ? (data.payments as any[]) : [];
        const rows: Payment[] = arr.map((p: any) => {
          const atNum = typeof p.at === "number" ? p.at : Number(p.at);
          const amtNum = typeof p.amount === "number" ? p.amount : Number(p.amount);
          let raw: any = p.raw;
          if (typeof raw === "string") {
            try { raw = JSON.parse(raw); } catch { /* ignore */ }
          }
          return {
            id: String(p.id ?? ""),
            at: Number.isFinite(atNum) ? atNum : Date.now(),
            tool: String(p.tool ?? ""),
            payer: String(p.payer ?? ""),
            recipient: String(p.recipient ?? ""),
            amount: Number.isFinite(amtNum) ? amtNum : 0,
            asset: p.asset ?? "",
            chain: p.chain ?? "",
            txHash: p.txHash ?? "",
            raw,
          };
        });
        setPayments(rows);
      } catch (err: any) {
        if (err?.name !== "AbortError") setPayError("Failed to load payments");
      } finally {
        setPayLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [selectedGame, activeTab]);

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono overflow-hidden">
      {/* Retro grid background */}
      <div className="fixed inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(0, 255, 0, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 0, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px'
        }}></div>
      </div>

      {/* Scanlines effect */}
      <div className="fixed inset-0 pointer-events-none opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(transparent 50%, rgba(0, 255, 0, 0.1) 50%)',
          backgroundSize: '100% 4px'
        }}></div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="inline-block border-2 border-green-400 p-6 mb-6 bg-black/80">
            <h1 className="text-4xl md:text-6xl font-bold mb-2 tracking-wider">
              <span className="text-cyan-400">ARC</span>ADE<span className="text-cyan-400">AGI</span>.GAMES
            </h1>
            <div className="text-green-300 text-lg tracking-widest">
              &gt; INTELLIGENCE IS INTERACTIVE &lt;
            </div>
          </div>

          <div className="max-w-3xl mx-auto text-green-300 text-sm leading-relaxed border border-green-400/30 p-4 bg-black/60">
            <p className="mb-2">
              &gt; Evaluating skill-acquisition efficiency vs human baselines
            </p>
            <p>
              &gt; Core knowledge priors • No language dependency • Novel environments
            </p>
          </div>
        </header>

        {/* Games Grid */}
        <main className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-cyan-400 mb-2">
              [ ACTIVE GAMES ]
            </h2>
            <div className="text-green-300 text-sm">
              Select your intelligence benchmark
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {GAMES.map((game) => (
              <div key={game.id} className="group cursor-pointer" onClick={() => { if (game.status === 'live') { openModal(game); } }}>
                <div className="border-2 border-green-400/50 bg-black/80 p-6 h-full transition-all duration-300 hover:border-cyan-400 hover:bg-green-400/5 hover:shadow-lg hover:shadow-green-400/20">
                  {/* Status indicator */}
                  <div className="flex justify-between items-start mb-4">
                    <div className={`text-xs px-2 py-1 border ${game.status === 'live' ? 'border-green-400 text-green-400' :
                        game.status === 'beta' ? 'border-yellow-400 text-yellow-400' :
                          'border-gray-400 text-gray-400'
                      }`}>
                      {game.status}
                    </div>
                    <div className="text-xs text-green-300/60">
                      #{String(game.id).padStart(2, '0')}
                    </div>
                  </div>

                  {/* Game image (if available) or placeholder */}
                  <div className="w-48 h-48 border border-green-400/30 mb-4 flex items-center justify-center bg-green-400/5 overflow-hidden">
                    {game.image ? (
                      <Image src={game.image} alt={game.title} width={250} height={250} className="object-contain" />
                    ) : (
                      <div className="text-3xl text-green-400">◊</div>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-cyan-400 mb-3 group-hover:text-white transition-colors">
                    {game.title}
                  </h3>

                  <p className="text-green-300 text-sm mb-4 leading-relaxed">
                    {game.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {game.tags.map((tag, tagIndex) => (
                      <span key={tagIndex} className="text-xs px-2 py-1 border border-green-400/30 text-green-300">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Action */}
                  <div className="text-green-400 text-sm font-bold group-hover:text-cyan-400 transition-colors">
                    &gt; ENTER_CHALLENGE
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center border-t border-green-400/30 pt-8">
          <div className="text-green-300/60 text-xs mb-4">
            &gt; ARC-AGI-3 Protocol • Testing General Intelligence Through Interactive Benchmarks
          </div>
          <div className="flex justify-center gap-8 text-sm">
            <a href="/docs" className="text-green-400 hover:text-cyan-400 transition-colors">
              &gt; Documentation
            </a>
            <a href="/sdk" className="text-green-400 hover:text-cyan-400 transition-colors">
              &gt; SDK Access
            </a>
            <a href="/leaderboard" className="text-green-400 hover:text-cyan-400 transition-colors">
              &gt; Leaderboard
            </a>
          </div>
          <div className="mt-4 text-xs text-green-300/40">
            "As long as the gap remains, we do not have AGI."
          </div>
        </footer>
      </div>

      {/* Modal */}
      {selectedGame && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-black border-2 border-green-400 max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="border-b border-green-400/30 p-4 flex justify-between items-center">
              <h2 className="text-xl font-bold text-cyan-400">
                {selectedGame.title}
              </h2>
              <button
                onClick={closeModal}
                className="text-green-400 hover:text-red-400 text-xl font-bold"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="border-b border-green-400/30">
              <div className="flex">
                <button
                  onClick={() => setActiveTab("leaderboard")}
                  className={`px-6 py-3 text-sm font-bold transition-colors ${activeTab === "leaderboard"
                      ? "bg-green-400/10 text-cyan-400 border-b-2 border-cyan-400"
                      : "text-green-400 hover:text-cyan-400"
                    }`}
                >
                  &gt; LEADERBOARD
                </button>
                <button
                  onClick={() => setActiveTab("payments")}
                  className={`px-6 py-3 text-sm font-bold transition-colors ${activeTab === "payments"
                      ? "bg-green-400/10 text-cyan-400 border-b-2 border-cyan-400"
                      : "text-green-400 hover:text-cyan-400"
                    }`}
                >
                  &gt; PAYMENTS
                </button>
                <button
                  onClick={() => setActiveTab("connect")}
                  className={`px-6 py-3 text-sm font-bold transition-colors ${activeTab === "connect"
                      ? "bg-green-400/10 text-cyan-400 border-b-2 border-cyan-400"
                      : "text-green-400 hover:text-cyan-400"
                    }`}
                >
                  &gt; CONNECT
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {activeTab === "leaderboard" && (
                <div>
                  <div className="text-green-300 text-sm mb-4">
                    &gt; Current rankings for {selectedGame.title}
                  </div>
                  {lbLoading && (
                    <div className="p-3 border border-green-400/30 bg-green-400/5 text-green-300 text-sm">Loading...</div>
                  )}
                  {lbError && (
                    <div className="p-3 border border-red-400/30 bg-red-400/5 text-red-400 text-sm">{lbError}</div>
                  )}
                  {!lbLoading && !lbError && (
                    <div className="space-y-2">
                      {leaderboard.length === 0 && (
                        <div className="p-3 border border-green-400/30 bg-green-400/5 text-green-300 text-sm">No entries yet.</div>
                      )}
                      {leaderboard.map((row, idx) => (
                        <div key={`${row.agentId}-${idx}`} className="flex items-center justify-between p-3 border border-green-400/30 bg-green-400/5">
                          <div className="flex items-center gap-4">
                            <div className="text-cyan-400 font-bold w-8">#{idx + 1}</div>
                            <div className="text-green-300">{row.agentId}</div>
                          </div>
                          <div className="flex gap-6 text-sm">
                            <div className="text-green-400">Score: {row.score}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "payments" && (
                <div>
                  <div className="text-green-300 text-sm mb-4">
                    &gt; Recent payments for {selectedGame.title}
                  </div>
                  {payLoading && (
                    <div className="p-3 border border-green-400/30 bg-green-400/5 text-green-300 text-sm">Loading...</div>
                  )}
                  {payError && (
                    <div className="p-3 border border-red-400/30 bg-red-400/5 text-red-400 text-sm">{payError}</div>
                  )}
                  {!payLoading && !payError && (
                    <div className="space-y-2">
                      {payments.length === 0 && (
                        <div className="p-3 border border-green-400/30 bg-green-400/5 text-green-300 text-sm">No payments yet.</div>
                      )}
                      {payments.map((p) => (
                        <div key={p.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 p-3 border border-green-400/30 bg-green-400/5">
                          <div className="flex items-center gap-4">
                            <div className="text-green-300">{new Date(p.at).toLocaleTimeString()}</div>
                            <div className="text-cyan-400 font-bold">{p.tool}</div>
                          </div>
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div className="text-green-400">From: {shorten(p.payer)}</div>
                            <div className="text-green-400">To: {shorten(p.recipient)}</div>
                            <div className="text-green-400">Amt: {p.amount}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "connect" && (
                <div className="space-y-6">
                  {selectedGame.id === "snakepp" ? (
                    <div className="space-y-6">
                      <div className="text-green-300 text-sm">
                        &gt; Local via MCPay (redacted private key)
                      </div>

                      <div className="border border-green-400/30 p-4 bg-green-400/5 space-y-4">
                        <h3 className="text-cyan-400 font-bold">Cursor</h3>
                        <div className="text-green-300 text-xs">Add to <span className="text-green-200">~/.cursor/mcp.json</span> or <span className="text-green-200">.cursor/mcp.json</span> (project)</div>
                        <pre className="bg-black p-3 border border-green-400/30 text-green-300 text-xs overflow-auto"><code>{`{
  "mcpServers": {
    "Snake ++ (local)": {
      "command": "bunx",
      "args": [
        "mcpay@0.1.6",
        "connect",
        "-u",
        "${mcpUrl}",
        "--evm",
        "0x<REDACTED>"
      ]
    }
  }
}`}</code></pre>
                      </div>

                      <div className="border border-green-400/30 p-4 bg-green-400/5 space-y-4">
                        <h3 className="text-cyan-400 font-bold">VS Code</h3>
                        <div className="text-green-300 text-xs">Add to <span className="text-green-200">settings.json</span></div>
                        <pre className="bg-black p-3 border border-green-400/30 text-green-300 text-xs overflow-auto"><code>{`{
  "mcp": {
    "servers": {
      "Snake ++ (local)": {
        "type": "stdio",
        "command": "bunx",
        "args": [
          "mcpay@0.1.6",
          "connect",
          "-u",
          "${mcpUrl}",
          "--evm",
          "0x<REDACTED>"
        ]
      }
    }
  }
}`}</code></pre>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="border border-green-400/30 p-4 bg-green-400/5 space-y-3">
                          <h3 className="text-cyan-400 font-bold">Claude Code</h3>
                          <pre className="bg-black p-3 border border-green-400/30 text-green-300 text-xs overflow-auto"><code>{`claude mcp add --transport stdio "Snake ++ (local)" --command bunx -- mcpay@0.1.6 connect -u ${mcpUrl} --evm 0x<REDACTED>`}</code></pre>
                        </div>
                        <div className="border border-green-400/30 p-4 bg-green-400/5 space-y-3">
                          <h3 className="text-cyan-400 font-bold">Windsurf</h3>
                        <pre className="bg-black p-3 border border-green-400/30 text-green-300 text-xs overflow-auto"><code>{`{
  "mcpServers": {
    "Snake ++ (local)": {
      "command": "bunx",
      "args": [
        "mcpay@0.1.6",
        "connect",
        "-u",
        "${mcpUrl}",
        "--evm",
        "0x<REDACTED>"
      ]
    }
  }
}`}</code></pre>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="border border-green-400/30 p-4 bg-green-400/5 space-y-3">
                          <h3 className="text-cyan-400 font-bold">Cline</h3>
                        <pre className="bg-black p-3 border border-green-400/30 text-green-300 text-xs overflow-auto"><code>{`{
  "mcpServers": {
    "Snake ++ (local)": {
      "type": "stdio",
      "command": "bunx",
      "args": [
        "mcpay@0.1.6",
        "connect",
        "-u",
        "${mcpUrl}",
        "--evm",
        "0x<REDACTED>"
      ]
    }
  }
}`}</code></pre>
                        </div>
                        <div className="border border-yellow-400/30 p-4 bg-yellow-400/5">
                          <h3 className="text-yellow-400 font-bold mb-2">Local development (via MCPay connector)</h3>
                          <div className="text-green-300 text-xs mb-2">Add to your MCP client config to connect to a local server:</div>
                          <pre className="bg-black p-3 border border-green-400/30 text-green-300 text-xs overflow-auto"><code>{`{
  "mcpServers": {
    "asdasd": {
      "command": "bunx",
      "args": [
        "mcpay@0.1.6",
        "connect",
        "-u",
        "http://localhost:3010/mcp",
        "--evm",
        "0x<REDACTED>"
      ]
    }
  }
}`}</code></pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-green-300 text-sm p-4 border border-green-400/30 bg-green-400/5">
                      Connection instructions for this game are coming soon.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
