// Small inline icon set (stroke icons, 24px grid; stroke follows currentColor). No icon library needed.

const PATHS = {
  shield: "M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z",
  check: "M5 12.5l4.2 4.2L19 7",
  x: "M6 6l12 12M18 6L6 18",
  send: "M4 12l16-8-6 16-2.5-6.5L4 12z",
  speaker: "M5 9v6h4l5 4V5L9 9H5zM17.5 8.5a5 5 0 010 7M20 6a8.5 8.5 0 010 12",
  stop: "M7 7h10v10H7z",
  chat: "M4 5h16v11H9l-5 4V5z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  book: "M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6M20 4v14h-6",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  clock: "M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z",
  unlock: "M7 11V7a5 5 0 019.6-2M5 11h14v10H5z",
  news: "M4 5h13v14H6a2 2 0 01-2-2V5zM17 9h3v8a2 2 0 01-2 2M8 9h5M8 13h5",
  odds: "M4 20l5-6 4 3 7-9M15 8h5v5",
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zm13 7h2",
  spark: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  thumbsUp: "M7 21H4V10h3M7 10l4-7a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.2 7A2 2 0 0117.3 20H7",
  thumbsDown: "M7 3H4v11h3M7 14l4 7a2 2 0 002-2v-4h5.5a2 2 0 002-2.3l-1.2-7A2 2 0 0017.3 4H7",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  plug: "M9 3v5M15 3v5M7 8h10v3a5 5 0 01-10 0V8zM12 16v5",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 018 0v4",
  info: "M12 11v6M12 7.5v.5M12 21a9 9 0 110-18 9 9 0 010 18z",
  scan: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  close: "M6 6l12 12M18 6L6 18",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21",
  micOff: "M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5.5 11a6.5 6.5 0 0 0 10.6 5M18.5 11a6.5 6.5 0 0 1-.6 2.7M12 17.5V21",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  coins: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  swap: "M4 8h14l-4-4M20 16H6l4 4",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 17h2",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm9 3-4.35-4.35",
  collapse: "M4 4h16v16H4zM9 4v16M15 10l-2 2 2 2",
  arrow: "M5 12h14M13 6l6 6-6 6",
  image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
} satisfies Record<string, string>;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.7,
  title,
}: {
  name: IconName | (string & {});
  size?: number;
  strokeWidth?: number;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name as IconName] ?? PATHS.list} />
    </svg>
  );
}
