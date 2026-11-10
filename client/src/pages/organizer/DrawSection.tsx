import { useState } from 'react';
import { PartyPopper, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import type { AdminView } from '../../../../shared/types';
import { RevealChainList } from '../../components/RevealChainList';
import { Button, ConfirmSheet, useToast } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatTimestampDay } from '../../lib/format';
import { Section, useAction } from './shared';

export function DrawSection({ view, token, reload }: { view: AdminView; token: string; reload: () => Promise<unknown> }) {
  const toast = useToast();
  const { busy, run } = useAction(reload);
  const [confirm, setConfirm] = useState<'draw' | 'reset' | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const { group, participants } = view;
  const total = participants.length;
  const claimed = participants.filter((p) => p.claimed).length;
  const unclaimed = total - claimed;
  const seen = participants.filter((p) => p.revealSeen).length;

  const doDraw = async () => {
    setDrawing(true);
    setDrawError(null);
    try {
      const res = await api.admin.draw(token);
      setConfirm(null);
      toast(
        res.mutualPairs > 0
          ? 'Ausgelost! ✨ (Es ließ sich nicht ganz vermeiden, dass sich zwei gegenseitig beschenken.)'
          : 'Ausgelost! ✨ Jetzt können alle nachschauen.',
      );
      await reload();
    } catch (err) {
      setConfirm(null);
      setDrawError(errorMessage(err));
    } finally {
      setDrawing(false);
    }
  };

  if (!group.drawn) {
    return (
      <Section id="auslosen" title="Auslosen" icon={<Sparkles className="size-5 text-gold-600" />}>
        <div className="flex items-center gap-4">
          <img src="/img/packerl-256.webp" alt="" width={251} height={256} className="h-20 w-auto animate-float" />
          <div className="text-sm text-ink-700">
            {total < 3 ? (
              <p>Zum Auslosen braucht es mindestens 3 Personen.</p>
            ) : (
              <>
                <p className="font-bold text-ink-900">
                  {claimed} von {total} haben ihren Namen ausgewählt.
                </p>
                <p className="mt-1">
                  Du kannst schon auslosen. Alle eingetragenen Personen machen mit und können ihren Namen auch danach auswählen.
                </p>
              </>
            )}
          </div>
        </div>
        {unclaimed > 0 && total >= 3 ? (
          <p role="alert" className="mt-4 text-sm font-semibold text-berry-700">
            {unclaimed === 1 ? '1 Person hat' : `${unclaimed} Personen haben`} noch keinen Namen ausgewählt.
            {' '}{unclaimed === 1 ? 'Sie wird' : 'Sie werden'} trotzdem einbezogen. Bitte stell sicher, dass alle mitmachen.
          </p>
        ) : null}
        {drawError ? (
          <div role="alert" className="mt-4 flex gap-2 rounded-2xl bg-berry-500/10 p-3 text-sm font-semibold text-berry-700">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {drawError}
          </div>
        ) : null}
        <Button className="mt-4 w-full text-lg" disabled={total < 3} onClick={() => setConfirm('draw')}>
          <Sparkles className="size-5" /> Jetzt auslosen
        </Button>
        <ConfirmSheet
          open={confirm === 'draw'}
          onClose={() => !drawing && setConfirm(null)}
          onConfirm={doDraw}
          loading={drawing}
          title="Bereit zum Auslosen?"
          confirmLabel="Christkind, los geht’s! ✨"
        >
          <p>
            Das Christkind lost jetzt für {total} Personen aus. Danach lassen sich Personen und Regeln nicht mehr ändern – außer
            du setzt die Auslosung zurück.
          </p>
          {unclaimed > 0 ? (
            <p className="mt-2 font-bold text-berry-700">
              {unclaimed === 1 ? '1 Person hat' : `${unclaimed} Personen haben`} ihren Namen noch nicht ausgewählt und {unclaimed === 1 ? 'wird' : 'werden'} trotzdem einbezogen.
              {' '}Die Namensauswahl ist auch später über die Einladung möglich; die Zuteilung bleibt gleich.
            </p>
          ) : null}
          <p className="mt-2 font-bold">Jede Person sieht nur die eigene Zuteilung – auch du.</p>
        </ConfirmSheet>
      </Section>
    );
  }

  return (
    <Section
      id="auslosen"
      title="Ausgelost!"
      icon={<PartyPopper className="size-5 text-gold-600" />}
      intro={group.drawnAt ? `Das Christkind hat am ${formatTimestampDay(group.drawnAt)} ausgelost.` : undefined}
    >
      <Progress label="haben schon nachgeschaut" labelOne="hat schon nachgeschaut" value={seen} total={total} />
      {group.revealed ? (
        <div className="mt-6 rounded-2xl bg-gold-100 p-4">
          <h3 className="font-bold">Auflösung</h3>
          <p className="mt-1 text-sm text-ink-700">Alle sehen jetzt, wer wessen Christkind war:</p>
          <div className="mt-3">
            <RevealChainList pairs={view.reveal ?? []} />
          </div>
          <p className="mt-3 text-sm text-ink-500">Alle haben zugestimmt. Diese Veröffentlichung lässt sich nicht rückgängig machen.</p>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setConfirm('reset')}>
          <RotateCcw className="size-4" /> Neu auslosen
        </Button>
      </div>

      <ConfirmSheet
        open={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (await run('reset', () => api.admin.resetDraw(token), 'Auslosung zurückgesetzt')) setConfirm(null);
        }}
        loading={busy === 'reset'}
        title="Auslosung zurücksetzen?"
        confirmLabel="Ja, zurücksetzen"
        variant="berry"
      >
        <p>
          Alle Zuteilungen und alle anonymen Nachrichten werden gelöscht. Danach kannst du Personen und Regeln ändern und neu
          auslosen – und alle müssen nochmal nachschauen.
        </p>
        {seen > 0 ? (
          <p className="mt-2 font-bold text-berry-600">
            Achtung: {seen} {seen === 1 ? 'Person hat' : 'Personen haben'} schon nachgeschaut und vielleicht schon ein Packerl
            besorgt.
          </p>
        ) : null}
      </ConfirmSheet>
    </Section>
  );
}

export function Progress({
  label,
  labelOne = label,
  value,
  total,
}: {
  label: string;
  labelOne?: string;
  value: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-bold text-ink-700">
          {value} von {total} {value === 1 ? labelOne : label}
        </span>
        <span className="text-ink-500">{pct} %</span>
      </div>
      <div
        className="mt-1.5 h-3 overflow-hidden rounded-full bg-cream-300"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-600 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
