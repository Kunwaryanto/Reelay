// Tonight's picks' card, and the row of them: one module, so a card like it elsewhere is this one.
// Everything it does is here: its picture (the title page's: a textless poster, else the wide picture, cropped),
// the reason and title at the top, a small poster with who made it and where it plays at the bottom; a press
// shrinks it, a tap opens the title page (which starts loading on press, `usePageLink`), a hold lifts the small
// poster into the app's poster menu (`useHold`, the card stays pressed meanwhile) and warms the menu's facts.
// Pictures load like any row's: `NearRow` + `NearImage`, a screen and a half before they are seen. Styles: `.spot*`
// in app.css; the reason, `by` (who made it) and `via` (the service to name) come with the card (HomeCard).
import { paths } from '../lib/routes'
import { SERVICE_NAME, metaLine } from '../lib/catalogue'
import type { HomeCard } from '../lib/home'
import { warmFacts } from '../lib/facts'
import { tmdbImage } from '../lib/images'
import { useNavActions } from '../lib/nav'
import { Cover, NearImage, NearRow, joinHandlers, useHold, useLongPress, usePageLink } from '.'

/** Tonight's picks: tall cards side by side, each with its picture, why it is here as a small line over the title,
 *  and at the bottom a small poster with who made it and where it plays (as under a title page's name). */
export function SpotRow({ cards }: { cards: HomeCard[] }) {
  return (
    <NearRow className="spot-row noscroll" role="list">
      {cards.map((card) => <SpotCard key={card.id} card={card} />)}
    </NearRow>
  )
}

export function SpotCard({ card }: { card: HomeCard }) {
  const { push } = useNavActions()
  const onHold = useHold()
  // held: the small poster lifts out into the poster menu, as a poster does
  const hold = useLongPress((el) => onHold(card, el.querySelector<HTMLElement>('.spot-thumb .cover')!), { keepPressed: true })
  const link = usePageLink(paths.title(card.id))
  // the title page's picture (a textless poster fills the tall card best), else the wide one, cropped
  const wide = card.hero_path && !card.hero_poster ? card.hero_path : card.backdrop_path
  const art = card.hero_path && card.hero_poster ? { src: tmdbImage(card.hero_path, 'w780'), sizes: '90vw' }
    : wide ? { src: tmdbImage(wide, 'w780'), srcSet: `${tmdbImage(wide, 'w780')} 780w, ${tmdbImage(wide, 'w1280')} 1280w`, sizes: '90vw' } : null
  // where it plays, always: the one it arrived on or leaves when the pick is about that (the reasons don't name it)
  const service = card.via ?? card.availability[0]?.service_id
  const svc = service ? SERVICE_NAME[service] ?? service : null
  return (
    <div role="listitem" className="spot-item">
      <a className="spot" href={paths.title(card.id)} data-poster={card.hero_poster || undefined}
        {...joinHandlers(hold.handlers, link, { onPointerDown: () => warmFacts([card.id], true) })}
        onClick={(e) => { e.preventDefault(); if (!hold.fired()) push(paths.title(card.id)) }}>
        {art && <NearImage {...art} />}
        <span className="spot-top">
          {card.reason && <small>{card.reason}</small>}
          <b>{card.title}</b>
        </span>
        <span className="spot-bot">
          <span className="spot-thumb"><Cover path={card.poster_path} sizes="40px" /></span>
          <span className="spot-meta">
            {card.by && <span className="spot-by">{card.by}</span>}
            <span>{metaLine(card, svc)}</span>
          </span>
        </span>
      </a>
    </div>
  )
}
