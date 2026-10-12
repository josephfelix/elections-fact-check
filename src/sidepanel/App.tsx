import { useState } from 'react';
import { useCommand, useHealth, useSession, useSettings, useTarget, saveSettings } from './hooks';
import { counts, FILTERS, groupByTopic, type Filter } from './selectors';
import { ClaimDetail, ClaimRow, StatusBadge } from './components';
import { formatOffset } from '../shared/text';
import type { Session, Settings } from '../shared/schemas';

export function App() {
  const session = useSession();
  const { send, error } = useCommand();
  const [selected, setSelected] = useState<string | null>(null);

  if (!session) return <StartScreen send={send} error={error} />;
  const claim = selected ? session.claims[selected] : undefined;
  return (
    <div className="app">
      <Header session={session} send={send} />
      {session.lastError && <div className="banner warn">⚠ {session.lastError}</div>}
      {error && <div className="banner warn">⚠ {error}</div>}
      {claim ? (
        <ClaimDetail claim={claim} session={session} onBack={() => setSelected(null)} send={send} />
      ) : (
        <Board session={session} onSelect={setSelected} send={send} />
      )}
    </div>
  );
}

type Send = ReturnType<typeof useCommand>['send'];

function Header({ session, send }: { session: Session; send: Send }) {
  const c = counts(session);
  const live = session.state === 'capturing';
  return (
    <header className="header">
      <div className="title-row">
        <h1>FactCheck Live</h1>
        <span className={`live ${session.state}`}>
          <i /> {live ? 'Monitorando' : session.state === 'paused' ? 'Pausado' : 'Encerrado'}
        </span>
      </div>
      <div className="meta" title={session.tabTitle}>
        {live && <strong>🔴 Captura de áudio ativa · </strong>}
        {session.tabTitle}
      </div>
      <div className="title-row">
        <div className="counters">
          <span>✔ {c.verified} verificadas</span>
          <span>⏳ {c.pending} pendentes</span>
        </div>
        <div className="actions">
          {session.state === 'capturing' && <button onClick={() => send({ type: 'pause' })}>Pausar</button>}
          {session.state === 'paused' && <button onClick={() => send({ type: 'resume' })}>Retomar</button>}
          {session.state !== 'ended' ? (
            <button className="danger" onClick={() => send({ type: 'end' })}>Encerrar</button>
          ) : (
            <button className="primary" onClick={() => send({ type: 'reset' })}>Nova sessão</button>
          )}
        </div>
      </div>
    </header>
  );
}

function Board({ session, onSelect, send }: { session: Session; onSelect: (id: string) => void; send: Send }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = groupByTopic(session, filter);
  const tail = session.segments.slice(-3);
  const toggle = (id: string) =>
    setCollapsed((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <main>
      <nav className="filters">
        {FILTERS.map((f) => (
          <button key={f.id} className={f.id === filter ? 'chip on' : 'chip'} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </nav>
      {groups.length === 0 && (
        <p className="empty">
          {session.state === 'ended' ? 'Nenhuma afirmação neste filtro.' : 'Ouvindo… os assuntos e afirmações aparecerão aqui conforme a transmissão avança.'}
        </p>
      )}
      {groups.map(({ topic, claims }) => {
        const open = !collapsed.has(topic.id);
        return (
          <section key={topic.id} className="group">
            <button className="group-head" onClick={() => toggle(topic.id)} aria-expanded={open}>
              <span>{open ? '▾' : '▸'} {topic.title.toUpperCase()}</span>
              <span className="count">{claims.length} {claims.length === 1 ? 'afirmação' : 'afirmações'}</span>
            </button>
            {open && claims.map((c) => <ClaimRow key={c.id} claim={c} onOpen={() => onSelect(c.id)} onRecheck={() => send({ type: 'recheck', claimId: c.id })} canRecheck={session.state !== 'ended'} />)}
          </section>
        );
      })}
      <details className="tail">
        <summary>Últimas falas transcritas ({session.segments.length})</summary>
        {tail.length === 0 ? <p className="empty">Nenhuma fala transcrita ainda.</p> : tail.map((g) => (
          <p key={g.id}><time>{formatOffset(g.offsetMs)}</time> {g.text}</p>
        ))}
      </details>
    </main>
  );
}

function StartScreen({ send, error }: { send: Send; error?: string }) {
  const target = useTarget();
  const settings = useSettings();
  const health = useHealth(settings);
  return (
    <div className="app start">
      <h1>FactCheck Live</h1>
      <p>Acompanhe uma transmissão: transcrição, assuntos e checagem de afirmações em um só painel.</p>
      <div className="card">
        <div className="label">Aba selecionada</div>
        <div className="tab-title">{target ? target.title : 'Nenhuma aba selecionada'}</div>
        <small>Para monitorar outra aba, abra-a e clique no ícone da extensão.</small>
      </div>
      <button className="primary big" disabled={!target || health === 'down'} onClick={() => send({ type: 'start' })}>Iniciar monitoramento</button>
      {error && <div className="banner warn">⚠ {error}</div>}
      <div className={`banner ${health === 'ok' ? 'ok' : 'warn'}`}>
        {health === 'checking' && 'Verificando backend…'}
        {health === 'ok' && '✓ Backend conectado e Gemini configurado.'}
        {health === 'no-key' && 'Backend conectado, mas a chave da Gemini API não está configurada no servidor: transcrição e checagem não funcionarão.'}
        {health === 'down' && 'Backend inacessível. Inicie com “npm run server” (veja o README).'}
      </div>
      <p className="privacy">
        🔒 A captura só começa após você clicar em “Iniciar”. O áudio da aba continua tocando normalmente, é enviado em trechos curtos ao seu backend
        (que o repassa ao Gemini para transcrição) e <strong>não é armazenado</strong>. Transcrição e afirmações são enviadas ao provedor do modelo (Google), e as consultas de busca a um mecanismo de busca web, para análise.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}

function SettingsForm({ settings }: { settings: Settings }) {
  const set = (patch: Partial<Settings>) => void saveSettings({ ...settings, ...patch });
  return (
    <details className="settings">
      <summary>Configurações</summary>
      <label>Checagem
        <select value={settings.providerMode} onChange={(e) => set({ providerMode: e.target.value as Settings['providerMode'] })}>
          <option value="grounded">Automática: Gemini + Grounding with Google Search (não é o AI Mode)</option>
          <option value="manual">Manual: abrir no Google AI Mode</option>
        </select>
      </label>
      <label>URL do backend
        <input value={settings.backendUrl} onChange={(e) => set({ backendUrl: e.target.value })} />
      </label>
      <small>Hosts diferentes de localhost:8787 exigem ajustar host_permissions no manifest.</small>
      <label>Token do backend (opcional)
        <input type="password" value={settings.backendToken} onChange={(e) => set({ backendToken: e.target.value })} />
      </label>
    </details>
  );
}

export { StatusBadge };
