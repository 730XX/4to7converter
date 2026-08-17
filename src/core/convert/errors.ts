/**
 * Códigos numéricos estables para fallos de validación del lane map,
 * mostrados al usuario en la UI.
 */
export const ConversionErrorCode = {
  /** La columna fuente no tiene columnas destino en el lane map. */
  EmptyLaneMapping: 2001,
  /** La columna destino no es entera o queda fuera del rango 0..targetKeyCount-1. */
  TargetColumnOutOfRange: 2002,
  /** La columna destino se repite dentro de la misma columna fuente. */
  DuplicateTargetColumn: 2003,
} as const;

/**
 * Error lanzado cuando un lane map no puede aplicarse a un beatmap.
 * Transporta un código numérico estable y un mensaje legible.
 */
export class ConversionError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "ConversionError";
    this.code = code;
  }
}
