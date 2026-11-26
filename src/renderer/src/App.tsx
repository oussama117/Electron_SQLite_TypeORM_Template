import { HashRouter, Route, Routes } from 'react-router-dom'
import Registration from './pages/registration/registration'
import Settings from './pages/settings/settings'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
// import { useAppSettingsStore } from './store/useAppSettingStore'

function App(): React.JSX.Element {
  const { t } = useTranslation()
  // const { settings } = useAppSettingsStore()
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Prevent the default Esc behavior (like exiting full screen)
        // if you want total control.
        event.preventDefault()

        const confirmed = window.confirm(t('system.close_app'))

        if (confirmed) {
          // Call the exposed API from preload
          window.api.requestAppClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [t])
  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Registration />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </HashRouter>
    </>
  )
}

export default App
