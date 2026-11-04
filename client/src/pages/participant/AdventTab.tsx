import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Sheet, useToast } from '../../components/ui';
import { ADVENT_DOORS, type AdventDoor } from '../../lib/advent';
import { api, errorMessage } from '../../lib/api';
import { adventCandles, daysBetween } from '../../lib/format';
import type { TabProps } from './Participant';

/** A fixed "random" order, so the calendar looks like a real one and stays the same every day. */
const ORDER = [7, 15, 1, 20, 24, 11, 3, 18, 9, 6, 22, 13, 2, 17, 10, 23, 5, 14, 19, 8, 12, 21, 4, 16];
const BIG = 24;
const WIDE = 6;

/** Same rule as the server: December day by day, all of them in January. */
export function maxOpenableDoor(todayIso: string) {
  const month = Number(todayIso.slice(5, 7));
  const day = Number(todayIso.slice(8, 10));
  if (month === 12) return Math.min(day, 24);
  if (month === 1) return 24;
  return 0;
}

const CANDLE_TEXT = ['', 'Die erste Kerze brennt', 'Zwei Kerzen brennen', 'Drei Kerzen brennen', 'Alle vier Kerzen brennen'];

export function AdventTab({ data, token, update }: TabProps) {
  const toast = useToast();
  const [shown, setShown] = useState<AdventDoor | null>(null);
  const today = data.today;
  const maxDoor = maxOpenableDoor(today);
  const todayDay = Number(today.slice(5, 7)) === 12 ? Number(today.slice(8, 10)) : 0;
  const opened = new Set(data.me.openedDoors);
  const candles = adventCandles(today);
  const afterChristmas = todayDay > 24 || Number(today.slice(5, 7)) === 1;

  let subline: string;
  if (afterChristmas) subline = 'Frohe Weihnachten! Alle Türchen sind offen.';
  else if (maxDoor === 0) {
    const days = daysBetween(today, `${today.slice(0, 4)}-12-01`);
    subline = days === 1 ? 'Morgen geht das erste Türchen auf!' : `Noch ${days} Tage, dann geht das erste Türchen auf.`;
  } else subline = candles > 0 ? `${CANDLE_TEXT[candles]} – heute ist Türchen ${maxDoor} dran.` : `Heute ist Türchen ${maxDoor} dran.`;

  const open = async (door: AdventDoor) => {
    if (opened.has(door.day)) {
      setShown(door);
      return;
    }
    if (door.day > maxDoor) {
      if (maxDoor === 0) toast('Geduld! Die Türchen gehen erst im Dezember auf. 🤫', 'info');
      else {
        const wait = door.day - maxDoor;
        toast(wait === 1 ? `Nur noch 1 Mal schlafen, dann ist Türchen ${door.day} dran!` : `Noch ${wait} Mal schlafen bis Türchen ${door.day}.`, 'info');
      }
      return;
    }
    const before = data.me.openedDoors;
    update((d) => ({ ...d, me: { ...d.me, openedDoors: [...d.me.openedDoors, door.day].sort((a, b) => a - b) } }));
    setShown(door);
    try {
      const res = await api.me.openDoor(token, door.day);
      update((d) => ({ ...d, me: { ...d.me, openedDoors: res.openedDoors } }));
    } catch (err) {
      update((d) => ({ ...d, me: { ...d.me, openedDoors: before } }));
      setShown(null);
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-4">
      <header className="mt-2 flex items-center gap-3 animate-fade-up">
        <img src="/img/adventkranz-256.webp" alt="" width={256} height={225} className="h-24 w-auto drop-shadow-[0_8px_24px_rgb(232_176_75/0.45)]" />
        <div>
          <h1 className="text-3xl font-bold text-cream-50">Adventkalender</h1>
          <p className="mt-1 text-cream-200/90">{subline}</p>
        </div>
      </header>

      <div className="grid grid-flow-dense grid-cols-4 gap-2.5" role="list" aria-label="24 Türchen">
        {ORDER.map((day) => {
          const door = ADVENT_DOORS[day - 1]!;
          const isOpen = opened.has(day);
          const openable = !isOpen && day <= maxDoor;
          const isToday = day === todayDay && !isOpen;
          const span = day === BIG ? 'col-span-2 row-span-2' : day === WIDE ? 'col-span-2' : '';
          return (
            <div role="listitem" key={day} className={span}>
              <button
                type="button"
                onClick={() => open(door)}
                aria-label={
                  isOpen ? `Türchen ${day}: ${door.title}` : openable ? `Türchen ${day} öffnen` : `Türchen ${day}, noch verschlossen`
                }
                className={`relative grid h-full w-full place-items-center rounded-2xl font-display font-bold transition active:scale-95 ${
                  day === BIG ? 'min-h-[9.5rem] text-6xl' : 'aspect-square min-h-[4.5rem] text-2xl'
                } ${day === WIDE ? '!aspect-auto' : ''} ${
                  isOpen
                    ? 'bg-cream-100 text-ink-900 shadow-inner ring-1 ring-gold-300'
                    : openable
                      ? `bg-gradient-to-br from-gold-300 to-gold-500 text-ink-900 shadow-lg ${isToday ? 'animate-glow' : ''}`
                      : 'border-2 border-dashed border-gold-300/30 bg-night-700/70 text-cream-200/60 hover:bg-night-700'
                }`}
              >
                {isOpen ? (
                  <>
                    <span className={day === BIG ? 'text-6xl' : 'text-3xl'} aria-hidden>
                      {door.emoji}
                    </span>
                    <span className="absolute top-1 left-2 font-sans text-[0.7rem] font-extrabold text-ink-500">{day}</span>
                  </>
                ) : (
                  <>
                    {day}
                    {!openable ? <Lock className="absolute right-1.5 bottom-1.5 size-3 opacity-50" aria-hidden /> : null}
                    {isToday ? <span className="absolute -top-1 -right-1 animate-twinkle text-base">✨</span> : null}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-sm text-cream-200/80">
        {opened.size} von 24 Türchen geöffnet · jeden Tag ein Stück österreichische Weihnachtstradition
      </p>

      <Sheet
        open={shown !== null}
        onClose={() => setShown(null)}
        title={shown ? `${shown.day}. Dezember · ${shown.title}` : ''}
        image={
          shown ? (
            <p className="mb-2 text-center text-6xl animate-pop" aria-hidden>
              {shown.emoji}
            </p>
          ) : null
        }
      >
        {shown ? <p className="text-lg leading-relaxed text-ink-700">{shown.text}</p> : null}
      </Sheet>
    </div>
  );
}
