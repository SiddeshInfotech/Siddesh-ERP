import { describeBarcodeProblem, findBarcodeProblem } from './barcode'

/**
 * Product form values and validation (SRD §3, §4).
 *
 * Pure: no React, no I/O, no Supabase. Every rule here mirrors a CHECK constraint in
 * 03_products.sql, and that duplication is deliberate — this exists to tell the storekeeper
 * which box is wrong before a round-trip. The server still decides (rule 0.4); if these two
 * ever disagree, the database wins and the user sees a generic failure.
 */

/** SRD §4: generate our own ST-code, or store the one already printed on the box. */
export type BarcodeSource = 'GENERATE' | 'MANUFACTURER'

export type TrackingMode = 'QUANTITY' | 'SERIAL'

/**
 * Every field is a string because it comes from an input. Numbers are parsed at the edge,
 * in `toProductRow` — keeping them as strings here is what lets a half-typed "1." exist
 * without the form fighting the user.
 */
export interface ProductFormValues {
  name: string
  categoryId: string
  brandId: string
  uomId: string
  modelNumber: string
  description: string
  minStock: string
  hsnCode: string
  gstPercent: string
  trackingMode: TrackingMode
  barcodeSource: BarcodeSource
  manufacturerBarcode: string
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>

/** Long enough for "Std. 1-4 Marathi Content Pen Drive 128GB", short enough not to break a row. */
const MAX_NAME_LENGTH = 200
const MAX_MODEL_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 2000

/** products.min_stock is a Postgres `integer`; past this a mistyped 9999999999 overflows. */
const MAX_MIN_STOCK = 1_000_000

/** chk_products_hsn: hsn_code ~ '^[0-9]{4,8}$' */
const HSN_PATTERN = /^[0-9]{4,8}$/

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  categoryId: '',
  brandId: '',
  uomId: '',
  modelNumber: '',
  description: '',
  minStock: '0',
  hsnCode: '',
  gstPercent: '',
  trackingMode: 'QUANTITY',
  barcodeSource: 'GENERATE',
  manufacturerBarcode: ''
}

/**
 * Validates the product form (DSK-204, DSK-206, DSK-209, DSK-217).
 *
 * @returns One message per invalid field. Empty object means every rule passed.
 *
 * Required set is name / category / unit, per DSK-206. Brand, model, description, HSN and
 * GST are optional in SRD §3 and stay optional here.
 */
export function validateProductForm(values: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {}

  const name = values.name.trim()
  if (name.length === 0) errors.name = 'Enter the product name.'
  else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Keep the name under ${MAX_NAME_LENGTH} characters.`
  }

  if (values.categoryId === '') errors.categoryId = 'Choose a category.'
  if (values.uomId === '') errors.uomId = 'Choose a unit.'

  if (values.modelNumber.trim().length > MAX_MODEL_LENGTH) {
    errors.modelNumber = `Keep the model number under ${MAX_MODEL_LENGTH} characters.`
  }

  if (values.description.trim().length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.`
  }

  const minStockError = validateMinStock(values.minStock)
  if (minStockError !== null) errors.minStock = minStockError

  const hsn = values.hsnCode.trim()
  if (hsn.length > 0 && !HSN_PATTERN.test(hsn)) {
    errors.hsnCode = 'An HSN code is 4 to 8 digits.'
  }

  const gstError = validateGst(values.gstPercent)
  if (gstError !== null) errors.gstPercent = gstError

  if (values.barcodeSource === 'MANUFACTURER') {
    const problem = findBarcodeProblem(values.manufacturerBarcode)
    if (problem !== null) errors.manufacturerBarcode = describeBarcodeProblem(problem)
  }

  return errors
}

/** Minimum stock alert level (SRD §3, DSK-217). Zero is valid and means "never warn". */
function validateMinStock(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return 'Enter a minimum stock level, or 0 for none.'

  const value = Number(trimmed)
  if (!Number.isFinite(value)) return 'Enter a whole number.'
  if (!Number.isInteger(value)) return 'Minimum stock must be a whole number.'
  if (value < 0) return 'Minimum stock cannot be negative.'
  if (value > MAX_MIN_STOCK) return `That is too large. Keep it under ${MAX_MIN_STOCK}.`

  return null
}

/** GST percentage (SRD §3, optional). chk_products_gst: between 0 and 100. */
function validateGst(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  const value = Number(trimmed)
  if (!Number.isFinite(value)) return 'Enter a number, e.g. 18.'
  if (value < 0 || value > 100) return 'GST must be between 0 and 100.'

  return null
}

/** Blank optional text becomes NULL, never ''. An empty string is a value; absence is not. */
function orNull(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed.length === 0 ? null : trimmed
}

export interface ProductRow {
  name: string
  category_id: string | null
  brand_id: string | null
  uom_id: string | null
  model_number: string | null
  description: string | null
  min_stock: number
  hsn_code: string | null
  gst_percent: number | null
  tracking_mode: TrackingMode
}

/**
 * Maps validated form values onto a `products` row.
 *
 * @param values - MUST already have passed `validateProductForm`; this does not re-check.
 *
 * `sku_barcode` is deliberately absent: the column defaults to `app.next_product_barcode()`,
 * so the database owns the ST-sequence and two clients can never mint the same code.
 */
export function toProductRow(values: ProductFormValues): ProductRow {
  return {
    name: values.name.trim(),
    category_id: orNull(values.categoryId),
    brand_id: orNull(values.brandId),
    uom_id: orNull(values.uomId),
    model_number: orNull(values.modelNumber),
    description: orNull(values.description),
    min_stock: Number(values.minStock.trim()),
    hsn_code: orNull(values.hsnCode),
    // Number('') is 0, which would silently write a real 0% GST for "not specified".
    gst_percent: orNull(values.gstPercent) === null ? null : Number(values.gstPercent.trim()),
    tracking_mode: values.trackingMode
  }
}
