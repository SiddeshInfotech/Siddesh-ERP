import { Barcode, Package, Percent, Sparkles, Warehouse } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { BarcodeLabel } from './BarcodeLabel'
import { cn } from '@/lib/cn'
import {
  validateProductForm,
  type ProductFormErrors,
  type ProductFormValues
} from '@/lib/productForm'

/**
 * Create / edit form for a product (DSK-204, DSK-206, DSK-207, DSK-208, DSK-209, DSK-217).
 *
 * Dumb by design (rule §5): every option list arrives as a prop and every outcome leaves as an
 * event. It fetches nothing and knows nothing about Supabase, so the same form serves both
 * "New Product" and "Edit Product".
 *
 * Carries every field in SRD §3 — name, category, brand, model, unit, description, minimum
 * stock, HSN, GST — plus the §4 barcode choice and the §18B tracking mode.
 */

interface ProductFormProps {
  initialValues: ProductFormValues
  categories: SelectOption[]
  brands: SelectOption[]
  uoms: SelectOption[]
  isEditing: boolean
  /** The product's existing ST-code. Edit only — it is already printed on boxes. */
  skuBarcode?: string
  isSaving: boolean
  /** Safe sentence for a failure that is not tied to one field. */
  submitError?: string | null
  /** Server-decided field errors, e.g. a duplicate barcode the unique index rejected. */
  serverErrors?: ProductFormErrors
  onSubmit: (values: ProductFormValues) => void
  onCancel: () => void
}

/**
 * Stand-in for the preview before the database assigns the real code. Deliberately all
 * zeroes: it is obviously not a real SKU, so nobody writes it on a box.
 */
const SAMPLE_SKU = 'ST00000000'

/** SRD §18B. The label is the word a storekeeper would use; the detail goes underneath. */
const TRACKING_MODE_OPTIONS: SelectOption[] = [
  { value: 'QUANTITY', label: 'Quantity', description: 'All units share one barcode' },
  { value: 'SERIAL', label: 'Serial number', description: 'Each unit gets its own barcode' }
]

/** SRD §3 lists GST as optional; these are the standard Indian slabs plus custom. */
const GST_OPTIONS: SelectOption[] = [
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
  { value: 'OTHER', label: '+ Other (Custom GST Rate)' }
]

const OTHER_LOOKUP_OPTION: SelectOption = {
  value: 'OTHER',
  label: '+ Other (Add custom)'
}

interface CustomOptionFieldProps {
  label: string
  value: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
  placeholder?: string
  required?: boolean
  type?: string
  step?: string
  min?: number
  max?: number
  inputMode?: 'text' | 'numeric' | 'decimal' | 'search' | 'tel' | 'url' | 'email'
  badgeLabel?: string
}

function CustomOptionField({
  label,
  value,
  onChange,
  error,
  placeholder,
  required,
  type = 'text',
  step,
  min,
  max,
  inputMode,
  badgeLabel = 'Custom Entry'
}: CustomOptionFieldProps) {
  return (
    <div className="mt-2.5 rounded-xl border border-primary-container/40 bg-primary-container/5 dark:bg-primary-container/10 p-3 transition-all animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="size-3.5 text-primary-container shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary-container">
          {badgeLabel}
        </span>
      </div>
      <Field
        autoFocus
        error={error}
        inputMode={inputMode}
        label={label}
        max={max}
        min={min}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
        value={value}
      />
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="mb-2 overflow-visible">
      <div className="flex items-center gap-2 hairline-b px-5 py-3.5">
        {icon}
        <h2 className="text-label-caps uppercase text-on-surface-variant">{title}</h2>
      </div>
      <div className="p-5 pb-6">{children}</div>
    </Card>
  )
}

