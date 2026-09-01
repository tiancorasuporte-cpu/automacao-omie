import "@tanstack/react-start/server-only";

let readyAt = 0;

/** Marca o momento em que o listener do bot ficou pronto (ignora histórico anterior). */
export function markWahaBotReady(at = Date.now()) {
  readyAt = at;
}

export function getWahaBotReadyAt() {
  return readyAt;
}
