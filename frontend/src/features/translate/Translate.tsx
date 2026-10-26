import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Languages } from 'lucide-react'
import { Button } from '../../components/ui'
import { fields, fieldNames, type VocabularyInput } from '../vocabulary/model'
import type { VocabularyRepository } from '../vocabulary/repository'
import { modes, type TranslationMode, type TranslationResult } from './model'
import { loadUsage, translate } from './service'
import type { TranslationUsage } from './usage'
import './translate.css'

function Entry({
  input,
  repository,
  onSaved,
}: {
  input: VocabularyInput
  repository: VocabularyRepository
  onSaved: () => void
}) {
  const { i18n } = useTranslation()
  const vi = i18n.language === 'vi'
  const [draft, setDraft] = useState(input)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    if (saving || saved) return
    setSaving(true)
    setError('')
    try {
      await repository.create(draft)
      setSaved(true)
      onSaved()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to save vocabulary. Please retry.',
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <article className="translate-entry">
      <header className="translate-word-header">
        <h3>{draft.word}</h3>
        {draft.part_of_speech && (
          <span className="translate-pos">{draft.part_of_speech}</span>
        )}
      </header>
      <dl className="translate-definition">
        {fieldNames
          .filter(
            (key) => key !== 'word' && key !== 'part_of_speech' && draft[key],
          )
          .map((key) => (
            <div key={key} className={`translate-field translate-field-${key}`}>
              <dt>
                {key === 'english_meaning'
                  ? 'Definition'
                  : key === 'vietnamese_meaning'
                    ? 'Translation'
                    : key === 'example_sentence'
                      ? vi
                        ? 'Ví dụ IELTS'
                        : 'IELTS examples'
                      : key === 'note'
                        ? vi
                          ? 'Cách dùng & lưu ý'
                          : 'Usage & notes'
                        : fields[key].label}
              </dt>
              <dd>{draft[key] || '—'}</dd>
            </div>
          ))}
      </dl>
      <details>
        <summary>
          {vi ? 'Chỉnh sửa trước khi lưu' : 'Edit before saving'}
        </summary>
        <fieldset disabled={saving || saved} className="translate-editor">
          {fieldNames.map((key) => (
            <label key={key}>
              {fields[key].label}
              <textarea
                value={draft[key]}
                maxLength={fields[key].limit}
                rows={key === 'word' ? 1 : 3}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </label>
          ))}
        </fieldset>
      </details>
      {error && <p role="alert">{error}</p>}
      <Button disabled={saving || saved} onClick={() => void save()}>
        {saved
          ? vi
            ? 'Đã thêm vào Vocab'
            : 'Added to Vocab'
          : saving
            ? vi
              ? 'Đang lưu…'
              : 'Saving…'
            : vi
              ? 'Thêm vào Vocab'
              : 'Add to Vocab'}
      </Button>
      {saved && (
        <p role="status">
          {vi ? 'Đã lưu trên trình duyệt này.' : 'Saved on this browser.'}
        </p>
      )}
    </article>
  )
}

