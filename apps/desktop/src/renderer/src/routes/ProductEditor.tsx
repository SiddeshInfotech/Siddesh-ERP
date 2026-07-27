import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ProductForm } from '@/components/products/ProductForm'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'
import { SpinnerPane } from '@/components/ui/Spinner'
import { toFormValues, useProduct } from '@/hooks/useProduct'
import { useBrands, useCategories, useUoms } from '@/hooks/useProductLookups'
import {
  StaleProductError,
  useCreateProduct,
  useUpdateProduct
} from '@/hooks/useProductMutations'
import { toUserMessage } from '@/lib/errors'
import { EMPTY_PRODUCT_FORM, type ProductFormErrors, type ProductFormValues } from '@/lib/productForm'

/**
 * New / Edit product (DSK-203, DSK-204, DSK-205, DSK-207).
 *
 * One route serves both: `/products/new` has no id, `/products/:id/edit` does. The form itself
 * is identical either way, and duplicating it would guarantee the two drift.
 */
export function ProductEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEditing = id !== undefined

  const product = useProduct(id)
  const categories = useCategories()
  const brands = useBrands()
  const uoms = useUoms()

  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<ProductFormErrors>({})

  // New identity on every product load would reset the form mid-typing; this keeps it stable.
  const initialValues = useMemo<ProductFormValues>(
    () => (product.data ? toFormValues(product.data) : EMPTY_PRODUCT_FORM),
    [product.data]
  )

  /**
   * Turns a failed save into something the user can act on.
   *
   * Each known failure lands on the field that caused it; anything unrecognised becomes a
   * generic banner, because a raw Postgres error is unreadable and leaks the schema.
   */
  function handleSaveError(error: unknown) {

    if (error instanceof StaleProductError) {
      setSubmitError(
        'Someone else changed this product while you were editing. Reopen it to see their ' +
          'changes before saving again.'
      )
      return
    }

    setSubmitError(toUserMessage(error))
  }

  function handleSubmit(values: ProductFormValues) {
    setSubmitError(null)
    setServerErrors({})

    if (isEditing) {
      if (product.data == null) return

      updateProduct.mutate(
        { id: product.data.id, version: product.data.version, values },
        {
          onSuccess: (saved) => void navigate(`/products/${saved.id}`),
          onError: handleSaveError
        }
      )
      return
    }

    createProduct.mutate(values, {
      // Straight to the detail view: the ST-barcode only exists now, and printing its label is
      // the next thing the storekeeper does (SRD §5 step 2).
      onSuccess: (saved) => void navigate(`/products/${saved.id}`),
      onError: handleSaveError
    })
  }

  const isLoading =
    (isEditing && product.isPending) ||
    categories.isPending ||
    brands.isPending ||
    uoms.isPending

  const loadError = product.error ?? categories.error ?? brands.error ?? uoms.error

  if (loadError !== null) {
    return (
      <div className="flex flex-col gap-gutter">
        <h1 className="text-h1 text-on-surface">{isEditing ? 'Edit product' : 'New product'}</h1>
        <Alert tone="error">{toUserMessage(loadError)}</Alert>
      </div>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <SpinnerPane label="Loading the form…" />
      </Card>
    )
  }

  if (isEditing && product.data === null) {
    return (
      <div className="flex flex-col gap-gutter">
        <h1 className="text-h1 text-on-surface">Product not found</h1>
        <Alert tone="warning">
          This product no longer exists. It may have been removed.{' '}
          <Link className="underline underline-offset-2" to="/products">
            Back to products
          </Link>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-gutter">
      <div>
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-body-sm">
          <Link className="text-on-surface-variant/60 hover:text-on-surface" to="/products">
            Products
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5 text-outline" strokeWidth={1.5} />
          <span className="text-on-surface-variant">{isEditing ? product.data?.name : 'New'}</span>
        </nav>
        <h1 className="text-h1 text-on-surface">{isEditing ? 'Edit product' : 'New product'}</h1>
      </div>

      <ProductForm
        brands={brands.data ?? []}
        categories={categories.data ?? []}
        initialValues={initialValues}
        isEditing={isEditing}
        isSaving={createProduct.isPending || updateProduct.isPending}
        onCancel={() => void navigate(-1)}
        onSubmit={handleSubmit}
        serverErrors={serverErrors}
        submitError={submitError}
        uoms={uoms.data ?? []}
      />
    </div>
  )
}
