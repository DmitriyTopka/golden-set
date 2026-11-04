import React, { useCallback, useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

const TAGLINE = 'See which support answers break when you edit a help article.';

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Setup({ overview, onSaved }) {
  const [sources, setSources] = useState(null);
  const [desk, setDesk] = useState(overview.config?.serviceDeskId || '');
  const [space, setSpace] = useState(overview.config?.spaceKey || '');
  const [error, setError] = useState('');

  useEffect(() => {
    invoke('listSources').then(setSources).catch((e) => setError(e.message));
  }, []);

  const save = async () => {
    setError('');
    try {
      await invoke('saveConfig', { serviceDeskId: desk, spaceKey: space });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!sources) return <p className="muted">{error || 'Loading service projects and spaces…'}</p>;
  return (
    <section className="card">
      <h2>1. Where should Golden Set look?</h2>
      <div className="row">
        <label>
          Service project
          <select value={desk} onChange={(e) => setDesk(e.target.value)}>
            <option value="">Choose…</option>
            {sources.desks.map((d) => (
              <option key={d.id} value={d.id}>{`${d.name} (${d.projectKey})`}</option>
            ))}
          </select>
        </label>
        <label>
          Knowledge base space
          <select value={space} onChange={(e) => setSpace(e.target.value)}>
            <option value="">Choose…</option>
            {sources.spaces.map((s) => (
              <option key={s.key} value={s.key}>{`${s.name} (${s.key})`}</option>
            ))}
          </select>
        </label>
        <button disabled={!desk || !space} onClick={save}>Save</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function useStepper(startFn, stepFn, isDone) {
  const [state, setState] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setRunning(true);
    setError('');
    try {
      let st = startFn ? await startFn() : null;
      setState(st);
      for (let guard = 0; guard < 200 && !(st && isDone(st)); guard += 1) {
        st = await stepFn();
        setState(st);
        if (st?.error) throw new Error(st.error);
      }
      return st;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setRunning(false);
    }
  };
  return { state, running, error, run };
}

function PairTable({ pairs, onToggle }) {
  if (!pairs.length) return <p className="muted">No golden pairs yet. Run a scan.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Request</th>
          <th>Customer question</th>
          <th>Expected answer</th>
          <th>Help article</th>
          <th>Score</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {pairs.map((p) => (
          <tr key={p.id}>
            <td className="mono">{p.id}</td>
            <td>{p.question}</td>
            <td>{p.expected}</td>
            <td>
              {p.articleTitle || '-'}
              {p.link && <span className={`tag ${p.link.method}`}>{p.link.method === 'link' ? 'linked' : 'by fact'}</span>}
            </td>
            <td>{p.score}</td>
            <td>
              <button className="subtle" onClick={() => onToggle(p.id)}>Not golden</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function App() {
  const [overview, setOverview] = useState(null);
  const [pairs, setPairs] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [ov, pr] = await Promise.all([invoke('getOverview'), invoke('getPairs')]);
      setOverview(ov);
      setPairs(pr);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const seed = useStepper(null, () => invoke('seedNext'), (s) => s.phase === 'done');
  const scan = useStepper(
    () => invoke('scanStart'),
    async () => {
      const st = await invoke('scanBatch');
      if (st?.phase === 'selecting') {
        await invoke('scanFinish');
        return { ...st, phase: 'done' };
      }
      return st;
    },
    (s) => s.phase === 'done'
  );

  const exportAll = async () => {
    const files = await invoke('exportCsv', {});
    files.forEach((csv, i) => download(files.length > 1 ? `golden-set-${i + 1}.csv` : 'golden-set.csv', csv));
  };
  const toggle = async (id) => {
    await invoke('markNotGolden', { id, value: true });
    await refresh();
  };

  if (error) return <p className="error">{error}</p>;
  if (!overview || !pairs) return <p className="muted">Loading…</p>;
  const s = pairs.summary;

  return (
    <main>
      <header>
        <h1>Golden Set</h1>
        <p className="tagline">{TAGLINE}</p>
      </header>

      <Setup overview={overview} onSaved={refresh} />

      {overview.config && (
        <section className="card">
          <h2>2. Build the golden set</h2>
          <p className="muted">
            Reads resolved requests in <b>{overview.config.projectName}</b> and help articles in <b>{overview.config.spaceName}</b>. Keeps answers that
            really solved the problem, strips personal data and ties every answer to the article it relies on.
          </p>
          <div className="row">
            <button onClick={async () => { await scan.run(); await refresh(); }} disabled={scan.running}>
              {scan.running ? `Reading requests… ${scan.state?.done ?? 0}/${scan.state?.total ?? '?'}` : 'Scan resolved requests'}
            </button>
            <button className="subtle" onClick={async () => { await seed.run(); await refresh(); }} disabled={seed.running || overview.seed?.phase === 'done'}>
              {seed.running
                ? `Loading demo data… ${seed.state?.phase === 'requests' ? `${seed.state.created.length}/${seed.state.total}` : seed.state?.phase || ''}`
                : overview.seed?.phase === 'done'
                  ? 'Demo data loaded'
                  : 'Load demo data (Northwind Gear)'}
            </button>
          </div>
          {(scan.error || seed.error) && <p className="error">{scan.error || seed.error}</p>}
          {s && (
            <ul className="stats">
              <li><b>{s.requests}</b> resolved requests read</li>
              <li><b>{s.rejected}</b> rejected (reopened, complaint, low CSAT)</li>
              <li><b>{s.duplicates}</b> duplicates folded</li>
              <li><b>{s.selected}</b> golden pairs across <b>{s.articles}</b> articles</li>
            </ul>
          )}
        </section>
      )}

      {s && (
        <section className="card">
          <div className="row spread">
            <h2>3. Golden pairs</h2>
            <button onClick={exportAll} disabled={!pairs.selected.length}>Download CSV for Rovo Evaluations</button>
          </div>
          <PairTable pairs={pairs.selected} onToggle={toggle} />
        </section>
      )}
    </main>
  );
}
