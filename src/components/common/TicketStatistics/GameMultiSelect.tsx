import { useEffect, useRef, useState } from "react";
import { formatSwedishTime } from "~/utils/formatSwedishTime";

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: number;
}

interface GameMultiSelectProps {
  games: Game[];
  selectedIds: string[];
  onToggle: (gameId: string) => void;
  getColor: (gameId: string) => string;
}

export const GameMultiSelect = ({
  games,
  selectedIds,
  onToggle,
  getColor
}: GameMultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-slate-800 px-4 py-2 text-left text-slate-50 shadow-sm focus:ring focus:ring-blue-500 focus:ring-opacity-50 md:w-96"
      >
        <span>
          {selectedIds.length === 0
            ? "Välj matcher att jämföra…"
            : `${selectedIds.length} match${selectedIds.length > 1 ? "er" : ""} valda`}
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-600 bg-slate-800 py-1 shadow-lg md:w-96">
          {games.map((game) => {
            const isSelected = selectedIds.includes(game.id);
            const color = getColor(game.id);
            return (
              <label
                key={game.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-slate-700"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(game.id)}
                  className="sr-only"
                />
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border"
                  style={{
                    backgroundColor: isSelected ? color : "transparent",
                    borderColor: color
                  }}
                >
                  {isSelected && (
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-slate-50">
                  {game.homeTeam} - {game.awayTeam} (
                  {formatSwedishTime(game.date, "dd MMM yyyy")})
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};
