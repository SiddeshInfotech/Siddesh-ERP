import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertModal, type AlertOptions } from '@/components/ui/AlertModal'

type AlertFunction = (options: AlertOptions | string) => Promise<void>

const AlertContext = createContext<AlertFunction | null>(null)

interface ModalState {
  isOpen: boolean
  options: AlertOptions | null
  resolve: (() => void) | null
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    options: null,
    resolve: null
  })

  const alert = useCallback((options: AlertOptions | string): Promise<void> => {
    const opts: AlertOptions = typeof options === 'string' ? { description: options } : options
    return new Promise<void>((resolve) => {
      setModalState({
        isOpen: true,
        options: opts,
        resolve
      })
    })
  }, [])

  const handleClose = useCallback(() => {
    if (modalState.resolve) {
      modalState.resolve()
    }
    setModalState({ isOpen: false, options: null, resolve: null })
  }, [modalState])

  return (
    <AlertContext.Provider value={alert}>
      {children}
      {modalState.options && (
        <AlertModal
          isOpen={modalState.isOpen}
          onClose={handleClose}
          {...modalState.options}
        />
      )}
    </AlertContext.Provider>
  )
}

export function useAlert(): AlertFunction {
  const context = useContext(AlertContext)
  if (!context) {
    throw new Error('useAlert must be used inside an AlertProvider')
  }
  return context
}
