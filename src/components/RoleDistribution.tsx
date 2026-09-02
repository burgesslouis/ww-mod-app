import { ArrowRight, Check, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { GameSession } from '../domain/types'
import { availableDealCards, confirmDealCard, finishRoleDeal, pickDealCard } from '../engine/dealing'
import { currentState } from '../engine/engine'
import { capitaliseLabel } from '../ui/labels'

const cardBackUrl = `${import.meta.env.BASE_URL}role-card-back.png`

export default function RoleDistribution({ session, onChange }: { session: GameSession; onChange: (next: GameSession) => Promise<void> }) {
  const deal = session.roleDeal!
  const player = session.setup.players[deal.picks.length]
  const [uncovered, setUncovered] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [concealed, setConcealed] = useState(false)
  const saving = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const cards = availableDealCards(session)
  const selectedCard = deal.cards.find((card) => card.id === deal.selectedCardId)
  const rules = currentState(session).rules
  const role = rules.roles.find((role) => role.id === selectedCard?.roleId)
  const faction = [...rules.scenario.factions, ...rules.scenario.packs.flatMap((pack) => pack.factions ?? [])].find((faction) => faction.id === role?.faction)
  const traitDefinitions = [...rules.scenario.packs.flatMap((pack) => pack.traitDefinitions ?? []), ...(role?.traitDefinitions ?? [])]

  useEffect(() => {
    window.scrollTo({ top: 0 })
    heading.current?.focus()
  }, [player?.id, uncovered, selectedCard?.id])
  useEffect(() => {
    const cover = () => { if (document.hidden) setUncovered(false) }
    document.addEventListener('visibilitychange', cover)
    return () => document.removeEventListener('visibilitychange', cover)
  }, [])

  async function save(action: (session: GameSession) => GameSession, hideRole = false) {
    if (saving.current) return
    saving.current = true; setBusy(true); setError('')
    if (hideRole) setConcealed(true)
    try {
      await onChange(action(session))
      if (hideRole) setUncovered(false)
    } catch {
      setError('Could not save your progress. Please try again before passing the phone.')
    } finally {
      saving.current = false; setBusy(false); setConcealed(false)
    }
  }

  return <main className="role-distribution">
    <header className="deal-header"><span>WHEREWOLF</span><span>{deal.picks.length} / {session.setup.players.length} ready</span></header>
    {concealed ? <section className="deal-handoff"><p role="status">Saving…</p></section> : !player ? <section className="deal-handoff">
      <Check className="deal-symbol" />
      <h1 ref={heading} tabIndex={-1}>All roles dealt</h1>
      <p>Return the phone to the moderator.</p>
      <button className="primary" disabled={busy} onClick={() => save(finishRoleDeal)}>Begin game <ArrowRight /></button>
    </section> : !uncovered ? <section className="deal-handoff">
      <Smartphone className="deal-symbol" />
      <span className="eyebrow">PASS THE PHONE TO</span>
      <h1 ref={heading} tabIndex={-1}>{player.name}</h1>
      <p>Only look when it is your turn.</p>
      <button className="primary" disabled={busy} onClick={() => setUncovered(true)}>{selectedCard ? 'View my card' : 'Choose my card'} <ArrowRight /></button>
    </section> : selectedCard && role ? <section className="deal-reveal">
      <p className="deal-player">{player.name}, this is your role.</p>
      <div className="deal-flip" key={selectedCard.id}>
        <div className="deal-flipper">
          <div className="deal-flip-back" aria-hidden="true"><img src={cardBackUrl} alt="" /></div>
          <article className="deal-role-front">
            <img className="deal-crest" src={`${import.meta.env.BASE_URL}lantern-logo.png`} alt="" />
            <span className="eyebrow">YOUR ROLE</span>
            <h1 ref={heading} tabIndex={-1}>{role.meta.name}</h1>
            {faction && <p className="deal-faction">{faction.name}</p>}
            <p className="deal-summary">{role.text.summary}</p>
            {role.text.description !== role.text.summary && <p className="deal-description">{role.text.description}</p>}
            {role.traits.length > 0 && <div className="deal-traits">{role.traits.map((id) => {
              const trait = traitDefinitions.find((trait) => trait.id === id)
              return <span key={id} style={{ borderColor: trait?.colour }}>{trait?.label ?? capitaliseLabel(id.split('.').at(-1)?.replace(/-/g, ' ') ?? id)}</span>
            })}</div>}
          </article>
        </div>
      </div>
      <button className="primary deal-ready" disabled={busy} onClick={() => save(confirmDealCard, true)}>Ready <Check /></button>
      <p className="deal-hint">Your card will close before the phone is passed on.</p>
    </section> : <section className="deal-selection">
      <h1 ref={heading} tabIndex={-1}>{player.name}, pick a card</h1>
      <p>Tap a card to turn it over.</p>
      <div className="deal-card-grid">{cards.map((card, index) => <button className="deal-card-back" key={card.id} disabled={busy} aria-label={`Pick card ${index + 1}`} onClick={() => save((current) => pickDealCard(current, card.id))}><img src={cardBackUrl} alt="" draggable={false} /></button>)}</div>
    </section>}
    {error && <div className="error-banner" role="alert">{error}</div>}
  </main>
}
