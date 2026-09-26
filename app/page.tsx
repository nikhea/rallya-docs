import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-start justify-center gap-8 py-32 px-16 bg-white dark:bg-black">
        <p className="text-sm font-medium tracking-widest text-zinc-500 uppercase">
          Event platform
        </p>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight text-black dark:text-zinc-50">
          Rallya Documentation
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Sell tickets, check in attendees, hand out kits, and run your
          organization — guides for organizers, door staff, and developers.
        </p>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <Link
            className="flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            href="/docs"
          >
            Read the docs
          </Link>
          <Link
            className="flex h-12 items-center justify-center rounded-full border border-solid border-black/[.08] px-8 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            href="/docs/quickstart"
          >
            Quickstart
          </Link>
        </div>
      </main>
    </div>
  );
}
