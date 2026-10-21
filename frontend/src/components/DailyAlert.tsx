// "Aviso diario", in the forecast tab: opt in to the 9:00 forecast notification. It only works
// with the dashboard installed as an app; in the browser it explains how to install it.
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { alertState, subscribe, syncSubscription, unsubscribe, type AlertState } from '../lib/push';

export function DailyAlert() {
  const [state, setState] = useState<AlertState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    alertState()
      .then((current) => {
        if (!active) {
          return;
        }
        setState(current);
        if (current === 'on') {
          syncSubscription().catch((error: unknown) => console.error(error));
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) {
          setState('unsupported');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const run = async (action: () => Promise<AlertState>) => {
    setBusy(true);
    setFailed(false);
    try {
      setState(await action());
    } catch (error) {
      console.error(error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (state === null) {
    return null;
  }
  return (
    <section className="daily-alert" aria-labelledby="daily-alert-title">
      <h3 id="daily-alert-title">Aviso diario</h3>
      <p>Cada mañana a las 9:00, la previsión del día en tu móvil.</p>
      {state === 'not-installed' && (
        <>
          <p>Primero instala esta web como app:</p>
          <ol>
            <li>iPhone: botón Compartir → «Añadir a pantalla de inicio».</li>
            <li>Android: menú ⋮ → «Instalar app».</li>
          </ol>
          <p>Después ábrela desde su icono y activa aquí el aviso.</p>
        </>
      )}
      {state === 'unsupported' && <p>Tu móvil no admite avisos (en iPhone hace falta iOS 16.4 o superior).</p>}
      {state === 'blocked' && <p>Has bloqueado las notificaciones. Actívalas en los ajustes del móvil.</p>}
      {state === 'off' && (
        <button type="button" disabled={busy} onClick={() => void run(subscribe)}>
          <Bell size={16} aria-hidden="true" /> Avisarme cada mañana
        </button>
      )}
      {state === 'on' && (
        <>
          <p>Recibes la previsión cada día a las 9:00.</p>
          <button type="button" className="secondary" disabled={busy} onClick={() => void run(unsubscribe)}>
            <BellOff size={16} aria-hidden="true" /> Dejar de recibirlo
          </button>
        </>
      )}
      {failed && <p role="alert" className="daily-alert-error">No se pudo completar. Comprueba la conexión e inténtalo de nuevo.</p>}
    </section>
  );
}
