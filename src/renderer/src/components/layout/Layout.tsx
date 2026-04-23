import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { RefreshCw } from 'lucide-react'
import { Tour, useTour } from '../tour/Tour'

export default function Layout() {
  const [spinning, setSpinning] = useState(false)
  const navigate = useNavigate()
  const { visible, startTour, endTour } = useTour()

  const handleRefresh = () => {
    setSpinning(true)
    const path = window.location.hash.replace('#', '') || '/'
    navigate('/___reload___', { replace: true })
    setTimeout(() => {
      navigate(path, { replace: true })
      setSpinning(false)
    }, 100)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-end px-6 py-2 border-b bg-background/80 flex-shrink-0 gap-3">
          <button
            onClick={startTour}
            title="Restart tutorial"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
          >
            ? Tour
          </button>
          <button
            data-tour="refresh-btn"
            onClick={handleRefresh}
            title="Refresh page data"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
          >
            <RefreshCw size={13} className={spinning ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet context={{ startTour }} />
        </main>
      </div>

      <Tour visible={visible} onEnd={endTour} />
    </div>
  )
}
