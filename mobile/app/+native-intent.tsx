export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.includes("hosted-callback")) {
    return "/(tabs)/library";
  }

  if (path.includes("expo-sharing")) {
    return "/(tabs)/queue";
  }

  return path;
}
