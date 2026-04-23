import { useState, useEffect, useCallback } from 'react'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'

const TOUR_KEY = 'campaign_tracker_tour_done'

interface Step {
  title: string
  description: string
  // CSS selector of the element to highlight (optional)
  target?: string
  // Which side to show the tooltip relative to the target
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  icon: string
}

const STEPS: Step[] = [
  {
    icon: '👋',
    title: 'Welcome to Campaign Tracker',
    description: 'This is your personal tool for tracking TTD campaign performance. This quick tour will show you the key features. It only takes 30 seconds!',
    placement: 'center',
  },
  {
    icon: '📋',
    title: 'Campaigns',
    description: 'Add and manage your campaigns here. Each campaign stores details like client, ad type, KPIs, budget, flights (time segments), and associated deals.',
    target: '[data-tour="nav-campaigns"]',
    placement: 'right',
  },
  {
    icon: '📅',
    title: 'Timeline',
    description: 'See all your campaigns on a Gantt chart. Blue vertical line = today. Click any campaign bar to see its details. Use the search box or month picker to navigate quickly.',
    target: '[data-tour="nav-timeline"]',
    placement: 'right',
  },
  {
    icon: '📥',
    title: 'Import',
    description: 'Import TTD Ad Group performance reports (.xlsx). The tool auto-detects rows with 0 impressions (attribution window data) and lets you choose whether to keep them.',
    target: '[data-tour="nav-import"]',
    placement: 'right',
  },
  {
    icon: '📊',
    title: 'Dashboard',
    description: 'View performance metrics after importing data. KPI cards, a dual-metric trend chart (pick any two metrics to compare), attribution windows (Reporting Columns), and Ad Group breakdown.',
    target: '[data-tour="nav-dashboard"]',
    placement: 'right',
  },
  {
    icon: '⚙️',
    title: 'Settings',
    description: 'Check for app updates from GitHub, or delete imported performance data for specific campaigns. You can also restart this tour from Settings anytime.',
    target: '[data-tour="nav-settings"]',
    placement: 'right',
  },
  {
    icon: '🔄',
    title: 'Refresh Button',
    description: 'The Refresh button in the top-right corner reloads the current page\'s data — useful after importing new data or making changes.',
    target: '[data-tour="refresh-btn"]',
    placement: 'bottom',
  },
  {
    icon: '✅',
    title: 'You\'re all set!',
    description: 'Start by creating your first campaign, then import performance data to see it on the Dashboard. Have questions? Check the README on GitHub.',
    placement: 'center',
  },
]

interface HighlightRect { top: number; left: number; width: number; height: number }

function getRect(selector: string): HighlightRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

const PAD = 8

export function useTour() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(TOUR_KEY)
    if (!done) {
      // slight delay so layout renders first
      const t = setTimeout(() => setVisible(true), 600)
      return () => clearTimeout(t)
    }
  }, [])

  const startTour = useCallback(() => setVisible(true), [])
  const endTour = useCallback(() => {
    localStorage.setItem(TOUR_KEY, '1')
    setVisible(false)
  }, [])

  return { visible, startTour, endTour }
}

interface TourProps {
  visible: boolean
  onEnd: () => void
}

export function Tour({ visible, onEnd }: TourProps) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<HighlightRect | null>(null)

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  // Update highlight rect when step changes
  useEffect(() => {
    if (!visible) return
    setStep(0)
  }, [visible])

  useEffect(() => {
    if (!visible || !current.target) { setRect(null); return }
    // Wait a tick for any layout
    const t = setTimeout(() => setRect(getRect(current.target!)), 50)
    return () => clearTimeout(t)
  }, [step, visible, current.target])

  if (!visible) return null

  const next = () => { if (!isLast) setStep(s => s + 1); else onEnd() }
  const prev = () => { if (!isFirst) setStep(s => s - 1) }
  const skip = () => onEnd()

  // Tooltip position relative to highlighted rect
  const tooltipStyle = (): React.CSSProperties => {
    if (!rect || current.placement === 'center' || !current.placement) {
      return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 360 }
    }
    const gap = 16
    switch (current.placement) {
      case 'right':
        return { position: 'fixed', top: rect.top + rect.height / 2, left: rect.left + rect.width + gap, transform: 'translateY(-50%)', width: 300 }
      case 'left':
        return { position: 'fixed', top: rect.top + rect.height / 2, left: rect.left - 300 - gap, transform: 'translateY(-50%)', width: 300 }
      case 'bottom':
        return { position: 'fixed', top: rect.top + rect.height + gap, left: rect.left + rect.width / 2, transform: 'translateX(-50%)', width: 300 }
      case 'top':
        return { position: 'fixed', top: rect.top - gap, left: rect.left + rect.width / 2, transform: 'translate(-50%, -100%)', width: 300 }
      default:
        return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 360 }
    }
  }

  return (
    <>
      {/* Dark overlay */}
      <div className="fixed inset-0 z-[9998] pointer-events-none" style={{ background: 'rgba(0,0,0,0.55)' }} />

      {/* Highlight cutout using box-shadow trick */}
      {rect && (
        <div
          className="fixed z-[9998] rounded-lg pointer-events-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            border: '2px solid #3b82f6',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="fixed z-[9999] bg-white rounded-xl shadow-2xl p-5 pointer-events-auto"
        style={tooltipStyle()}
      >
        {/* Progress dots */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-blue-500' : 'w-1.5 bg-muted'}`}
              />
            ))}
          </div>
          <button onClick={skip} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="text-2xl mb-2">{current.icon}</div>
        <h3 className="font-semibold text-base mb-1.5">{current.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={prev}
            disabled={isFirst}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded-md hover:bg-muted"
          >
            <ChevronLeft size={14} /> Back
          </button>

          <span className="text-xs text-muted-foreground">{step + 1} / {STEPS.length}</span>

          <button
            onClick={next}
            className="flex items-center gap-1 text-xs font-medium bg-blue-500 text-white px-3 py-1.5 rounded-md hover:bg-blue-600 transition-colors"
          >
            {isLast ? 'Get Started' : 'Next'} {!isLast && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </>
  )
}
