import { useState } from 'react'
import { api } from '../lib/api'
import { useCampaigns } from '../hooks/useCampaigns'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

type Step = 'select-campaign' | 'select-file' | 'preview' | 'importing' | 'done' | 'error'

interface ParsedFile {
  total_rows: number
  zero_impression_rows: number
  rows: Record<string, unknown>[]
}

interface ImportResult {
  imported_rows: number
  skipped_rows: number
  zero_impression_rows: number
  total_rows: number
}

const selectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1"

export default function Import() {
  const { campaigns } = useCampaigns()
  const [step, setStep] = useState<Step>('select-campaign')
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null)
  const [filePath, setFilePath] = useState<string>('')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [keepZero, setKeepZero] = useState<boolean | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId)

  const handleSelectFile = async () => {
    const res = await api.dialog.openFile([
      { name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }
    ])
    if (!res.success || !res.data) return
    setFilePath(res.data)

    const parsed = await api.dialog.parseFile(res.data)
    if (!parsed.success || !parsed.data) {
      setErrorMsg(parsed.error ?? 'Failed to parse file')
      setStep('error')
      return
    }
    setParsed(parsed.data as ParsedFile)
    setStep('preview')
  }

  const handleImport = async (keepZeroImp: boolean) => {
    if (!selectedCampaignId || !parsed) return
    setKeepZero(keepZeroImp)
    setStep('importing')

    const res = await api.performance.import(
      { campaign_id: selectedCampaignId, file_path: filePath, keep_zero_impressions: keepZeroImp },
      parsed.rows
    )

    if (!res.success || !res.data) {
      setErrorMsg(res.error ?? 'Import failed')
      setStep('error')
      return
    }
    setResult(res.data as ImportResult)
    setStep('done')
  }

  const reset = () => {
    setStep('select-campaign')
    setSelectedCampaignId(null)
    setFilePath('')
    setParsed(null)
    setKeepZero(null)
    setResult(null)
    setErrorMsg('')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Import Performance Data</h1>
        <p className="text-sm text-muted-foreground mt-1">Import Ad Group level performance data from TTD Excel report</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 text-xs">
        {['Campaign', 'File', 'Preview', 'Done'].map((s, i) => {
          const stepIdx = ['select-campaign', 'select-file', 'preview', 'done'].indexOf(step)
          const active = i === stepIdx
          const done = i < stepIdx
          return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={active ? 'font-medium' : 'text-muted-foreground'}>{s}</span>
              {i < 3 && <div className="w-8 h-px bg-border" />}
            </div>
          )
        })}
      </div>

      {/* Step 1: Select Campaign */}
      {step === 'select-campaign' && (
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="font-medium">1. Select Campaign</h2>
          <p className="text-sm text-muted-foreground">Choose the campaign this data belongs to. Make sure the TTD Campaign ID in the campaign matches the Excel file.</p>
          <div>
            <Label>Campaign</Label>
            <select
              className={selectClass}
              value={selectedCampaignId ?? ''}
              onChange={e => setSelectedCampaignId(Number(e.target.value) || null)}
            >
              <option value="">— Select a campaign —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.ttd_campaign_id ? `(${c.ttd_campaign_id})` : ''}
                </option>
              ))}
            </select>
          </div>
          {selectedCampaign && (
            <div className="bg-muted/40 rounded-md p-3 text-sm space-y-1">
              <div className="flex gap-4">
                <span className="text-muted-foreground">Client:</span><span>{selectedCampaign.client}</span>
                <span className="text-muted-foreground ml-4">TTD ID:</span>
                <span className={selectedCampaign.ttd_campaign_id ? '' : 'text-orange-500'}>
                  {selectedCampaign.ttd_campaign_id || 'Not set — import will not auto-match'}
                </span>
              </div>
              <div className="flex gap-4">
                <span className="text-muted-foreground">Period:</span>
                <span>{selectedCampaign.start_date} → {selectedCampaign.end_date}</span>
              </div>
            </div>
          )}
          <Button onClick={() => setStep('select-file')} disabled={!selectedCampaignId}>
            Next: Select File →
          </Button>
        </div>
      )}

      {/* Step 2: Select File */}
      {step === 'select-file' && (
        <div className="border rounded-lg p-6 space-y-4">
          <h2 className="font-medium">2. Select Excel File</h2>
          <p className="text-sm text-muted-foreground">Select the TTD Ad Group Performance report (.xlsx / .csv)</p>
          <Button onClick={handleSelectFile} variant="outline" className="w-full h-24 flex-col gap-2 border-dashed">
            <Upload size={24} className="text-muted-foreground" />
            <span>Click to select file</span>
          </Button>
          <Button variant="ghost" onClick={() => setStep('select-campaign')}>← Back</Button>
        </div>
      )}

      {/* Step 3: Preview + Zero Impression Decision */}
      {step === 'preview' && parsed && (
        <div className="border rounded-lg p-6 space-y-5">
          <h2 className="font-medium">3. Preview & Options</h2>

          <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-md">
            <FileText size={20} className="text-blue-500 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium">{filePath.split('\\').pop()}</p>
              <p className="text-muted-foreground">{parsed.total_rows} rows total · {parsed.zero_impression_rows} rows with 0 impressions</p>
            </div>
          </div>

          {/* Zero Impression Decision */}
          {parsed.zero_impression_rows > 0 && (
            <div className="border border-orange-200 bg-orange-50 rounded-md p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-800">
                    Detected {parsed.zero_impression_rows} rows with 0 Impressions
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    These rows may contain attribution window conversions — clicks/conversions recorded after the ad impression occurred, with no new impressions in this reporting period.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  onClick={() => handleImport(true)}
                  className="border border-orange-300 bg-white rounded-md p-3 text-left hover:bg-orange-50 transition-colors"
                >
                  <p className="text-sm font-medium">Keep all rows</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Include 0-impression attribution rows ({parsed.zero_impression_rows} rows)</p>
                </button>
                <button
                  onClick={() => handleImport(false)}
                  className="border border-green-300 bg-white rounded-md p-3 text-left hover:bg-green-50 transition-colors"
                >
                  <p className="text-sm font-medium">Skip 0-impression rows</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Import only rows with impressions ({parsed.total_rows - parsed.zero_impression_rows} rows)</p>
                </button>
              </div>
            </div>
          )}

          {parsed.zero_impression_rows === 0 && (
            <Button onClick={() => handleImport(false)} className="w-full">
              Import {parsed.total_rows} rows
            </Button>
          )}

          <Button variant="ghost" onClick={() => setStep('select-file')}>← Back</Button>
        </div>
      )}

      {/* Importing */}
      {step === 'importing' && (
        <div className="border rounded-lg p-12 text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Importing data...</p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && result && (
        <div className="border rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle size={24} className="text-green-500" />
            <h2 className="font-medium text-green-800">Import Successful</h2>
          </div>
          <div className="bg-green-50 rounded-md p-4 text-sm space-y-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Total rows in file</span><span className="font-medium">{result.total_rows}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Imported</span><span className="font-medium text-green-700">{result.imported_rows}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Skipped (0 impressions)</span><span className="font-medium text-orange-600">{result.skipped_rows}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Campaign</span><span className="font-medium">{selectedCampaign?.name}</span></div>
          </div>
          <div className="flex gap-3">
            <Button onClick={reset} variant="outline">Import Another File</Button>
            <Button onClick={() => window.location.hash = '#/dashboard'}>View Dashboard →</Button>
          </div>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="border border-red-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <XCircle size={24} className="text-red-500" />
            <h2 className="font-medium text-red-800">Import Failed</h2>
          </div>
          <p className="text-sm text-red-700 bg-red-50 rounded p-3">{errorMsg}</p>
          <Button onClick={reset} variant="outline">Try Again</Button>
        </div>
      )}
    </div>
  )
}
