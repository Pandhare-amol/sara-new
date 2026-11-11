export type CompanionVideoState = "idle" | "thinking" | "talking" | "listening" | "speaking" | "unknown";

export function normalizeCompanionVideoState(state: string | CompanionVideoState | undefined): CompanionVideoState {
  const normalized = (state ?? "idle").toLowerCase();

  switch (normalized) {
    case "speaking":
      return "talking";
    case "talking":
      return "talking";
    case "listening":
      return "listening";
    case "thinking":
      return "thinking";
    case "idle":
      return "idle";
    default:
      return "idle";
  }
}

function fromAssets(fileName: string) {
  return new URL(`../../assets/${fileName}`, import.meta.url).href;
}

function fromCustomAssets(fileName: string) {
  return new URL(`../../assets/.aistudio/${fileName}`, import.meta.url).href;
}

export function resolveCompanionVideo(state: CompanionVideoState | string | undefined, characterId?: string): string {
  const normalizedCharacterId = (characterId ?? "").toLowerCase();
  const isSpaceshipHologram = normalizedCharacterId === "sara-spaceship-hologram";
  const prefersCustomGirl = /(girl|anime|custom|imported|companion)/.test(normalizedCharacterId);
  const normalizedState = normalizeCompanionVideoState(state);

  if (isSpaceshipHologram) {
    const fileName = normalizedState === "talking" ? "talking2.mp4" : "idle2.mp4";
    return `/assets/${fileName}`;
  }

  const defaultSet = {
    idle: fromAssets("idle.mp4"),
    listening: fromAssets("idle.mp4"),
    thinking: fromAssets("thinking.mp4"),
    talking: fromAssets("talking.mp4"),
    speaking: fromAssets("talking.mp4"),
    unknown: fromAssets("idle.mp4"),
  } as const;

  const customGirlSet = {
    idle: fromCustomAssets("JUST%20WAITNG.mp4"),
    listening: fromCustomAssets("JUST%20WAITNG.mp4"),
    thinking: fromCustomAssets("ANIMA%20GIRL%20THINKING.mp4"),
    talking: fromCustomAssets("ANIMA%20GIRL%20TAKING.mp4"),
    speaking: fromCustomAssets("ANIMA%20GIRL%20TAKING.mp4"),
    unknown: fromCustomAssets("JUST%20WAITNG.mp4"),
  } as const;

  const selectedSet = prefersCustomGirl ? customGirlSet : defaultSet;
  const key = normalizedState in selectedSet ? normalizedState : "unknown";
  return selectedSet[key as keyof typeof selectedSet];
}