export function ProductForm({
  initialValues,
  categories,
  brands,
  uoms,
  isEditing,
  skuBarcode,
  isSaving,
  submitError,
  serverErrors,
  onSubmit,
  onCancel
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(initialValues)
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const formRef = useRef<HTMLFormElement>(null)

  const categoryOptions = useMemo<SelectOption[]>(
    () => [...categories, OTHER_LOOKUP_OPTION],
    [categories]
  )

  const brandOptions = useMemo<SelectOption[]>(
    () => [...brands, OTHER_LOOKUP_OPTION],
    [brands]
  )

  const uomOptions = useMemo<SelectOption[]>(
    () => [...uoms, OTHER_LOOKUP_OPTION],
    [uoms]
  )

  // A server error (duplicate barcode) must appear on its field, not just as a banner.
  const allErrors: ProductFormErrors = { ...errors, ...serverErrors }

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  function update<Key extends keyof ProductFormValues>(key: Key, value: ProductFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }))
    // Clear the message the moment the user acts on it; re-validated on submit anyway.
    setErrors((current) => (key in current ? { ...current, [key]: undefined } : current))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const found = validateProductForm(values)
    setErrors(found)

    if (Object.keys(found).length > 0) {
      // DSK-206: "clearly point out the missing field". Moving focus is what does that for a
      // keyboard user and a screen reader; a red border alone reaches neither.
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }

    onSubmit(values)
  }

  const isManufacturerCode = values.barcodeSource === 'MANUFACTURER'

  // On a new product the real code does not exist yet: `sku_barcode` defaults to
  // app.next_product_barcode(), so the database mints it at INSERT and nothing else may
  // guess it — peeking at the sequence would be a race and could hand out a code that
  // another clerk's save takes first. So the preview shows the true label with a clearly
  // marked sample number, rather than inventing one that looks real.
  const previewCode = isManufacturerCode
    ? values.manufacturerBarcode.trim()
    : (skuBarcode ?? SAMPLE_SKU)

  const isSamplePreview = !isManufacturerCode && skuBarcode === undefined
  const hasPreview = previewCode.length > 0

  return (
    <form className="flex flex-col gap-gutter" noValidate onSubmit={handleSubmit} ref={formRef}>
      <Section
        icon={<Package aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
        title="Basic information"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field
            autoFocus
            containerClassName="col-span-2"
            error={allErrors.name}
            label="Product name"
            maxLength={200}
            onChange={(event) => update('name', event.target.value)}
            placeholder="e.g. Arduino UNO"
            required
            value={values.name}
          />

          <div>
            <Select
              error={allErrors.categoryId}
              label="Category"
              onChange={(next) => update('categoryId', next)}
              options={categoryOptions}
              placeholder="Choose a category"
              required
              value={values.categoryId}
            />
            {values.categoryId === 'OTHER' ? (
              <CustomOptionField
                badgeLabel="Custom Category"
                error={allErrors.customCategory}
                label="Custom Category Name"
                onChange={(event) => update('customCategory', event.target.value)}
                placeholder="e.g. Robotics"
                required
                value={values.customCategory}
              />
            ) : null}
          </div>

          <div>
            <Select
              error={allErrors.uomId}
              hint="How this product is counted."
              label="Unit"
              onChange={(next) => update('uomId', next)}
              options={uomOptions}
              placeholder="Choose a unit"
              required
              value={values.uomId}
            />
            {values.uomId === 'OTHER' ? (
              <CustomOptionField
                badgeLabel="Custom Unit"
                error={allErrors.customUom}
                label="Custom Unit Name"
                onChange={(event) => update('customUom', event.target.value)}
                placeholder="e.g. ROLL or KG"
                required
                value={values.customUom}
              />
            ) : null}
          </div>

          <div>
            <Select
              label="Brand"
              onChange={(next) => update('brandId', next)}
              options={brandOptions}
              placeholder="No brand"
              value={values.brandId}
            />
            {values.brandId === 'OTHER' ? (
              <CustomOptionField
                badgeLabel="Custom Brand"
                error={allErrors.customBrand}
                label="Custom Brand Name"
                onChange={(event) => update('customBrand', event.target.value)}
                placeholder="e.g. Logitech"
                value={values.customBrand}
              />
            ) : null}
          </div>

          <Field
            error={allErrors.modelNumber}
            hint="Optional."
            label="Model number"
            maxLength={100}
            onChange={(event) => update('modelNumber', event.target.value)}
            placeholder="e.g. R3-V2"
            value={values.modelNumber}
          />

          <Textarea
            containerClassName="col-span-2"
            error={allErrors.description}
            label="Description"
            maxLength={2000}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Anything the next person needs to know about this product."
            value={values.description}
          />
        </div>
      </Section>

      <Section
        icon={<Warehouse aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
        title="Stock management"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field
            error={allErrors.minStock}
            hint="Warn me when stock falls to or below this. 0 means never."
            inputMode="numeric"
            label="Minimum stock alert"
            min={0}
            onChange={(event) => update('minStock', event.target.value)}
            required
            type="number"
            value={values.minStock}
          />

          <Select
            hint={
              isEditing
                ? 'Changing this will not rewrite existing history.'
                : 'Serial suits VR headsets, drones and laptops.'
            }
            label="Tracking mode"
            onChange={(next) => update('trackingMode', next === 'SERIAL' ? 'SERIAL' : 'QUANTITY')}
            options={TRACKING_MODE_OPTIONS}
            value={values.trackingMode}
          />
        </div>
      </Section>

      <Section
        icon={<Barcode aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
        title="Barcode"
      >
        <div className="grid grid-cols-2 gap-5">
          <div className="flex flex-col gap-4">
            <fieldset>
              <legend className="mb-1.5 ml-1 text-label-caps uppercase text-on-surface-variant">
                Source
              </legend>
              <div className="flex flex-col gap-2">
                <BarcodeSourceOption
                  checked={!isManufacturerCode}
                  description={
                    isEditing
                      ? 'Keep the code this product already has.'
                      : 'The app assigns the next code, e.g. ST00000123.'
                  }
                  label="Generate a barcode"
                  onSelect={() => update('barcodeSource', 'GENERATE')}
                />
                <BarcodeSourceOption
                  checked={isManufacturerCode}
                  description="Scan or type the barcode already printed on the box."
                  label="Use the manufacturer's barcode"
                  onSelect={() => update('barcodeSource', 'MANUFACTURER')}
                />
              </div>
            </fieldset>

            {isManufacturerCode ? (
              <Field
                error={allErrors.manufacturerBarcode}
                hint="Scan it with the USB scanner, or type it exactly as printed."
                label="Manufacturer barcode"
                mono
                onChange={(event) => update('manufacturerBarcode', event.target.value)}
                placeholder="8901234567890"
                required
                value={values.manufacturerBarcode}
              />
            ) : null}

            {isEditing && skuBarcode !== undefined ? (
              <Field
                disabled
                hint="Assigned by the app and already printed on boxes — it never changes."
                label="Current barcode"
                mono
                readOnly
                value={skuBarcode}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <span className="ml-1 text-label-caps uppercase text-on-surface-variant">
              Label preview
            </span>

            {hasPreview ? (
              <>
                <BarcodeLabel code={previewCode} productName={values.name || 'Product name'} />
                <p className="ml-1 text-body-sm text-on-surface-variant/60">
                  {isSamplePreview
                    ? 'Sample number — the real barcode is assigned when you save.'
                    : 'This is exactly what prints.'}
                </p>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border p-6 text-center">
                <p className="text-body-sm text-on-surface-variant/60">
                  Enter the barcode from the box to preview the label.
                </p>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section
        icon={<Percent aria-hidden="true" className="size-4 text-outline" strokeWidth={1.5} />}
        title="Taxation & compliance"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field
            error={allErrors.hsnCode}
            hint="Optional. 4 to 8 digits."
            inputMode="numeric"
            label="HSN code"
            onChange={(event) => update('hsnCode', event.target.value)}
            placeholder="8471"
            value={values.hsnCode}
          />

          <div>
            <Select
              error={allErrors.gstPercent}
              hint="Optional."
              label="GST rate"
              onChange={(next) => update('gstPercent', next)}
              options={GST_OPTIONS}
              placeholder="Not specified"
              value={values.gstPercent}
            />
            {values.gstPercent === 'OTHER' ? (
              <CustomOptionField
                badgeLabel="Custom GST Rate"
                error={allErrors.customGst}
                inputMode="decimal"
                label="Custom GST Rate (%)"
                max={100}
                min={0}
                onChange={(event) => update('customGst', event.target.value)}
                placeholder="e.g. 18.5"
                step="0.01"
                type="number"
                value={values.customGst}
              />
            ) : null}
          </div>
        </div>
      </Section>

      {submitError ? (
        <Alert shake tone="error">
          {submitError}
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-3 pb-8 pt-4">
        <Button disabled={isSaving} onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button isLoading={isSaving} type="submit">
          {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Save product'}
        </Button>
      </div>
    </form>
  )
}

interface BarcodeSourceOptionProps {
  checked: boolean
  label: string
  description: string
  onSelect: () => void
}

/**
 * One radio in the SRD §4 Option A / Option B choice.
 *
 * A real `<input type="radio">` drives it — the card is only a label around it — so arrow-key
 * navigation and the accessible name come from the platform rather than a reimplementation.
 */
function BarcodeSourceOption({ checked, label, description, onSelect }: BarcodeSourceOptionProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        checked ? 'border-primary-container bg-primary-container/10' : 'border-border'
      )}
    >
      <input
        checked={checked}
        className="mt-0.5 accent-primary-container"
        name="barcode-source"
        onChange={onSelect}
        type="radio"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-body-md font-semibold text-on-surface">{label}</span>
        <span className="text-body-sm text-on-surface-variant/70">{description}</span>
      </span>
    </label>
  )
}
