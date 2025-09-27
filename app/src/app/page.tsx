"use client";

import Image from "next/image";
import { useState } from "react";

type Game = {
  url: string;
  title: string;
  description: string;
  image: string;
  link: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

const GAMES = [
  {
    url: "/games/arc-agi",
    title: "ARC-AGI Challenge",
    description: "Test your abstract reasoning with visual puzzles that challenge core intelligence",
    image: "/arc-grid.svg",
    link: "/games/arc-agi",
    tags: ["Reasoning", "Puzzles", "AI"],
    status: "Active",
    createdAt: "2024-01-15",
    updatedAt: "2024-01-20",
  },
  {
    url: "/games/pattern-match",
    title: "Pattern Synthesis",
    description: "Discover hidden patterns and synthesize new solutions from minimal examples",
    image: "/pattern-grid.svg",
    link: "/games/pattern-match",
    tags: ["Patterns", "Logic", "Synthesis"],
    status: "Beta",
    createdAt: "2024-01-10",
    updatedAt: "2024-01-18",
  },
  {
    url: "/games/core-knowledge",
    title: "Core Knowledge Test",
    description: "Navigate challenges using fundamental cognitive priors without language dependency",
    image: "/knowledge-grid.svg",
    link: "/games/core-knowledge",
    tags: ["Cognition", "Priors", "Universal"],
    status: "Coming Soon",
    createdAt: "2024-01-05",
    updatedAt: "2024-01-15",
  }
]

const LEADERBOARD_DATA = [
  { rank: 1, name: "DeepMind_Alpha", score: 87.3, efficiency: "94.2%" },
  { rank: 2, name: "OpenAI_GPT", score: 82.1, efficiency: "89.7%" },
  { rank: 3, name: "Anthropic_Claude", score: 79.8, efficiency: "85.3%" },
  { rank: 4, name: "Human_Baseline", score: 85.0, efficiency: "100%" },
  { rank: 5, name: "Meta_LLaMA", score: 76.4, efficiency: "82.1%" },
]

export default function Home() {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [activeTab, setActiveTab] = useState("leaderboard");

  const openModal = (game: Game) => {
    setSelectedGame(game);
    setActiveTab("leaderboard");
  };

  const closeModal = () => {
    setSelectedGame(null);
  };

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
              ARCADE<span className="text-cyan-400">AGI</span>.GAMES
            </h1>
            <div className="text-green-300 text-lg tracking-widest">
              &gt; INTELLIGENCE IS INTERACTIVE &lt;
            </div>
          </div>
          
          <div className="max-w-3xl mx-auto text-green-300 text-sm leading-relaxed border border-green-400/30 p-4 bg-black/60">
            <p className="mb-2">
              &gt; Human-Like Intelligence Testing Protocol Initialized...
            </p>
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
              [ ACTIVE CHALLENGES ]
            </h2>
            <div className="text-green-300 text-sm">
              Select your intelligence benchmark
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {GAMES.map((game, index) => (
              <div key={index} className="group cursor-pointer" onClick={() => openModal(game)}>
                <div className="border-2 border-green-400/50 bg-black/80 p-6 h-full transition-all duration-300 hover:border-cyan-400 hover:bg-green-400/5 hover:shadow-lg hover:shadow-green-400/20">
                  {/* Status indicator */}
                  <div className="flex justify-between items-start mb-4">
                    <div className={`text-xs px-2 py-1 border ${
                      game.status === 'Active' ? 'border-green-400 text-green-400' :
                      game.status === 'Beta' ? 'border-yellow-400 text-yellow-400' :
                      'border-gray-400 text-gray-400'
                    }`}>
                      {game.status.toUpperCase()}
                    </div>
                    <div className="text-xs text-green-300/60">
                      #{String(index + 1).padStart(2, '0')}
                    </div>
                  </div>

                  {/* Game icon placeholder */}
                  <div className="w-16 h-16 border border-green-400/30 mb-4 flex items-center justify-center bg-green-400/5">
                    <div className="text-2xl text-green-400">◊</div>
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
                  className={`px-6 py-3 text-sm font-bold transition-colors ${
                    activeTab === "leaderboard" 
                      ? "bg-green-400/10 text-cyan-400 border-b-2 border-cyan-400" 
                      : "text-green-400 hover:text-cyan-400"
                  }`}
                >
                  &gt; LEADERBOARD
                </button>
                <button
                  onClick={() => setActiveTab("connect")}
                  className={`px-6 py-3 text-sm font-bold transition-colors ${
                    activeTab === "connect" 
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
                  <div className="space-y-2">
                    {LEADERBOARD_DATA.map((entry) => (
                      <div key={entry.rank} className="flex items-center justify-between p-3 border border-green-400/30 bg-green-400/5">
                        <div className="flex items-center gap-4">
                          <div className="text-cyan-400 font-bold w-8">
                            #{entry.rank}
                          </div>
                          <div className="text-green-300">
                            {entry.name}
                          </div>
                        </div>
                        <div className="flex gap-6 text-sm">
                          <div className="text-green-400">
                            Score: {entry.score}
                          </div>
                          <div className="text-yellow-400">
                            Efficiency: {entry.efficiency}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "connect" && (
                <div className="space-y-6">
                  <div className="text-green-300 text-sm mb-4">
                    &gt; Connection instructions for {selectedGame.title}
                  </div>
                  
                  <div className="border border-green-400/30 p-4 bg-green-400/5">
                    <h3 className="text-cyan-400 font-bold mb-3">Step 1: Install SDK</h3>
                    <div className="bg-black p-3 border border-green-400/30 text-green-300 text-sm font-mono">
                      npm install @arcadeagi/sdk
                    </div>
                  </div>

                  <div className="border border-green-400/30 p-4 bg-green-400/5">
                    <h3 className="text-cyan-400 font-bold mb-3">Step 2: Initialize Connection</h3>
                    <div className="bg-black p-3 border border-green-400/30 text-green-300 text-sm font-mono">
                      <div>import &#123; ArcadeAGI &#125; from '@arcadeagi/sdk';</div>
                      <div className="mt-2">const client = new ArcadeAGI(&#123;</div>
                      <div>&nbsp;&nbsp;gameId: '{selectedGame.url.split('/').pop()}',</div>
                      <div>&nbsp;&nbsp;apiKey: 'your-api-key'</div>
                      <div>&#125;);</div>
                    </div>
                  </div>

                  <div className="border border-green-400/30 p-4 bg-green-400/5">
                    <h3 className="text-cyan-400 font-bold mb-3">Step 3: Start Challenge</h3>
                    <div className="bg-black p-3 border border-green-400/30 text-green-300 text-sm font-mono">
                      <div>const session = await client.startChallenge();</div>
                      <div>console.log('Challenge started:', session.id);</div>
                    </div>
                  </div>

                  <div className="text-yellow-400 text-sm p-3 border border-yellow-400/30 bg-yellow-400/5">
                    ⚠ API keys are required for challenge participation. Visit /sdk for registration.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
