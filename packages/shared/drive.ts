/** Validate without contacting Google or granting access to a folder. */
export function driveFolder(value: string): string {
  if (!value.trim()) return "";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Paste a Google Drive folder link.");
  }
  const match = url.pathname.match(
    /^\/(?:drive\/(?:u\/\d+\/)?)?folders\/([A-Za-z0-9_-]{10,200})\/?$/,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "drive.google.com" ||
    url.port ||
    url.username ||
    url.password ||
    !match
  )
    throw new Error(
      "Use an HTTPS folder link from drive.google.com, not a file link.",
    );
  const key = url.searchParams.get("resourcekey");
  if (key && !/^[A-Za-z0-9_-]{1,200}$/.test(key))
    throw new Error("This folder link has an invalid resource key.");
  return (
    "https://drive.google.com/drive/folders/" +
    match[1] +
    (key ? "?resourcekey=" + encodeURIComponent(key) : "")
  );
}
