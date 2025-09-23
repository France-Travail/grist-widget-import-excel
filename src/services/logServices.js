// services/logService.js

/**
 * Affiche un log clair, avec une icône et une couleur dans la console.
 * @param {"info" | "warn" | "error" | "success"} type
 * @param {string} message
 * @param {any} [data]
 */
export function log(type, message, data) {
  const prefix =
    {
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
      success: "✅",
    }[type] || "";

  const style =
    {
      info: "color: #00aaff",
      warn: "color: #f0ad4e",
      error: "color: #d9534f",
      success: "color: #5cb85c",
    }[type] || "";

  if (data !== undefined) {
    console.log(`%c${prefix} ${message}`, style, data);
  } else {
    console.log(`%c${prefix} ${message}`, style);
  }
}
