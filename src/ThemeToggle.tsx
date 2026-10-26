import { Icon } from "./Icons";
export default function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: string;
  onToggle: () => void;
}) {
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
    </button>
  );
}
