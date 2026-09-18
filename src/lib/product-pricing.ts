/** Markup padrão sugerido sobre o CMC efetivo (não altera o preço Omie). */
export const DEFAULT_PRODUCT_MARKUP = 1.65;

/** Usa o maior entre CMC Omie e CMC interno (ignora nulos / inválidos). */
export function effectiveCmc(
  cmcOmie: number | null | undefined,
  cmcInterno: number | null | undefined,
) {
  const values = [cmcOmie, cmcInterno].filter(
    (value): value is number => value != null && Number.isFinite(value) && value >= 0,
  );
  if (!values.length) return null;
  return Math.max(...values);
}

export function suggestedPriceFromCmc(cmc: number | null | undefined, markup = DEFAULT_PRODUCT_MARKUP) {
  if (cmc == null || !Number.isFinite(cmc) || cmc <= 0) return null;
  const m = Number.isFinite(markup) && markup > 0 ? markup : DEFAULT_PRODUCT_MARKUP;
  return Number((cmc * m).toFixed(4));
}

export function isUnitBelowCmc(salePrice: number, cmc: number | null | undefined) {
  if (cmc == null || !Number.isFinite(cmc) || cmc <= 0 || !Number.isFinite(salePrice)) return false;
  return salePrice < cmc - 0.0001;
}

export function isUnitBelowSuggested(salePrice: number, suggested: number | null | undefined) {
  if (suggested == null || !Number.isFinite(suggested) || suggested <= 0 || !Number.isFinite(salePrice)) {
    return false;
  }
  return salePrice < suggested - 0.0001;
}

