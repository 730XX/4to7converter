/**
 * Códigos numéricos estables para fallos de la línea de comandos, mostrados
 * al usuario en la consola.
 */
export const CliErrorCode = {
  /** No se pudo leer el archivo de entrada. */
  FileReadError: 4001,
  /** El JSON del lane map no tiene la forma esperada. */
  InvalidLaneMap: 4002,
  /** La cantidad de teclas destino es inválida o no viene acompañada de un lane map. */
  InvalidKeys: 4003,
  /** Los argumentos de la línea de comandos son inválidos. */
  UsageError: 4004,
  /** No se pudo escribir el archivo de salida. */
  FileWriteError: 4005,
} as const;

/**
 * Error lanzado por la línea de comandos cuando una operación de archivo o una
 * opción es inválida. Transporta un código numérico estable y un mensaje legible.
 */
export class CliError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "CliError";
    this.code = code;
  }
}
