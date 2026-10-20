import { useUiText } from '../../lib/useUiText'
import { useEffect, useRef, useState } from 'react'
import { fieldNames } from '../vocabulary/model'
import { templateExamples } from '../spreadsheet/template'
import './tutorial.css'
import i18n from '../../lib/i18n'
import { DonationQr } from '../donation/DonationQr'

const titles = [
  'Một cuốn vở từ vựng, và hơn thế nữa.',
  'Bạn đã có file Excel từ vựng chưa?',
  'Từ file Excel đến bộ từ của bạn.',
  'Ghi chép rồi, cùng luyện nhớ nhé!',
  'Chúc bạn sớm đạt aim!',
]
const labels = ['Xin chào', 'Chuẩn bị', 'Bắt đầu', 'Luyện tập', 'Gửi bạn']

export function Tutorial({ onClose }: { onClose: () => void }) {
  const t = useUiText()

  const dialog = useRef<HTMLDialogElement>(null)
  const card = useRef<HTMLElement>(null)
  const transition = useRef<{
    outgoing: HTMLElement
    exit: Animation
    enter: Animation
  } | null>(null)
  const [step, setStep] = useState(0)
  const content = useRef<HTMLDivElement>(null)

  function clearTransition() {
    const current = transition.current
    transition.current = null
    current?.exit.cancel()
    current?.enter.cancel()
    current?.outgoing.remove()
  }

  function changeStep(newStep: number) {
    if (newStep === step || newStep < 0 || newStep >= titles.length) return
    clearTransition()
    const element = card.current
    if (
      element?.animate &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      // Keep an inert visual snapshot while React updates the active card.
      const outgoing = element.cloneNode(true) as HTMLElement
      outgoing.classList.add('tutorial-card-leaving')
      outgoing.setAttribute('aria-hidden', 'true')
      outgoing.inert = true
      outgoing
        .querySelectorAll('[id]')
        .forEach((node) => node.removeAttribute('id'))
      element.parentElement?.append(outgoing)
      const outgoingContent = outgoing.querySelector('.tutorial-content')
      if (outgoingContent)
        outgoingContent.scrollTop = content.current?.scrollTop ?? 0
      const sign = newStep > step ? 1 : -1
      const timing = {
        duration: 460,
        easing: 'cubic-bezier(0.22, 0.7, 0.2, 1)',
        fill: 'both' as const,
      }
      const exit = outgoing.animate(
        [
          { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
          {
            transform: `translateX(${sign * 110}%) translateY(-24px) rotate(${sign * 14}deg)`,
            opacity: 0,
          },
        ],
        timing,
      )
      const enter = element.animate(
        [
          {
            transform: `translateY(28px) scale(0.94) rotate(${-sign * 3}deg)`,
            opacity: 0.6,
          },
          { transform: 'translateY(0) scale(1) rotate(0deg)', opacity: 1 },
        ],
        timing,
      )
      const current = { outgoing, exit, enter }
      transition.current = current
      void Promise.all([exit.finished, enter.finished]).then(
        () => {
          if (transition.current === current) clearTransition()
        },
        () => {
          if (transition.current === current) clearTransition()
        },
      )
    }
    setStep(newStep)
  }

  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.setProperty('overflow', 'hidden')
    element?.showModal()
    return () => {
      clearTransition()
      element?.close()
      document.body.style.setProperty('overflow', previousOverflow)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    if (content.current) content.current.scrollTop = 0
  }, [step])

  return (
    <dialog
      ref={dialog}
      className="tutorial-dialog"
      aria-labelledby="tutorial-title"
      lang={i18n.resolvedLanguage}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="tutorial-stack">
        <article className="tutorial-card" ref={card}>
          <header className="tutorial-header">
            <span>{t('ENGLISH HUB / TUTORIAL')}</span>
            <button
              type="button"
              aria-label={t('Đóng hướng dẫn')}
              onClick={onClose}
            >
              {t('×')}
            </button>
          </header>
          <div className="tutorial-content" ref={content}>
            <div key={step} className="tutorial-page" aria-live="polite">
              <span className="tutorial-number" aria-hidden="true">
                0{step + 1}
              </span>
              <p className="tutorial-label">{t(labels[step])}</p>
              <h2 id="tutorial-title">{t(titles[step])}</h2>
              {step === 0 && (
                <>
                  <p>
                    {t(
                      'Đây là một web thay thế cuốn vở ghi chép từ vựng của bạn, có thêm các tính năng hỗ trợ học để mỗi từ mới không chỉ được ghi lại, mà còn được nhớ lâu hơn.',
                    )}
                  </p>
                  <div className="tutorial-note">
                    {t(
                      'Ghi từ mới → Sắp xếp → Ôn bằng thẻ → Thử sức với quiz.',
                    )}
                  </div>
                  <p>
                    {t(
                      'Không cần đăng ký. Từ vựng được lưu ngay trên thiết bị bạn đang dùng.',
                    )}
                  </p>
                  <p className="tutorial-signature">author: minleo</p>
                </>
              )}
              {step === 1 && (
                <>
                  <p>
                    {t(
                      'Có rồi? Bạn có thể nhập file .xlsx để tiếp tục học với bộ từ của mình. Chưa có? Tham khảo mẫu dưới đây hoặc thêm từ trực tiếp trong tab Vocabulary.',
                    )}
                  </p>
                  <div
                    className="tutorial-sheet"
                    role="region"
                    aria-label={t('Mẫu Excel từ vựng')}
                    tabIndex={0}
                  >
                    <table>
                      <caption>
                        {t(
                          'vocabulary-example.xlsx · Vuốt ngang để xem đủ 8 cột',
                        )}
                      </caption>
                      <thead>
                        <tr>
                          {fieldNames.map((field) => (
                            <th scope="col" key={field}>
                              {field}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {templateExamples.map((row) => (
                          <tr key={row.word}>
                            {fieldNames.map((field) => (
                              <td key={field}>{row[field]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    {t(
                      'Dòng đầu là tên cột, mỗi dòng tiếp theo là một từ. Cần có word và ít nhất một nghĩa tiếng Anh hoặc tiếng Việt; các cột còn lại có thể để trống.',
                    )}
                  </p>
                  <div className="tutorial-note">
                    {t(
                      'Muốn tải mẫu? Vào Vocabulary → Excel import / export → Download example workbook.',
                    )}
                  </div>
                </>
              )}
              {step === 2 && (
                <ol className="tutorial-steps">
                  <li>
                    <strong>{t('Mở công cụ Excel.')}</strong>
                    {t('Vào tab Vocabulary, chọn Excel import / export.')}
                  </li>
                  <li>
                    <strong>{t('Chọn file.')}</strong>
                    {t(
                      'Tại XLSX file, tải file .xlsx tối đa 5 MiB. Web đọc sheet đầu tiên, với tên cột ở dòng 1; không dùng ô công thức.',
                    )}
                  </li>
                  <li>
                    <strong>{t('Ghép cột.')}</strong>
                    {t(
                      'Trong Map columns, ghép Word và ít nhất một cột nghĩa tương ứng với file của bạn.',
                    )}
                  </li>
                  <li>
                    <strong>{t('Xem trước và xác nhận.')}</strong>
                    {t(
                      'Bấm Preview import, kiểm tra dòng lỗi và cách xử lý từ trùng, rồi bấm Confirm import để lưu.',
                    )}
                  </li>
                  <li>
                    <strong>{t('Dùng tab Vocabulary.')}</strong>
                    {t(
                      'Tìm từ bằng Search, lọc loại từ, bấm vào ô để sửa hoặc chọn Add vocabulary để thêm từ mới.',
                    )}
                  </li>
                </ol>
              )}
              {step === 3 && (
                <>
                  <p>
                    {t(
                      'Hai cách ôn tập để biến bộ từ đã ghi thành kiến thức của bạn.',
                    )}
                  </p>
                  <section className="tutorial-feature">
                    <h3>{t('▱ Flashcards')}</h3>
                    <p>
                      {t(
                        'Chọn số thẻ rồi bấm Start session. Thử nhớ nghĩa trước khi bấm Flip card, sau đó tự đánh giá để theo dõi việc ôn tập.',
                      )}
                    </p>
                  </section>
                  <section className="tutorial-feature">
                    <h3>{t('✓ Quiz')}</h3>
                    <p>
                      {t(
                        'Chọn số câu rồi bấm Start quiz. Trả lời các câu hỏi trắc nghiệm và xem lại kết quả để biết mình cần ôn thêm từ nào.',
                      )}
                    </p>
                  </section>
                  <div className="tutorial-note">
                    {t(
                      'Một chút mỗi ngày. Học theo nhịp của bạn, tiến bộ theo cách của bạn.',
                    )}
                  </div>
                </>
              )}
              {step === 4 && (
                <>
                  <p>
                    {t(
                      'Dù aim của bạn là điểm thi, giao tiếp tự tin hơn hay đọc hiểu những điều mình thích, chúc bạn luôn giữ được động lực và từng bước chạm tới mục tiêu nhé.',
                    )}
                  </p>
                  <div className="tutorial-note">
                    {t(
                      'Nếu thấy web hữu ích và có thể, bạn hãy support mình bằng một khoản donate nhỏ để mình có thêm động lực phát triển và hướng tới ra mắt nhiều tính năng AI hơn trong tương lai.',
                    )}
                  </div>
                  <DonationQr />
                  <p>{t('Cảm ơn bạn đã ghé qua và học cùng English Hub ♡')}</p>
                  <p className="tutorial-signature">{t('— minleo')}</p>
                </>
              )}
            </div>
          </div>
          <footer className="tutorial-footer">
            <div
              className="tutorial-progress"
              aria-label={t('Thẻ {{value0}} trên {{value1}}', {
                value0: step + 1,
                value1: titles.length,
              })}
            >
              {titles.map((title, index) => (
                <button
                  type="button"
                  key={title}
                  aria-label={t('Đến thẻ {{value0}}', { value0: index + 1 })}
                  aria-current={step === index ? 'step' : undefined}
                  onClick={() => changeStep(index)}
                />
              ))}
              <span>
                {step + 1} / {titles.length}
              </span>
            </div>
            <div className="tutorial-actions">
              <button
                type="button"
                disabled={step === 0}
                onClick={() => changeStep(step - 1)}
              >
                {t('Quay lại')}
              </button>
              <button
                type="button"
                className="tutorial-next"
                onClick={() =>
                  step === titles.length - 1 ? onClose() : changeStep(step + 1)
                }
              >
                {step === titles.length - 1
                  ? t('Bắt đầu học thôi')
                  : t('Tiếp theo →')}
              </button>
            </div>
          </footer>
        </article>
      </div>
    </dialog>
  )
}
