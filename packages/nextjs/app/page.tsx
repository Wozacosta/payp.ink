import Link from "next/link";
import type { NextPage } from "next";

const Home: NextPage = () => {
  return (
    <div className="flex flex-col grow">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">
          Pay<span className="text-pink-500">pink</span>
        </h1>
        <p className="text-lg sm:text-xl text-base-content/70 max-w-xl mb-8">
          Decentralized content monetization. Publish articles, get paid in ETH or USDC, tip creators — all on-chain.
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <Link href="/articles" className="btn btn-primary btn-lg">
            Browse Articles
          </Link>
          <Link href="/create" className="btn btn-outline btn-lg">
            Start Writing
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-base-300 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card bg-base-100 shadow-md">
              <div className="card-body items-center text-center">
                <div className="text-3xl mb-2">1</div>
                <h3 className="card-title text-lg">Write</h3>
                <p className="text-base-content/70 text-sm">
                  Create articles in Markdown. Set a price in USD or make them free. Your content, your rules.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-md">
              <div className="card-body items-center text-center">
                <div className="text-3xl mb-2">2</div>
                <h3 className="card-title text-lg">Register</h3>
                <p className="text-base-content/70 text-sm">
                  Register on-chain with a content hash. Immutable proof of authorship on Ink L2.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-md">
              <div className="card-body items-center text-center">
                <div className="text-3xl mb-2">3</div>
                <h3 className="card-title text-lg">Earn</h3>
                <p className="text-base-content/70 text-sm">
                  Readers pay with ETH or USDC (via x402). 99% goes to you. Withdraw anytime.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="flex gap-4">
            <div className="text-pink-500 text-2xl shrink-0">$</div>
            <div>
              <h3 className="font-semibold mb-1">Dual payment rails</h3>
              <p className="text-base-content/70 text-sm">
                Pay with ETH on Ink or USDC via the x402 protocol on Base. Same article, two paths.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-pink-500 text-2xl shrink-0">#</div>
            <div>
              <h3 className="font-semibold mb-1">Content integrity</h3>
              <p className="text-base-content/70 text-sm">
                Every article has a keccak256 hash on-chain. Readers can verify nothing was tampered with.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-pink-500 text-2xl shrink-0">%</div>
            <div>
              <h3 className="font-semibold mb-1">99/1 split</h3>
              <p className="text-base-content/70 text-sm">
                Creators keep 99% of every payment. 1% platform fee. No middlemen, no hidden cuts.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-pink-500 text-2xl shrink-0">&hearts;</div>
            <div>
              <h3 className="font-semibold mb-1">Tipping</h3>
              <p className="text-base-content/70 text-sm">
                Readers can tip creators by slug or address. Same 99/1 split. Same pull-over-push withdrawal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-base-300 py-12 px-6 text-center">
        <p className="text-base-content/70 mb-4">Built on Ink L2 with Scaffold-ETH 2</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/docs" className="btn btn-ghost btn-sm">
            Read the docs
          </Link>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            Creator dashboard
          </Link>
          <Link href="/debug" className="btn btn-ghost btn-sm">
            Debug contracts
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