export function Translate({
  repository,
  onSaved,
}: {
  repository: VocabularyRepository
  onSaved: () => void
}) {
  const { i18n } = useTranslation()
  const vi = i18n.language === 'vi'
  const [text, setText] = useState('')
  const [context, setContext] = useState('')
  const [mode, setMode] = useState<TranslationMode>('auto')
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef<AbortController | null>(null)
  const usageRequest = useRef(0)
  const [usage, setUsage] = useState<TranslationUsage | null>(null)
  const [usageUnavailable, setUsageUnavailable] = useState(false)
  const [clock, setClock] = useState(() => ({ now: Date.now(), offset: 0 }))
  function updateUsage(value: TranslationUsage) {
    setUsage(value)
    setUsageUnavailable(false)
    setClock({ now: Date.now(), offset: value.serverNow - Date.now() })
  }
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => {
      if (request.current) return
      const version = ++usageRequest.current
      void loadUsage(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted && usageRequest.current === version)
            updateUsage(value)
        })
        .catch(() => {
          if (!controller.signal.aborted && usageRequest.current === version)
            setUsageUnavailable(true)
        })
    }
    refresh()
    window.addEventListener('focus', refresh)
    const interval = window.setInterval(refresh, 30000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  useEffect(() => {
    const interval = window.setInterval(
      () => setClock((value) => ({ ...value, now: Date.now() })),
      1000,
    )
    return () => window.clearInterval(interval)
  }, [])
  const seconds = usage
    ? Math.max(0, Math.ceil((usage.retryAt - clock.now - clock.offset) / 1000))
    : 0
  useEffect(
    () => () => {
      request.current?.abort()
    },
    [],
  )
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (request.current || seconds > 0) return
    const controller = new AbortController()
    request.current = controller
    usageRequest.current += 1
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const translated = await translate(
        { text, context, mode },
        controller.signal,
        updateUsage,
      )
      if (!controller.signal.aborted) setResult(translated)
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Translation failed. Please retry.',
        )
    } finally {
      if (request.current === controller) {
        request.current = null
        setBusy(false)
      }
    }
  }
  const labels = vi
    ? ['Tự nhận diện', 'Một từ', 'Cụm từ', 'Danh sách từ', 'Đoạn văn']
    : ['Auto detect', 'Word', 'Phrase', 'Word list', 'Passage']
  return (
    <main className="translate-page">
      <header>
        <p className="eyebrow">ENGLISH → TIẾNG VIỆT</p>
        <h1>Translate</h1>
        <p>
          {vi
            ? 'Hiểu nghĩa theo ngữ cảnh, rồi chọn từ bạn muốn học.'
            : 'Understand the context. Keep the words you want to learn.'}
        </p>
      </header>
      <div className="translate-workbench">
        <form
          onSubmit={(event) => void submit(event)}
          className="translate-form"
        >
          <div className="translate-panel-heading">
            <span className="translate-panel-icon">
              <Languages size={19} aria-hidden="true" />
            </span>
            <h2>
              {vi ? 'Bạn muốn dịch gì?' : 'What would you like to translate?'}
            </h2>
          </div>
          <fieldset disabled={busy}>
            <label>
              {vi ? 'Chế độ' : 'Mode'}
              <select
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as TranslationMode)
                }
              >
                {modes.map((value, index) => (
                  <option key={value} value={value}>
                    {labels[index]}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="translate-text">
              {vi ? 'Nội dung tiếng Anh' : 'English text'}
            </label>
            <textarea
              id="translate-text"
              required
              maxLength={1000}
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="reputation / take into account / a passage…"
              aria-describedby="translate-privacy"
            />
            <p className="translate-character-count">{text.length}/1000</p>
            <label htmlFor="translate-context">
              {vi ? 'Ngữ cảnh (không bắt buộc)' : 'Context (optional)'}
            </label>
            <textarea
              id="translate-context"
              maxLength={1000}
              rows={2}
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder={
                vi
                  ? 'Câu chứa từ hoặc tình huống sử dụng…'
                  : 'A sentence containing the word or its situation…'
              }
            />
            <p className="translate-character-count">{context.length}/1000</p>
          </fieldset>
          <div className="translate-usage">
            {usage && (
              <>
                <strong aria-live="polite">
                  {vi
                    ? `Còn ${usage.remaining}/${usage.limit} lượt hôm nay`
                    : `${usage.remaining}/${usage.limit} translations remaining today`}
                </strong>
                {usage.remaining === 0 ? (
                  <p>
                    {vi ? 'Dùng lại lúc ' : 'Available again at '}
                    {new Date(usage.retryAt).toLocaleString(
                      vi ? 'vi-VN' : 'en-GB',
                    )}
                  </p>
                ) : seconds > 0 ? (
                  <p>
                    {vi
                      ? `Có thể dịch tiếp sau ${seconds} giây.`
                      : `Translate again in ${seconds} seconds.`}
                  </p>
                ) : null}
              </>
            )}
            {usageUnavailable && (
              <p>
                {vi
                  ? 'Chưa tải được hạn mức. Server vẫn kiểm tra khi bạn gửi yêu cầu.'
                  : 'Usage could not be refreshed. Limits are still enforced by the server.'}
              </p>
            )}
            <p>
              {vi
                ? 'Lượt tính khi yêu cầu được gửi tới AI, kể cả khi lỗi hoặc hủy. Đặt lại lúc 00:00 (UTC+7).'
                : 'Requests sent to AI count even if they fail or are cancelled. Resets at 00:00 (UTC+7).'}
            </p>
          </div>
          <div className="translate-actions">
            <Button
              type="submit"
              disabled={busy || !text.trim() || seconds > 0}
            >
              {vi ? 'Dịch & giải thích' : 'Translate & explain'}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
            {busy && (
              <Button
                type="button"
                variant="outline"
                onClick={() => request.current?.abort()}
              >
                {vi ? 'Hủy' : 'Cancel'}
              </Button>
            )}
          </div>
        </form>
        <section
          className="translate-output"
          aria-label={vi ? 'Kết quả dịch' : 'Translation result'}
        >
          <div className="translate-output-heading">
            <span className="translate-panel-icon">
              <BookOpen size={19} aria-hidden="true" />
            </span>
            <h2>{vi ? 'Kết quả' : 'Your translation'}</h2>
            {result && (
              <span className="translate-result-count">
                {result.entries.length} {vi ? 'mục từ' : 'entries'}
              </span>
            )}
          </div>
          {busy && <p role="status">{vi ? 'Đang dịch…' : 'Translating…'}</p>}
          {error && <p role="alert">{error}</p>}
          {!result && !busy && !error && (
            <div className="translate-empty">
              <BookOpen size={32} strokeWidth={1.4} aria-hidden="true" />
              <h3>
                {vi
                  ? 'Mỗi từ, thêm một điều mới'
                  : 'A little more meaning in every word'}
              </h3>
              <p>
                {vi
                  ? 'Nhập từ hoặc đoạn văn bên trái. Bản dịch, giải thích và ví dụ sẽ xuất hiện tại đây.'
                  : 'Enter a word or passage on the left. Its translation, meaning and examples will appear here.'}
              </p>
            </div>
          )}
          {result && (
            <>
              <div className="translate-overview">
                <h3>{vi ? 'Bản dịch' : 'Translation'}</h3>
                <p className="translate-copy">{result.translation}</p>
              </div>
              <p className="translate-hint">
                {vi
                  ? 'Ví dụ IELTS do AI tạo để minh họa. Hãy kiểm tra nghĩa trước khi lưu.'
                  : 'IELTS examples are AI-generated illustrations. Review meanings before saving.'}
              </p>
              {result.entries.map((entry, index) => (
                <Entry
                  key={index}
                  input={entry}
                  repository={repository}
                  onSaved={onSaved}
                />
              ))}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
