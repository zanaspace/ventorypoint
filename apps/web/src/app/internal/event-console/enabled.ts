/** The developer console is on outside production, or when ENABLE_DEV_CONSOLE=true. */
export function devConsoleEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_CONSOLE === "true";
}
