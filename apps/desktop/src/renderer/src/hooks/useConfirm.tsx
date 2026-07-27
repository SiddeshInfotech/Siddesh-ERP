import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { ConfirmModal, type ConfirmOptions } from '@/components/ui/ConfirmModal'

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFunction | null>(null)

interface ModalState {
  isOpen: boolean
  options: ConfirmOptions | null
  resolve: ((value: boolean) => void) | null
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    options: null,
    resolve: null
  })

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setModalState({
        isOpen: true,
        options,
        resolve
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (modalState.resolve) {
      modalState.resolve(true)
    }
    setModalState({ isOpen: false, options: null, resolve: null })
  }, [modalState])

  const handleCancel = useCallback(() => {
    if (modalState.resolve) {
      modalState.resolve(false)
    }
    setModalState({ isOpen: false, options: null, resolve: null })
  }, [modalState])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {modalState.options && (
        <ConfirmModal
          isOpen={modalState.isOpen}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          {...modalState.options}
        />
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFunction {
  const context = useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used inside a ConfirmProvider')
  }
  return context
}
