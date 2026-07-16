export const VIDEO_COMPOSER_V2_ENABLED =
  String(import.meta.env.VITE_VIDEO_COMPOSER_V2 ?? "true").toLowerCase() !== "false";
