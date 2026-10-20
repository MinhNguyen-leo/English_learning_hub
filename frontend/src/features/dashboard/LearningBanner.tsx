import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useRef, type PointerEvent } from 'react'
import { Button } from '../../components/ui'
import { useUiText } from '../../lib/useUiText'
import './learning-banner.css'

export function LearningBanner({
  onStudy,
}: {
  onStudy: (() => void) | undefined
}) {
  const t = useUiText()
  const globeRef = useRef<HTMLDivElement>(null)

  function rotateGlobe(event: PointerEvent<HTMLElement>) {
    const globe = globeRef.current
    if (
      !globe ||
      event.pointerType === 'touch' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return

    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const x = Math.max(
      -1,
      Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2),
    )
    const y = Math.max(
      -1,
      Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2),
    )
    globe.style.animation = 'none'
    globe.style.transform = `translate(-50%, -50%) rotateX(${62 - y * 22}deg) rotateY(${-18 + x * 35}deg) rotateZ(-28deg)`
  }

  function resetGlobe() {
    if (globeRef.current) globeRef.current.style.transform = ''
  }

  return (
    <section
      className="learning-banner"
      aria-labelledby="learning-banner-title"
      onPointerMove={rotateGlobe}
      onPointerLeave={resetGlobe}
      onPointerCancel={resetGlobe}
    >
      <div className="learning-banner-copy">
        <p className="learning-banner-eyebrow">
          <Sparkles size={14} aria-hidden="true" />
          {t('A LITTLE EVERY DAY. A WORLD OF POSSIBILITIES.')}
        </p>
        <h2 id="learning-banner-title">
          {t('Small steps.')}
          <br />
          <span>{t('Limitless English.')}</span>
        </h2>
        <p className="learning-banner-description">
          {t(
            'Turn your daily momentum into lasting knowledge. Your next word opens a new world.',
          )}
        </p>
        {onStudy && (
          <Button className="learning-banner-cta" onClick={onStudy}>
            {t('Explore flashcards')}{' '}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Button>
        )}
        <p className="learning-banner-note">
          {t('Your pace. Your progress. All saved on this device.')}
        </p>
      </div>
      <div className="learning-banner-art" aria-hidden="true">
        <div className="learning-banner-orbit" />
        <div className="learning-banner-satellite learning-banner-satellite-top" />
        <div className="learning-banner-satellite learning-banner-satellite-bottom" />
        <div className="learning-banner-globe" ref={globeRef}>
          {Array.from({ length: 19 }, (_, index) => {
            const depth = (index - 9) / 10
            const diameter = Math.sqrt(1 - depth * depth) * 100
            return (
              <span
                key={index}
                className="learning-banner-slice"
                style={{
                  width: `${diameter}%`,
                  height: `${diameter}%`,
                  transform: `translate(-50%, -50%) translateZ(${depth * 130}px)`,
                }}
              />
            )
          })}
        </div>
        <span className="learning-banner-art-label">LEARN · GROW · REPEAT</span>
      </div>
    </section>
  )
}
